/**
 * La prueba de fuego en forma automática (esquema §17): la misma lista de órdenes da el mismo
 * hash por cuatro caminos (step tick a tick, advance de una vez, advance troceado en tramos al
 * azar y replay), tras serializar, con dos instancias del módulo, con intenciones al azar, y
 * contra los hashes dorados comprometidos en el repositorio. «Rápido = lento» de F1: los
 * flujos acumulados en bloque por advance coinciden con los acumulados tick a tick. Para
 * regenerar los dorados tras un cambio de regla deliberado:
 *
 *     UPDATE_GOLDENS=1 pnpm -F @distritos/sim test
 *
 * y la línea correspondiente en el registro de decisiones.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { hashOf } from '../src/hash.js';
import { hashState } from '../src/index.js';
import { center, key, parse, range } from '../src/hex.js';
import { nextInt, seed, type RngState } from '../src/rng.js';
import { capacityOf } from '../src/rules/elements.js';
import { carriedBy } from '../src/rules/errands.js';
import { validate } from '../src/rules/orders.js';
import { createScene, type SceneParams } from '../src/scene.js';
import { assertAllIntegers, clone, deserialize, serialize } from '../src/serialize.js';
import { advance, replay, step } from '../src/step.js';
import type { CompiledContent } from '../src/types/content.js';
import type { Event } from '../src/types/events.js';
import type { Order, OrderIntent, OrderKind, OrderLog } from '../src/types/orders.js';
import type { SimState } from '../src/types/state.js';
import { view } from '../src/view.js';
import { testContent, testContentNamed } from './content.js';

const content = testContent();
const FIXTURES = join(import.meta.dirname, 'fixtures');
const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface Checkpoint {
  tick: number;
  hash: string;
  view: string;
}

interface Fixture {
  name: string;
  description: string;
  /** Fichero de contenido de prueba (por defecto, content.json, el de F0). */
  content?: string;
  params: SceneParams;
  orders: OrderLog;
  checkpoints: Checkpoint[];
}

function loadFixtures(): { file: string; fixture: Fixture }[] {
  return readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({
      file: join(FIXTURES, f),
      fixture: JSON.parse(readFileSync(join(FIXTURES, f), 'utf8')) as Fixture,
    }));
}

/** Ningún número fuera de los enteros seguros y ningún almacén fuera de [0, capacidad]. */
function checkInvariants(state: SimState, c: CompiledContent): void {
  assertAllIntegers(state);
  for (const e of Object.values(state.elements)) {
    for (const [r, level] of Object.entries(e.store ?? {})) {
      expect(level, `${e.id}.${r}`).toBeGreaterThanOrEqual(0);
      expect(level, `${e.id}.${r}`).toBeLessThanOrEqual(capacityOf(c, e, r));
    }
  }
  for (const a of Object.values(state.actors)) {
    for (const v of Object.values(a.stocks)) expect(v).toBeGreaterThanOrEqual(0);
  }
}

/**
 * Avanza tick a tick con `step`, aplicando las órdenes del registro en su tick. Comprueba los
 * invariantes cada `every` ticks y devuelve los eventos.
 */
function stepwise(
  state: SimState,
  log: OrderLog,
  until: number,
  c: CompiledContent = content,
  every = 1,
): Event[] {
  const events: Event[] = [];
  let i = 0;
  while (state.tick < until) {
    while (i < log.length && log[i]!.tick < state.tick) i++;
    const batch: Order[] = [];
    while (i < log.length && log[i]!.tick === state.tick) batch.push(log[i++]!);
    for (const e of step(state, batch, c)) events.push(e);
    if (state.tick % every === 0) checkInvariants(state, c);
  }
  checkInvariants(state, c);
  return events;
}

/** Avanza con `advance` en tramos de longitud al azar (sembrada): cada corte es un salto distinto. */
function chunked(state: SimState, log: OrderLog, until: number, c: CompiledContent, seedHex: string): void {
  let r: RngState = seed(seedHex, 7);
  while (state.tick < until) {
    const [n, next] = nextInt(r, 2_000);
    r = next;
    advance(state, log, Math.min(until, state.tick + 1 + n), c);
  }
}

function viewer(params: SceneParams): string {
  return params.actors[0]!.id;
}

