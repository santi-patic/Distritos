/**
 * Semana simulada de la prueba de fuego de F1 (diseño de la casa §10) con las tablas reales.
 *
 * Un jugador entra diez minutos al día a la misma hora local. Decide al entrar y cada pocos
 * minutos: mientras está, solo hace lo que termina antes de irse (llevar algo al encargo, lo que
 * la primera vez dura minutos); en la última decisión deja a cada obrero libre con algo que
 * dure horas. Para cada obrero prueba, por este orden: construir lo siguiente del guion (cobertizo,
 * bomba, taller) si llega, cablear y regar con la bomba, juntar el material que le falta, abrir un
 * sector (hasta siete), el camino de la casa a la huerta, llevar algo al encargo, recoger la
 * huerta, una ruta de recados que pague (un obrero como mucho), trabajar en la obra del encargo,
 * limpiar un panel y sacar agua; con el material juntado y sin Águilas, primero ganarlas.
 * Contrata cuando la bomba ya riega la huerta.
 *
 * No es un jugador óptimo: es una cota de lo que da la casa con estos números, para contrastar el
 * guion antes de la prueba con personas. Con SEMANA=<fichero> escribe el informe día a día.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RULES_VERSION,
  advance,
  available,
  type CompiledContent,
  createScene,
  hashState,
  hex as H,
  levelOf,
  placeIds,
  quote,
  replay,
  validate,
  type Element,
  type Event,
  type Mobile,
  type Order,
  type OrderIntent,
  type OrderKind,
  type SceneParams,
  type SimState,
  type Vec,
} from '@distritos/sim';
import { compile, content as loadContent, tables, type RawTables } from '../src/index.js';

const real = loadContent();
const scene = real.scenes.district;
const MIN = 60_000 / scene.tickMs;
const HOUR = 60 * MIN;
const DAY = scene.dayTicks;
const ACTOR = 'local';
const SEED = 'f1f1f1f1f1f1f1f1';
/** Lo que dura una sesión y cuándo decide el jugador dentro de ella (minutos desde que entra). */
const SESSION = 10 * MIN;
const DECISIONS = [0, 3 * MIN, 6 * MIN, 9 * MIN];
const DAYS = 7;
/** El guion de la semana construye en este orden (diseño de la casa §10). */
const BUILD_ORDER = ['cobertizo', 'bomba', 'taller'];
/** Sectores abiertos (con el de la casa) que pide el guion al final de la semana. */
const GOAL_SECTORS = 7;
/** Lo que el jugador no gasta de la batería ni de la despensa al llevar algo al encargo. */
const KEEP = { energia: 720_000, comida: 4 };

function els(s: SimState, kind?: string): Element[] {
  return Object.keys(s.elements)
    .sort()
    .map((id) => s.elements[id])
    .filter((e): e is Element => e !== undefined && (kind === undefined || e.kind === kind));
}

function mine(s: SimState, kind: string): Element[] {
  return els(s, kind).filter((e) => e.owner === ACTOR);
}

function workers(s: SimState): Mobile[] {
  return Object.keys(s.mobiles)
    .sort()
    .map((id) => s.mobiles[id])
    .filter((m): m is Mobile => m?.owner === ACTOR);
}

function revealed(s: SimState): string[] {
  return Object.keys(s.map.sectors)
    .sort()
    .filter((k) => s.map.sectors[k]?.status === 'revealed' && s.map.sectors[k]?.plot === 'p1');
}

function hasCamino(s: SimState): boolean {
  return Object.values(s.links).some((l) => l.kind === 'camino');
}

function kwh(j: number): string {
  return (j / 3_600_000).toFixed(2);
}

interface Candidate {
  kind: OrderKind;
  args: unknown;
  note: string;
}

class Player {
  readonly s: SimState;
  readonly log: Order[] = [];
  readonly events: Event[] = [];
  notes: string[] = [];
  private seq = 0;

  constructor(
    readonly params: SceneParams,
    readonly c: CompiledContent,
  ) {
    this.s = createScene(params, c);
  }

