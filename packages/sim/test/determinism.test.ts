/**
 * La prueba de fuego de F0 en forma automática (esquema §17): la misma lista de órdenes da
 * el mismo hash, por tres caminos (step en bucle, advance, replay), tras serializar, con dos
 * instancias del módulo, con intenciones al azar, y contra los hashes dorados comprometidos
 * en el repositorio. Para regenerar los dorados tras un cambio de regla deliberado:
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
import { key, parse, range } from '../src/hex.js';
import { nextInt, seed, type RngState } from '../src/rng.js';
import { createScene, type SceneParams } from '../src/scene.js';
import { assertAllIntegers, clone, deserialize, serialize } from '../src/serialize.js';
import { advance, replay, step } from '../src/step.js';
import type { Order, OrderIntent, OrderLog } from '../src/types/orders.js';
import type { SimState } from '../src/types/state.js';
import { view } from '../src/view.js';
import { testContent } from './content.js';

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

/** Avanza tick a tick con `step`, aplicando las órdenes del registro en su tick. */
function stepwise(state: SimState, log: OrderLog, until: number): void {
  let i = 0;
  while (state.tick < until) {
    while (i < log.length && log[i]!.tick < state.tick) i++;
    const batch: Order[] = [];
    while (i < log.length && log[i]!.tick === state.tick) batch.push(log[i++]!);
    step(state, batch, content);
    assertAllIntegers(state);
  }
}

function viewer(params: SceneParams): string {
  return params.actors[0]!.id;
}

describe('fixtures dorados', () => {
  for (const { file, fixture } of loadFixtures()) {
    it(`${fixture.name}: step, advance y replay dan los mismos hashes`, () => {
      const actor = viewer(fixture.params);
      const log = [...fixture.orders].sort((a, b) => (a.tick !== b.tick ? a.tick - b.tick : a.seq - b.seq));
      const byStep = createScene(fixture.params, content);
      const byAdvance = createScene(fixture.params, content);
      const computed: Checkpoint[] = [];
      for (const cp of fixture.checkpoints) {
        stepwise(byStep, log, cp.tick);
        advance(byAdvance, log, cp.tick, content);
        const byReplay = replay(fixture.params, log, cp.tick, content);
        const hash = hashState(byStep);
        expect(byStep.tick).toBe(cp.tick);
        expect(hashState(byAdvance)).toBe(hash);
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
      const s = replay(fixture.params, fixture.orders, fixture.checkpoints.at(-1)!.tick, content);
      const text = serialize(s);
      const back = deserialize(text) as SimState;
      expect(hashOf(back)).toBe(hashState(s));
      expect(serialize(back)).toBe(text);
      expect(hashState(clone(s))).toBe(hashState(s));
      assertAllIntegers(s);
    });

    it(`${fixture.name}: la vista no contiene lo oculto ni el generador`, () => {
      const s = replay(fixture.params, fixture.orders, fixture.checkpoints.at(-1)!.tick, content);
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
    const { fixture } = loadFixtures()[0]!;
    const until = fixture.checkpoints.at(-1)!.tick;
    vi.resetModules();
    const a = await import('../src/index.js');
    const ha = a.hashState(a.replay(fixture.params, fixture.orders, until, content));
    vi.resetModules();
    const b = await import('../src/index.js');
    const hb = b.hashState(b.replay(fixture.params, fixture.orders, until, content));
    expect(a).not.toBe(b);
    expect(hb).toBe(ha);
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