describe('fixtures dorados', () => {
  for (const { file, fixture } of loadFixtures()) {
    const c = testContentNamed(fixture.content);
    it(`${fixture.name}: step, advance, advance troceado y replay dan los mismos hashes`, () => {
      const actor = viewer(fixture.params);
      const log = [...fixture.orders].sort((a, b) => (a.tick !== b.tick ? a.tick - b.tick : a.seq - b.seq));
      const byStep = createScene(fixture.params, c);
      const byAdvance = createScene(fixture.params, c);
      const byChunks = createScene(fixture.params, c);
      const computed: Checkpoint[] = [];
      for (const cp of fixture.checkpoints) {
        stepwise(byStep, log, cp.tick, c);
        advance(byAdvance, log, cp.tick, c);
        chunked(byChunks, log, cp.tick, c, fixture.params.seed);
        const byReplay = replay(fixture.params, log, cp.tick, c);
        const hash = hashState(byStep);
        expect(byStep.tick).toBe(cp.tick);
        expect(hashState(byAdvance)).toBe(hash);
        expect(hashState(byChunks)).toBe(hash);
        expect(hashState(byReplay)).toBe(hash);
        const vh = hashState(byStep, { actor });
        expect(hashState(byAdvance, { actor })).toBe(vh);
        computed.push({ tick: cp.tick, hash, view: vh });
      }
      if (UPDATE) {
        fixture.checkpoints = computed;
        writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
        return;
      }
      for (let i = 0; i < computed.length; i++) {
        const want = fixture.checkpoints[i]!;
        const got = computed[i]!;
        expect(want.hash, `dorado del tick ${got.tick} (UPDATE_GOLDENS=1 para regenerar)`).toBe(got.hash);
        expect(want.view, `vista dorada del tick ${got.tick}`).toBe(got.view);
      }
    });

    it(`${fixture.name}: la serialización conserva el hash y el estado es JSON de enteros`, () => {
      const s = replay(fixture.params, fixture.orders, fixture.checkpoints.at(-1)!.tick, c);
      const text = serialize(s);
      const back = deserialize(text) as SimState;
      expect(hashOf(back)).toBe(hashState(s));
      expect(serialize(back)).toBe(text);
      expect(hashState(clone(s))).toBe(hashState(s));
      assertAllIntegers(s);
    });

    it(`${fixture.name}: la vista no contiene lo oculto ni el generador`, () => {
      const s = replay(fixture.params, fixture.orders, fixture.checkpoints.at(-1)!.tick, c);
      const v = view(s, viewer(fixture.params)) as unknown as Record<string, unknown>;
      expect(v.hidden).toBeUndefined();
      expect(v.rng).toBeUndefined();
      expect(v.counters).toBeUndefined();
      expect(serialize(v)).not.toContain('sectorContents');
    });
  }
});

describe('aislamiento', () => {
  it('dos instancias del módulo dan el mismo hash: no hay estado de módulo', async () => {
    for (const { fixture } of loadFixtures()) {
      const c = testContentNamed(fixture.content);
      const until = fixture.checkpoints.at(-1)!.tick;
      vi.resetModules();
      const a = await import('../src/index.js');
      const ha = a.hashState(a.replay(fixture.params, fixture.orders, until, c));
      vi.resetModules();
      const b = await import('../src/index.js');
      const hb = b.hashState(b.replay(fixture.params, fixture.orders, until, c));
      expect(a).not.toBe(b);
      expect(hb).toBe(ha);
    }
  });
});