  /** Hora local de un tick: «día 2, 09:03». */
  clock(tick: number): string {
    const t = tick + (this.params.dayOffset ?? 0);
    const day = Math.floor(t / DAY) - Math.floor((this.params.dayOffset ?? 0) / DAY) + 1;
    const m = Math.floor((t % DAY) / MIN);
    return `día ${day}, ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  /** Da una orden si vale (y, si se pide, si termina antes de `by`); avanza un tick. */
  give(cand: Candidate, by: number | null): boolean {
    const intent = { actor: ACTOR, kind: cand.kind, args: cand.args } as OrderIntent;
    const c = this.c;
    if (validate(this.s, intent, c) !== null) return false;
    const q = quote(this.s, intent, c);
    if (by !== null && (q?.end ?? this.s.tick) > by) return false;
    this.seq += 1;
    this.log.push({ seq: this.seq, tick: this.s.tick, ...intent });
    this.events.push(...advance(this.s, this.log, this.s.tick + 1, c));
    const ends = q?.end === null || q?.end === undefined ? '' : `, hasta ${this.clock(q.end)}`;
    this.notes.push(`${cand.note}${ends}`);
    return true;
  }

  until(tick: number): void {
    this.events.push(...advance(this.s, this.log, tick, this.c));
  }
}

/** Puntos donde probar a construir: en los sectores propios abiertos, de dentro afuera. */
function buildSpots(s: SimState): Vec[] {
  const lat = { hexW: s.scene.hexW, hexH: s.scene.hexH };
  const out: Vec[] = [];
  const keys = revealed(s).sort((a, b) => {
    const d = H.distance(H.parse(a), { q: 0, r: 0 }) - H.distance(H.parse(b), { q: 0, r: 0 });
    return d !== 0 ? d : a.localeCompare(b);
  });
  for (const k of keys) {
    const ctr = H.center(H.parse(k), lat);
    for (let dx = -36_000; dx <= 36_000; dx += 12_000)
      for (let dy = -36_000; dy <= 36_000; dy += 12_000)
        if (dx * dx + dy * dy <= 40_000 * 40_000) out.push({ x: ctr.x + dx, y: ctr.y + dy });
  }
  return out;
}

/** Ruta de recados que más cobra entre las vueltas por todos los sitios (simulándolas). */
function bestRoute(p: Player, m: Mobile): Candidate | null {
  const c = p.c;
  const ids = placeIds(p.s, c);
  const pos = ids.map((id) => p.s.elements[id]?.pos ?? { x: 0, y: 0 });
  const cx = pos.reduce((a, v) => a + v.x, 0) / pos.length;
  const cy = pos.reduce((a, v) => a + v.y, 0) / pos.length;
  const ring = ids
    .map((id, i) => ({ id, a: Math.atan2((pos[i]?.y ?? 0) - cy, (pos[i]?.x ?? 0) - cx) }))
    .sort((a, b) => a.a - b.a)
    .map((x) => x.id);
  const max = c.errands?.maxStops ?? 0;
  let best: { stops: string[]; pay: number; n: number } | null = null;
  for (const dir of [1, -1]) {
    for (let i = 0; i < ring.length; i++) {
      const stops: string[] = [];
      for (let k = 0; k < Math.min(max, ring.length + 1); k++)
        stops.push(ring[(((i + dir * k) % ring.length) + ring.length) % ring.length] ?? '');
      const intent = { actor: ACTOR, kind: 'route', args: { mobile: m.id, stops } } as OrderIntent;
      if (validate(p.s, intent, c) !== null) continue;
      const end = quote(p.s, intent, c)?.end ?? p.s.tick;
      const copy = structuredClone(p.s);
      const order = { seq: 1_000_000, tick: copy.tick, ...intent } as Order;
      const evs = advance(copy, [order], end + 1, c);
      let pay = 0;
      let n = 0;
      for (const e of evs)
        if (e.kind === 'errand_delivered' && e.mobile === m.id) {
          pay += e.pay;
          n += 1;
        }
      if (best === null || pay > best.pay) best = { stops, pay, n };
    }
  }
  if (best === null || best.pay <= 0) return null;
  return {
    kind: 'route',
    args: { mobile: m.id, stops: best.stops },
    note: `${m.name ?? m.id}: ruta de ${best.stops.length} paradas (${best.n} recados, ${best.pay} Águilas)`,
  };
}

/** Lo que el jugador probaría con un obrero libre, por orden. */
function options(p: Player, m: Mobile): Candidate[] {
  const s = p.s;
  const c = p.c;
  const who = m.name ?? m.id;
  const others = workers(s).filter((w) => w.id !== m.id);
  const building = (k: string): boolean => others.some((w) => w.job?.kind === 'build' && w.job.what === k);
  const next = BUILD_ORDER.find((k) => mine(s, k).length === 0 && !building(k));
  const cost = next === undefined ? {} : (c.builds?.[next]?.cost ?? {});
  const short = (res: string, extra = 0): boolean => available(s, c, ACTOR, res) < (cost[res] ?? 0) + extra;
  const build: Candidate[] = [];
  if (next !== undefined) {
    for (const pos of buildSpots(s)) {
      const args = { mobile: m.id, kind: next, pos };
      if (validate(s, { actor: ACTOR, kind: 'build', args }, c) === null) {
        build.push({ kind: 'build', args, note: `${who}: construir ${next}` });
        break;
      }
    }
  }
  // La bomba: cable desde la batería y canal hasta la huerta.
  const bomba = mine(s, 'bomba')[0];
  const huerta = mine(s, 'huerta')[0];
  const bateria = mine(s, 'bateria')[0];
  const casa = mine(s, 'casa')[0];
  const wire: Candidate[] = [];
  if (bomba !== undefined && bateria !== undefined)
    wire.push({
      kind: 'link',
      args: { mobile: m.id, kind: 'cable', from: bateria.id, to: bomba.id },
      note: `${who}: cable de la batería a la bomba`,
    });
  if (bomba !== undefined && huerta !== undefined)
    wire.push({
      kind: 'link',
      args: { mobile: m.id, kind: 'canal', from: bomba.id, to: huerta.id },
      note: `${who}: canal de la bomba a la huerta`,
    });
  // El material que le falta a lo siguiente (y la piedra del camino, si no está).
  const gather: Candidate[] = [];
  for (const [res, task] of [
    ['madera', 'talar'],
    ['piedra', 'picar'],
  ] as const) {
    // Lo que ya están juntando los otros obreros cuenta.
    const each = c.tasks?.[task]?.gives?.[res] ?? 0;
    const coming = others.filter((w) => w.job?.kind === 'task' && w.job.task === task).length * each;
    if (!short(res, (res === 'piedra' && !hasCamino(s) ? 5 : 0) - coming)) continue;
    for (const e of mine(s, res))
      gather.push({ kind: 'job', args: { mobile: m.id, element: e.id, task }, note: `${who}: ${task}` });
  }
  const camino: Candidate[] =
    casa !== undefined && huerta !== undefined && (next !== 'bomba' || !short('piedra', 5))
      ? [
          {
            kind: 'link',
            args: { mobile: m.id, kind: 'camino', from: casa.id, to: huerta.id },
            note: `${who}: camino de la casa a la huerta`,
          },
        ]
      : [];
  // El encargo: llevar algo si sobra, o trabajar en la obra.
  const enc = s.district.board?.encargo ?? null;
  const carry: Candidate[] = [];
  const obra: Candidate[] = [];
  if (enc !== null && enc.reserved < enc.amount) {
    if (enc.work) {
      obra.push({
        kind: 'deliver',
        args: { mobile: m.id, encargo: enc.id },
        note: `${who}: obra del encargo`,
      });
    } else {
      const keep = KEEP[enc.resource as keyof typeof KEEP];
      const left = available(s, c, ACTOR, enc.resource) - Math.min(enc.perTrip, enc.amount - enc.reserved);
      if (left >= keep)
        carry.push({
          kind: 'deliver',
          args: { mobile: m.id, encargo: enc.id },
          note: `${who}: llevar ${enc.resource} al encargo`,
        });
    }
  }
  const harvest: Candidate[] =
    huerta !== undefined && levelOf(huerta, 'comida') >= 2
      ? [
          {
            kind: 'job',
            args: { mobile: m.id, element: huerta.id, task: 'recoger' },
            note: `${who}: recoger la huerta`,
          },
        ]
      : [];
  // Una ruta de recados, con un obrero como mucho.
  const onRoute = others.some((w) => w.job?.kind === 'route');
  const route = onRoute ? null : bestRoute(p, m);
  const errands: Candidate[] = route === null ? [] : [route];
  // Abrir el sector oculto más cercano junto a uno abierto (que no esté abriendo otro).
  const open = new Set(revealed(s));
  const opening = new Set(others.map((w) => (w.job?.kind === 'reveal' ? w.job.hex : '')));
  const hex = Object.keys(s.map.sectors)
    .filter((k) => s.map.sectors[k]?.plot === 'p1' && s.map.sectors[k]?.status === 'hidden')
    .filter((k) => !opening.has(k) && H.neighbors(H.parse(k)).some((n) => open.has(H.key(n))))
    .sort((a, b) => {
      const d = H.distance(H.parse(a), { q: 0, r: 0 }) - H.distance(H.parse(b), { q: 0, r: 0 });
      return d !== 0 ? d : a.localeCompare(b);
    })[0];
  const explore: Candidate[] =
    hex === undefined || open.size >= GOAL_SECTORS
      ? []
      : [{ kind: 'reveal', args: { mobile: m.id, hex }, note: `${who}: abrir ${hex}` }];
  // Mantenimiento: el panel más sucio, si lo está bastante; agua para la huerta sin bomba.
  const care: Candidate[] = [];
  const dirty = mine(s, 'panel')
    .filter((e) => (e.wear ?? 0) >= 150)
    .sort((a, b) => (b.wear ?? 0) - (a.wear ?? 0))[0];
  if (dirty !== undefined)
    care.push({
      kind: 'job',
      args: { mobile: m.id, element: dirty.id, task: 'limpiar' },
      note: `${who}: limpiar un panel`,
    });
  const pozo = mine(s, 'pozo')[0];
  if (pozo !== undefined && bomba === undefined && levelOf(pozo, 'agua') < 100)
    care.push({
      kind: 'job',
      args: { mobile: m.id, element: pozo.id, task: 'sacar_agua' },
      note: `${who}: sacar agua`,
    });
  // Con el material de lo siguiente ya juntado y sin Águilas, primero ganarlas.
  const needEagles = next !== undefined && !short('madera') && !short('piedra') && short('eagles');
  const earn = [...carry, ...errands, ...obra];
  return needEagles
    ? [...build, ...wire, ...earn, ...harvest, ...explore, ...camino, ...care]
    : [
        ...build,
        ...wire,
        ...gather,
        ...explore,
        ...camino,
        ...carry,
        ...harvest,
        ...errands,
        ...obra,
        ...care,
      ];
}

interface DayRow {
  day: number;
  did: string[];
  sectors: number;
  finds: string[];
  buildings: string[];
  workers: number;
  eagles: number;
  comida: number;
  energia: string;
  madera: number;
  piedra: number;
  errands: number;
  encargos: number;
  hungry: number;
}

interface Plan {
  /** Horas locales de las visitas de cada día; la primera es la de creación de la partida. */
  hours: number[];
  /** Minutos de cada visita. */
  minutes: number;
  content: CompiledContent;
}

function playWeek(plan: Plan): { p: Player; rows: DayRow[]; milestones: Record<string, number | null> } {
  const first = plan.hours[0] ?? 0;
  const p = new Player(
    {
      kind: 'district',
      template: 'f1_casa',
      seed: SEED,
      actors: [{ id: ACTOR, plot: 'p1' }],
      dayOffset: first * HOUR,
    },
    plan.content,
  );
  const c = plan.content;
  const rows: DayRow[] = [];
  const milestones: Record<string, number | null> = {
    'primer sector': null,
    manantial: null,
    camino: null,
    cobertizo: null,
    bomba: null,
    taller: null,
    'tercer obrero': null,
    'siete sectores': null,
  };
  const mark = (key: string, day: number, yes: boolean): void => {
    if (yes && milestones[key] === null) milestones[key] = day;
  };
  for (let day = 1; day <= DAYS; day++) {
    p.notes = [];
    for (const hour of plan.hours) {
      const start = (day - 1) * DAY + (hour - first) * HOUR;
      const length = plan.minutes * MIN;
      const decisions = DECISIONS.map((f) => Math.floor((f * length) / SESSION));
      for (const [i, at] of decisions.entries()) {
        p.until(start + at);
        const final = i === decisions.length - 1;
        const bomba = mine(p.s, 'bomba')[0];
        if (bomba !== undefined && bomba.on !== true)
          p.give({ kind: 'toggle', args: { element: bomba.id, on: true }, note: 'encender la bomba' }, null);
        for (const m of workers(p.s)) {
          if (p.s.mobiles[m.id]?.job !== null) continue;
          for (const cand of options(p, m)) {
            if (p.give(cand, final ? null : start + length)) break;
          }
        }
        // Contratar no ocupa a ningún obrero: se prueba aparte, cuando la bomba ya riega la huerta
        // (antes, otra boca sin comida que la sostenga deja a todos sin comer al final de la semana).
        if (mine(p.s, 'bomba').length > 0)
          p.give({ kind: 'hire', args: { kind: 'obrero_peon' }, note: 'contratar a alguien' }, null);
      }
    }
    p.until(day * DAY - 1);
    const s = p.s;
    const finds = els(s)
      .filter(
        (e) =>
          e.owner === ACTOR && ['madera', 'piedra', 'manantial', 'salto', 'colina', 'paso'].includes(e.kind),
      )
      .map((e) => e.kind);
    const buildings = BUILD_ORDER.filter((k) => mine(s, k).length > 0);
    if (hasCamino(s)) buildings.push('camino');
    const encargos = p.events
      .filter((e) => e.kind === 'delivered' && e.actor === ACTOR)
      .reduce((n, e) => n + (e.kind === 'delivered' ? e.pay : 0), 0);
    rows.push({
      day,
      did: p.notes,
      sectors: revealed(s).length,
      finds,
      buildings,
      workers: workers(s).length,
      eagles: available(s, c, ACTOR, 'eagles'),
      comida: available(s, c, ACTOR, 'comida'),
      energia: kwh(available(s, c, ACTOR, 'energia')),
      madera: available(s, c, ACTOR, 'madera'),
      piedra: available(s, c, ACTOR, 'piedra'),
      errands: s.district.errands?.delivered[ACTOR] ?? 0,
      encargos,
      hungry: workers(s).filter((m) => m.hungry === true).length,
    });
    mark('primer sector', day, revealed(s).length >= 2);
    mark('manantial', day, finds.includes('manantial'));
    mark('camino', day, buildings.includes('camino'));
    for (const k of BUILD_ORDER) mark(k, day, buildings.includes(k));
    mark('tercer obrero', day, workers(s).length >= 3);
    mark('siete sectores', day, revealed(s).length >= 7);
  }
  return { p, rows, milestones };
}

const GUION: Record<string, number> = {
  'primer sector': 1,
  manantial: 2,
  camino: 2,
  cobertizo: 3,
  bomba: 4,
  taller: 5,
  'tercer obrero': 6,
  'siete sectores': 7,
};

function report(title: string, r: ReturnType<typeof playWeek>): string {
  const lines = [`## ${title}`, ''];
  lines.push('| Hito del guion (§10) | Día en el guion | Día en la simulación |', '|---|---|---|');
  for (const [k, v] of Object.entries(r.milestones))
    lines.push(`| ${k} | ${GUION[k]} | ${v ?? 'no llega'} |`);
  lines.push('');
  lines.push(
    '| Día | Sectores abiertos | Hallazgos | Hecho | Obreros | Águilas | Comida | Energía (kWh) | Madera | Piedra | Recados entregados | Águilas de encargos | Sin comer |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  );
  for (const d of r.rows)
    lines.push(
      `| ${d.day} | ${d.sectors} | ${d.finds.join(', ')} | ${d.buildings.join(', ')} | ${d.workers} | ${d.eagles} | ${d.comida} | ${d.energia} | ${d.madera} | ${d.piedra} | ${d.errands} | ${d.encargos} | ${d.hungry} |`,
    );
  lines.push('');
  for (const d of r.rows) lines.push(`- **Día ${d.day}:** ${d.did.join('; ') || 'nada'}.`);
  lines.push('');
  return lines.join('\n');
}

interface Variants {
  variants: {
    id: string;
    title: string;
    tasks: Record<string, { seconds: number; gives: Record<string, number> }>;
  }[];
  runs: { variant: string | null; hours: number[]; minutes: number }[];
}

const VARIANTS = JSON.parse(
  readFileSync(new URL('./semana-variantes.json', import.meta.url), 'utf8'),
) as Variants;

/** Las tablas reales con los cambios de una variante, para medir propuestas sin tocarlas. */
function variant(id: string | null): { title: string; content: CompiledContent } {
  const v = VARIANTS.variants.find((x) => x.id === id);
  if (v === undefined) return { title: 'Tablas reales', content: real };
  const t: RawTables = structuredClone(tables);
  for (const [k, change] of Object.entries(v.tasks)) {
    const task = t.tasks[k];
    if (task === undefined) throw new Error(`variante ${v.id}: no hay tarea ${k}`);
    task.seconds = change.seconds;
    task.gives = change.gives;
  }
  return { title: v.title, content: compile(t) };
}

function visits(hours: number[], minutes: number): string {
  const at = hours.map((h) => `${String(h).padStart(2, '0')}:00`);
  return hours.length === 1
    ? `una visita de ${minutes} min a las ${at[0] ?? ''}`
    : `${hours.length === 2 ? 'dos' : String(hours.length)} visitas de ${minutes} min (${at.join(' y ')})`;
}

const RUNS: { title: string; plan: Plan }[] = VARIANTS.runs.map((r) => {
  const v = variant(r.variant);
  return {
    title: `${v.title}: ${visits(r.hours, r.minutes)}`,
    plan: { hours: r.hours, minutes: r.minutes, content: v.content },
  };
});

/** Las semanas se juegan una vez, en la primera prueba que las pida (tardan unos segundos). */
let played: { title: string; plan: Plan; r: ReturnType<typeof playWeek> }[] | null = null;
function weeks(): NonNullable<typeof played> {
  played ??= RUNS.map(({ title, plan }) => ({ title, plan, r: playWeek(plan) }));
  return played;
}
const SLOW = 120_000;

describe('semana simulada con las tablas reales', () => {
  it('el registro del jugador simulado se repite igual desde cero', { timeout: SLOW }, () => {
    for (const { plan, r } of weeks()) {
      const again = replay(r.p.params, r.p.log, r.p.s.tick, plan.content);
      expect(hashState(again)).toBe(hashState(r.p.s));
    }
  });

  it('con las tablas reales, la casa crece en la semana y nadie pasa hambre', { timeout: SLOW }, () => {
    for (const { plan, r } of weeks()) {
      if (plan.content !== real) continue;
      const last = r.rows[r.rows.length - 1];
      expect(last?.sectors).toBeGreaterThanOrEqual(3);
      expect(last?.buildings).toContain('cobertizo');
      expect(last?.errands).toBeGreaterThan(0);
      expect(r.rows.every((d) => d.hungry === 0)).toBe(true);
    }
  });

  it('informe', { timeout: SLOW }, () => {
    const out = process.env.SEMANA;
    if (out === undefined || out === '') return;
    writeFileSync(
      out,
      weeks()
        .map(({ title, r }) => report(title, r))
        .join('\n'),
    );
  });

  it('partidas exportadas, para probar la página del informe', { timeout: SLOW }, () => {
    const dir = process.env.SEMANA_PARTIDAS;
    if (dir === undefined || dir === '') return;
    weeks().forEach(({ plan, r }, i) => {
      if (plan.content !== real) return;
      const first = plan.hours[0] ?? 0;
      // Creada el lunes 19 de octubre a la hora de la primera visita, en Madrid (UTC+2).
      const anchorMs = Date.UTC(2026, 9, 19, first - 2);
      const sessions = [];
      for (let day = 0; day < DAYS; day++)
        for (const h of plan.hours) {
          const start = anchorMs + (day * DAY + (h - first) * HOUR) * scene.tickMs;
          sessions.push({ start, end: start + plan.minutes * 60_000 });
        }
      const tick = r.p.s.tick;
      const data = {
        format: 'distritos-partida',
        v: 1,
        params: r.p.params,
        anchorMs,
        log: r.p.log,
        seenTick: tick,
        createdWith: { contentHash: real.hash, rules: RULES_VERSION },
        sessions,
        exportedAt: anchorMs + tick * scene.tickMs,
        check: { tick, hash: hashState(r.p.s), contentHash: real.hash, rules: RULES_VERSION },
        client: { userAgent: 'semana simulada', timeZone: 'Europe/Madrid', lang: 'es', build: 'semana' },
      };
      writeFileSync(`${dir}/semana-${i + 1}.json`, JSON.stringify(data));
    });
  });
});