describe('fuzz', () => {
  const params: SceneParams = {
    kind: 'district',
    template: 'f0_dos',
    seed: 'c0ffee0000c0ffee',
    actors: [
      { id: 'a', plot: 'p1' },
      { id: 'b', plot: 'p2' },
    ],
  };

  /** Intenciones al azar, válidas e inválidas, deterministas a partir de una semilla. */
  function generateLog(seedHex: string, ticks: number, perTick: number): OrderLog {
    const base = createScene(params, content);
    const elements = Object.keys(base.elements).sort();
    const hexes = range(parse('0,0'), 9).map(key);
    const actors = ['a', 'b', 'sys', 'nadie'];
    const mobiles = ['m1', 'm2', 'm9'];
    let r: RngState = seed(seedHex, 0);
    const draw = (n: number): number => {
      const [v, next] = nextInt(r, n);
      r = next;
      return v;
    };
    const log: OrderLog = [];
    let seq = 0;
    for (let tick = 0; tick < ticks; tick++) {
      if (draw(4) !== 0) continue;
      const n = 1 + draw(perTick);
      for (let k = 0; k < n; k++) {
        const actor = actors[draw(actors.length)]!;
        let intent: OrderIntent;
        switch (draw(6)) {
          case 0:
          case 1:
            intent = {
              actor,
              kind: 'move',
              args: { mobile: mobiles[draw(mobiles.length)]!, to: elements[draw(elements.length)]! },
            };
            break;
          case 2:
          case 3:
            intent = {
              actor,
              kind: 'reveal',
              args: { mobile: mobiles[draw(mobiles.length)]!, hex: hexes[draw(hexes.length)]! },
            };
            break;
          case 4:
            intent = {
              actor,
              kind: 'credit',
              args: { actor: actors[draw(2)]!, resource: 'energia', amount: 1 + draw(500_000), ref: 'fuzz' },
            };
            break;
          default:
            intent = {
              actor,
              kind: 'debit',
              args: { actor: actors[draw(2)]!, resource: 'energia', amount: 1 + draw(500_000), ref: 'fuzz' },
            };
        }
        log.push({ seq: ++seq, tick, ...intent });
      }
    }
    return log;
  }

  it('dos ejecuciones coinciden, replay coincide con vivo, y nada deja de ser entero', () => {
    for (const s of ['01', '02', '03']) {
      const log = generateLog(s, 3000, 3);
      const live = createScene(params, content);
      stepwise(live, log, 3000);
      const again = createScene(params, content);
      stepwise(again, log, 3000);
      expect(hashState(again)).toBe(hashState(live));
      expect(hashState(replay(params, log, 3000, content))).toBe(hashState(live));
      const fast = createScene(params, content);
      advance(fast, log, 3000, content);
      expect(hashState(fast)).toBe(hashState(live));
      for (const actor of ['a', 'b']) expect(hashState(fast, { actor })).toBe(hashState(live, { actor }));
      // Algo tiene que haber pasado de verdad.
      expect(
        Object.keys(live.map.sectors).filter((k) => live.map.sectors[k]!.status === 'revealed').length,
      ).toBeGreaterThan(2);
    }
  });

  it('un actor nunca ve los sectores ajenos no concedidos', () => {
    const log = generateLog('07', 2000, 3);
    const s = replay(params, log, 2000, content);
    const va = view(s, 'a');
    for (const [k, sector] of Object.entries(va.map.sectors)) {
      const plot = s.map.sectors[k]!.plot;
      if (plot === 'p2') expect(sector.status).toBe('unknown');
      if (plot === 'p1' || plot === null) expect(sector.status).not.toBe('unknown');
    }
    for (const e of Object.values(va.elements)) expect(s.map.sectors[e.sector]!.plot).not.toBe('p2');
    expect((va.actors.b as { stocks?: unknown }).stocks).toBeUndefined();
  });
});

describe.each([
  ['los flujos de F1', 'content-f1.json'],
  ['los recados de F1', 'content-f1r.json'],
  ['la tanda 6 de F1 (curva, jornada, nombres, recados por tipo)', 'content-f1t.json'],
])('rápido = lento con %s', (_name, file) => {
  const c1 = testContentNamed(file);
  const errands = c1.errands !== undefined;
  const names = c1.actions.name !== undefined;
  const encargos = (c1.board?.encargos.length ?? 0) > 0;
  // Con recados se sortean también rutas, cortes y descargas; con nombres, renombrar; sin
  // encargos en la pizarra, no se entrega.
  const KINDS: readonly OrderKind[] = [
    'move',
    'reveal',
    'build',
    'build',
    'link',
    'link',
    'job',
    'job',
    'job',
    'toggle',
    'hire',
    ...(encargos ? (['deliver', 'deliver'] as const) : []),
    ...(errands ? (['route', 'route', 'cancel', 'unload'] as const) : []),
    ...(names ? (['rename', 'route'] as const) : []),
    'credit',
  ];
  const NAMES = ['A Eira', 'Casa de Arriba', '', ' x', 'x'.repeat(40), 'Lúa'];
  const params: SceneParams = {
    kind: 'district',
    template: 'f1_dos',
    seed: 'f1f1000000f1f100',
    actors: [
      { id: 'a', plot: 'p1' },
      { id: 'b', plot: 'p2' },
    ],
  };
  const TASKS = ['sacar_agua', 'recoger', 'talar', 'picar', 'limpiar', 'volar'];
  const LINKS = ['cable', 'canal', 'camino', 'tubo'];
  const BUILDS = ['taller', 'cobertizo', 'bomba', 'castillo'];
  const LAT = { hexW: 86_602, hexH: 75_000 };

  /**
   * Registro adaptativo y sembrado: en cada tick elegido se sortean varias intenciones de todos
   * los tipos contra el estado vivo y se prefieren las válidas, sin dejar de meter inválidas.
   * Así el registro construye, cablea, enciende, contrata y entrega de verdad.
   */
  function generate(seedHex: string, ticks: number): OrderLog {
    const live = createScene(params, c1);
    let r: RngState = seed(seedHex, 0);
    const draw = (n: number): number => {
      const [v, next] = nextInt(r, n);
      r = next;
      return v;
    };
    const pick = <T>(list: readonly T[]): T => list[draw(list.length)]!;
    const log: OrderLog = [];
    let seq = 0;
    for (let tick = 0; tick < ticks; tick += 1 + draw(150)) {
      advance(live, log, tick, c1);
      for (let k = 1 + draw(3); k > 0; k--) {
        const actor = draw(10) === 0 ? pick(['sys', 'nadie']) : pick(['a', 'b']);
        const own = (id: string): boolean => live.elements[id]?.owner === actor;
        const elements = Object.keys(live.elements).sort();
        const mine = elements.filter(own);
        const mobiles = [
          ...Object.keys(live.mobiles)
            .filter((m) => live.mobiles[m]!.owner === actor)
            .sort(),
          'm9',
        ];
        const anyElement = (): string =>
          mine.length > 0 && draw(4) !== 0 ? pick(mine) : pick([...elements, 'e99']);
        const plot = live.actors[actor]?.plot ?? 'p1';
        const sectors = Object.keys(live.map.sectors)
          .filter((h) => live.map.sectors[h]!.plot === plot)
          .sort();
        // Con recados: un obrero parado con carga deja su carga a menudo (si no, casi nunca se ve).
        const stranded = mobiles.filter((m) => {
          const mob = live.mobiles[m];
          return mob?.job === null && mob.where.kind === 'at' && carriedBy(live, m).length > 0;
        });
        const candidate = (): OrderIntent => {
          if (errands && stranded.length > 0 && draw(2) === 0) {
            return { actor, kind: 'unload', args: { mobile: pick(stranded) } };
          }
          const kind: OrderKind = pick(KINDS);
          switch (kind) {
            case 'move':
              return { actor, kind, args: { mobile: pick(mobiles), to: anyElement() } };
            case 'reveal':
              return { actor, kind, args: { mobile: pick(mobiles), hex: pick([...sectors, '3,-1', '9,9']) } };
            case 'build': {
              const h = parse(pick(sectors));
              const c = center(h, LAT);
              const pos = { x: c.x + draw(60_001) - 30_000, y: c.y + draw(60_001) - 30_000 };
              return { actor, kind, args: { mobile: pick(mobiles), kind: pick(BUILDS), pos } };
            }
            case 'link':
              return {
                actor,
                kind,
                args: { mobile: pick(mobiles), kind: pick(LINKS), from: anyElement(), to: anyElement() },
              };
            case 'job':
              return {
                actor,
                kind,
                args: { mobile: pick(mobiles), element: anyElement(), task: pick(TASKS) },
              };
            case 'toggle':
              return { actor, kind, args: { element: anyElement(), on: draw(3) !== 0 } };
            case 'hire':
              return { actor, kind, args: { kind: pick(['obrero_peon', 'obrero_peon', 'obrero_jefe']) } };
            case 'deliver': {
              const id = live.district.board?.encargo?.id ?? 1;
              return { actor, kind, args: { mobile: pick(mobiles), encargo: draw(5) === 0 ? id + 1 : id } };
            }
            case 'route': {
              const places = elements.filter((e) => c1.places?.[live.elements[e]!.kind] !== undefined);
              const pool = places.length > 0 ? places : elements;
              const stops: string[] = [];
              // Con la tanda 6, la mitad de las rutas van de un sitio con recados a sus destinos:
              // al azar casi nunca coinciden y no se verían recoger los de hacer ni los de casa.
              const waiting = Object.values(live.district.errands?.items ?? {})
                .filter((r) => r.at !== null && (r.holder === undefined || r.holder === actor))
                .sort((x, y) => x.id - y.id);
              if (names && waiting.length > 0 && draw(2) === 0) {
                const r = pick(waiting);
                stops.push(r.at!, r.to);
                for (let n = draw(3); n > 0; n--) stops.push(pick(pool));
              } else {
                for (let n = 1 + draw(5); n > 0; n--) stops.push(draw(12) === 0 ? anyElement() : pick(pool));
              }
              return { actor, kind, args: { mobile: pick(mobiles), stops } };
            }
            case 'cancel': {
              const onRoute = mobiles.filter((m) => live.mobiles[m]?.job?.kind === 'route');
              return { actor, kind, args: { mobile: onRoute.length > 0 ? pick(onRoute) : pick(mobiles) } };
            }
            case 'unload': {
              const loaded = mobiles.filter((m) => carriedBy(live, m).length > 0);
              return { actor, kind, args: { mobile: loaded.length > 0 ? pick(loaded) : pick(mobiles) } };
            }
            case 'rename':
              return draw(3) === 0
                ? { actor, kind, args: { mobile: pick(mobiles), name: pick(NAMES) } }
                : { actor, kind, args: { element: anyElement(), name: pick(NAMES) } };
            default:
              return {
                actor: 'sys',
                kind: draw(2) === 0 ? 'credit' : 'debit',
                args: {
                  actor: pick(['a', 'b']),
                  resource: pick(['eagles', 'comida', 'madera', 'energia']),
                  amount: 1 + draw(20),
                  ref: 'fuzz',
                },
              };
          }
        };
        let intent = candidate();
        for (let tries = 0; tries < 12 && validate(live, intent, c1) !== null && draw(5) !== 0; tries++) {
          intent = candidate();
        }
        log.push({ seq: ++seq, tick, ...intent });
      }
    }
    return log;
  }

  function accepted(log: OrderLog, events: Event[]): Record<string, number> {
    const rejected = new Set(events.flatMap((e) => (e.kind === 'rejected' ? [e.seq] : [])));
    const out: Record<string, number> = {};
    for (const o of log) if (!rejected.has(o.seq)) out[o.kind] = (out[o.kind] ?? 0) + 1;
    return out;
  }

  it('tick a tick, de una vez, a trozos y repetido dan el mismo estado durante cuatro días', () => {
    const totals: Record<string, number> = {};
    for (const s of ['01', '02', '03']) {
      const until = 24_000;
      const log = generate(s, until);
      const live = createScene(params, c1);
      const fast = createScene(params, c1);
      const parts = createScene(params, c1);
      const events: Event[] = [];
      for (const t of [3_000, 7_500, 12_000, 18_000, until]) {
        events.push(...stepwise(live, log, t, c1, 997));
        advance(fast, log, t, c1);
        chunked(parts, log, t, c1, s);
        expect(hashState(fast), `advance en ${t} (semilla ${s})`).toBe(hashState(live));
        expect(hashState(parts), `advance troceado en ${t} (semilla ${s})`).toBe(hashState(live));
        for (const actor of ['a', 'b']) expect(hashState(fast, { actor })).toBe(hashState(live, { actor }));
      }
      expect(hashState(replay(params, log, until, c1))).toBe(hashState(live));
      for (const [k, n] of Object.entries(accepted(log, events))) totals[k] = (totals[k] ?? 0) + n;
    }
    // Algo tiene que haber pasado de verdad: cada orden de F1 se ha aceptado alguna vez.
    const kinds = errands
      ? ['build', 'link', 'job', 'reveal', 'move', 'route', 'cancel', 'unload']
      : ['build', 'link', 'job', 'toggle', 'hire', 'reveal', 'move'];
    if (encargos) kinds.push('deliver');
    if (names) kinds.push('rename');
    for (const k of kinds) {
      expect(totals[k] ?? 0, `órdenes ${k} aceptadas`).toBeGreaterThan(0);
    }
  });
});
