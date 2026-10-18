/**
 * Recados entre sitios y rutas. Diseño de la casa §17 (opción B, decisión del autor del 18 oct
 * 2026).
 *
 * Los sitios del común y las casas vecinas que lleva el juego generan recados con destino a
 * otros sitios, hasta su tope; lleno, un sitio deja de generar y nada se pierde por ausencia.
 * Un obrero sale con una ruta de varias paradas: en cada una trabaja un rato con luz y, al
 * terminar, entrega lo que va allí y recoge lo que va a una parada posterior, primero lo de
 * destino más cercano en la ruta, hasta llenar su carga (llena, no recoge nada). El horario
 * entero se fija al dar la orden. Cancelar la ruta la acaba en la parada a la que va o en la
 * que está; allí, parado, el obrero puede dejar lo que lleva para que lo recoja otro. Cada
 * recado paga lo suyo a quien lo recoge cuando lo entrega (P1), aunque haya pasado por otro sitio.
 */

import { canEnter } from '../access.js';
import { workEnd } from '../calendar.js';
import { compareStrings, get, removeKey, sortedKeys } from '../iter.js';
import { nextInt, pickWeighted } from '../rng.js';
import type { CompiledContent, ErrandTable, PlaceKind } from '../types/content.js';
import type { Event } from '../types/events.js';
import type { ActorId, ElementId, Int, Tick } from '../types/ids.js';
import type { Order, OrderArgs, Reject } from '../types/orders.js';
import type { Element, Errand, Errands, Mobile, RouteJob, RouteStop, SimState } from '../types/state.js';
import { isRecord, isStr } from './args.js';
import { put } from './inventory.js';
import { arrivalTick, positionOf, speedBetween } from './movement.js';
import { baseWork, effectiveWork, markStarted, ownFreeMobile, ownMobile } from './work.js';

const ROUTE_WORK = 'route';

function placeOf(content: CompiledContent, e: Element | undefined): PlaceKind | undefined {
  return e === undefined ? undefined : content.places?.[e.kind];
}

/** Recados por id numérico (los más antiguos primero). */
function errandList(es: Errands): Errand[] {
  const out: Errand[] = [];
  for (const k of sortedKeys(es.items)) {
    const r = es.items[k];
    if (r !== undefined) out.push(r);
  }
  return out.sort((a, b) => a.id - b.id);
}

/** Bultos que hay en un sitio (generados o dejados). */
function loadAt(es: Errands, place: ElementId): Int {
  let n = 0;
  for (const r of errandList(es)) if (r.at === place) n += r.size;
  return n;
}

/** Recados que lleva un obrero. */
export function carriedBy(state: SimState, mobile: string): Errand[] {
  const es = state.district.errands;
  return es === undefined ? [] : errandList(es).filter((r) => r.carrier === mobile);
}

/** Bultos que puede llevar un obrero a la vez. */
export function carryOf(content: CompiledContent, m: Mobile): Int {
  return content.mobiles[m.kind]?.carry ?? 0;
}

/** Sitios de recados, por id. */
function places(state: SimState, content: CompiledContent): Element[] {
  const out: Element[] = [];
  for (const id of sortedKeys(state.elements)) {
    const e = state.elements[id];
    if (e !== undefined && placeOf(content, e) !== undefined) out.push(e);
  }
  return out;
}

/** Genera un recado en un sitio si cabe; el tipo y el destino los elige el generador de la escena. */
function generateAt(
  state: SimState,
  content: CompiledContent,
  table: ErrandTable,
  es: Errands,
  place: Element,
  kind: PlaceKind,
  events: Event[],
): void {
  const makes = kind.makes ?? [];
  if (makes.length === 0 || loadAt(es, place.id) >= kind.capacity) return;
  const [i, r1] = pickWeighted(
    state.rng,
    makes.map((w) => w.weight),
  );
  state.rng = r1;
  const ek = makes[i]?.kind;
  const spec = ek === undefined ? undefined : table.kinds[ek];
  if (ek === undefined || spec === undefined) return;
  if (loadAt(es, place.id) + spec.size > kind.capacity) return;
  const targets = places(state, content).filter((p) => p.id !== place.id && spec.to.includes(p.kind));
  if (targets.length === 0) return;
  const [j, r2] = nextInt(state.rng, targets.length);
  state.rng = r2;
  const to = targets[j];
  if (to === undefined) return;
  const errand: Errand = { id: es.next, kind: ek, to: to.id, size: spec.size, pay: spec.pay, at: place.id };
  if (spec.expiresTicks !== undefined) errand.expires = state.tick + spec.expiresTicks;
  es.items[String(errand.id)] = errand;
  es.next += 1;
  events.push({ tick: state.tick, kind: 'errand_made', errand: errand.id, at: place.id, to: to.id });
}

/** Crea los recados del distrito si las tablas los tienen y hay sitios en la plantilla. */
export function initErrands(state: SimState, content: CompiledContent): void {
  const table = content.errands;
  if (table === undefined || content.places === undefined) return;
  const ps = places(state, content);
  if (ps.length === 0) return;
  const es: Errands = { next: 1, items: {}, nextAt: {}, delivered: {} };
  for (const p of ps) {
    const kind = placeOf(content, p);
    if (kind === undefined) continue;
    for (let n = 0; n < (kind.start ?? 0); n++) generateAt(state, content, table, es, p, kind, []);
    if (kind.everyTicks !== undefined) es.nextAt[p.id] = state.tick + kind.everyTicks;
  }
  state.district.errands = es;
}

/** Fase de recados de un tick: los sitios que tocan generan y caduca lo que nadie recogió. */
export function processErrands(state: SimState, content: CompiledContent, events: Event[]): void {
  const es = state.district.errands;
  const table = content.errands;
  if (es === undefined || table === undefined) return;
  for (const id of sortedKeys(es.nextAt)) {
    const due = es.nextAt[id];
    if (due === undefined || due > state.tick) continue;
    const place = state.elements[id];
    const kind = placeOf(content, place);
    if (place === undefined || kind?.everyTicks === undefined) {
      removeKey(es.nextAt, id);
      continue;
    }
    generateAt(state, content, table, es, place, kind, events);
    es.nextAt[id] = state.tick + kind.everyTicks;
  }
  for (const r of errandList(es)) {
    if (r.expires === undefined || r.expires > state.tick || r.holder !== undefined || r.at === null)
      continue;
    removeKey(es.items, String(r.id));
    events.push({ tick: state.tick, kind: 'errand_expired', errand: r.id });
  }
}

/** Próximo tick ≥ el actual con una generación o una caducidad, o null. */
export function nextErrandEvent(state: SimState): Tick | null {
  const es = state.district.errands;
  if (es === undefined) return null;
  let next: Tick | null = null;
  const consider = (t: Tick): void => {
    const v = t < state.tick ? state.tick : t;
    if (next === null || v < next) next = v;
  };
  for (const id of sortedKeys(es.nextAt)) {
    const t = es.nextAt[id];
    if (t !== undefined) consider(t);
  }
  for (const r of errandList(es)) {
    if (r.expires !== undefined && r.holder === undefined && r.at !== null) consider(r.expires);
  }
  return next;
}

/**
 * Ticks de trabajo con luz de cada parada de una ruta que saliera ahora: la de la tabla, corta
 * en la primera ruta del actor (C7) y alargada por el rendimiento del obrero (hambre).
 */
export function stopWork(state: SimState, content: CompiledContent, m: Mobile, actor: ActorId): Int | null {
  const table = content.errands;
  if (table === undefined) return null;
  const spec =
    table.firstStopTicks === undefined
      ? { ticks: table.stopTicks }
      : { ticks: table.stopTicks, firstTicks: table.firstStopTicks };
  return effectiveWork(content, m, baseWork(state, actor, ROUTE_WORK, spec));
}

/**
 * Horario de una ruta que saliera ahora: llegada y salida de cada parada. El trabajo de cada
 * parada se cuenta con luz (C3), con el rendimiento del obrero y la primera vez corta (C7).
 * null si nunca habría luz para terminar.
 */
export function planRoute(
  state: SimState,
  content: CompiledContent,
  m: Mobile,
  actor: ActorId,
  stops: readonly ElementId[],
): RouteStop[] | null {
  const work = stopWork(state, content, m, actor);
  if (work === null) return null;
  let t = state.tick;
  let pos = positionOf(m, t);
  let from: ElementId | null = m.where.kind === 'at' ? m.where.element : null;
  const out: RouteStop[] = [];
  for (const id of stops) {
    const e = get(state.elements, id, 'parada');
    const speed = speedBetween(state, content, m.stats.speed, from, id);
    const arrive = arrivalTick(pos, e.pos, speed, state.scene.tickMs, t);
    const leave = workEnd(state, content, arrive, work);
    if (leave === null) return null;
    out.push({ at: id, arrive, leave });
    t = leave;
    pos = e.pos;
    from = id;
  }
  return out;
}

function isStopList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => isStr(x));
}

export function validateRoute(
  state: SimState,
  content: CompiledContent,
  actor: ActorId,
  args: unknown,
): Reject | null {
  if (!isRecord(args) || !isStr(args.mobile) || !isStopList(args.stops)) return 'bad_args';
  const table = content.errands;
  if (table === undefined) return 'bad_route';
  const m = ownFreeMobile(state, actor, args.mobile);
  if (typeof m === 'string') return m;
  const stops = args.stops;
  if (stops.length === 0 || stops.length > table.maxStops) return 'bad_route';
  for (let i = 0; i < stops.length; i++) {
    const id = stops[i] ?? '';
    if (i > 0 && stops[i - 1] === id) return 'bad_route';
    const e = state.elements[id];
    if (e === undefined) return 'unknown_element';
    if (placeOf(content, e) === undefined) return 'not_a_place';
    const sector = state.map.sectors[e.sector];
    if (sector === undefined || !canEnter(state, actor, sector)) return 'no_access';
  }
  if (planRoute(state, content, m, actor, stops) === null) return 'dark';
  return null;
}

export function startRoute(state: SimState, content: CompiledContent, order: Order, events: Event[]): void {
  const args = order.args as OrderArgs['route'];
  const table = content.errands;
  const m = get(state.mobiles, args.mobile, 'móvil');
  const plan = planRoute(state, content, m, order.actor, args.stops);
  const first = plan?.[0];
  if (table === undefined || plan === null || first === undefined)
    throw new Error('ruta: sin horario (debió rechazarse)');
  markStarted(
    state,
    order.actor,
    ROUTE_WORK,
    table.firstStopTicks === undefined
      ? { ticks: table.stopTicks }
      : { ticks: table.stopTicks, firstTicks: table.firstStopTicks },
  );
  const e = get(state.elements, first.at, 'parada');
  m.where = {
    kind: 'trip',
    trip: {
      from: positionOf(m, state.tick),
      to: e.pos,
      toElement: e.id,
      departTick: state.tick,
      arriveTick: first.arrive,
      seq: order.seq,
    },
  };
  m.job = {
    kind: 'route',
    stops: plan,
    index: 0,
    startTick: first.arrive,
    endTick: first.leave,
    seq: order.seq,
  };
  events.push({ tick: state.tick, kind: 'trip_started', mobile: m.id, arriveTick: first.arrive });
}

/** Entrega en un sitio lo que el obrero lleva para él: cada recado paga a quien lo recogió. */
function deliverHere(
  state: SimState,
  content: CompiledContent,
  es: Errands,
  m: Mobile,
  place: ElementId,
  events: Event[],
): void {
  const table = content.errands;
  if (table === undefined) return;
  for (const r of errandList(es)) {
    if (r.carrier !== m.id || r.to !== place) continue;
    const holder = r.holder ?? m.owner;
    removeKey(es.items, String(r.id));
    if (r.pay > 0) put(state, content, holder, table.currency, r.pay, events, 'recado');
    es.delivered[holder] = (es.delivered[holder] ?? 0) + 1;
    events.push({
      tick: state.tick,
      kind: 'errand_delivered',
      errand: r.id,
      mobile: m.id,
      actor: holder,
      pay: r.pay,
    });
  }
}

/**
 * Recoge en un sitio lo que va a una parada posterior: primero lo de destino más cercano en la
 * ruta, luego lo más antiguo; lo que no cabe se queda. Con la carga llena no recoge nada.
 */
function pickUpHere(
  content: CompiledContent,
  es: Errands,
  m: Mobile,
  place: ElementId,
  rest: readonly ElementId[],
  tick: Tick,
  events: Event[],
): void {
  const carry = carryOf(content, m);
  let used = 0;
  for (const r of errandList(es)) if (r.carrier === m.id) used += r.size;
  if (used >= carry) return;
  const order = (r: Errand): Int => rest.indexOf(r.to);
  const candidates = errandList(es)
    .filter((r) => r.at === place && order(r) >= 0 && (r.holder === undefined || r.holder === m.owner))
    .sort((a, b) => {
      const d = order(a) - order(b);
      return d !== 0 ? d : a.id - b.id;
    });
  for (const r of candidates) {
    if (used + r.size > carry) continue;
    used += r.size;
    r.at = null;
    r.carrier = m.id;
    r.holder = m.owner;
    events.push({ tick, kind: 'errand_picked', errand: r.id, mobile: m.id });
  }
}

/** Fin del trabajo en una parada: entregar, recoger y salir hacia la siguiente (o acabar). */
export function advanceRoute(
  state: SimState,
  content: CompiledContent,
  m: Mobile,
  job: RouteJob,
  events: Event[],
): void {
  const es = state.district.errands;
  const stop = job.stops[job.index];
  if (stop === undefined) {
    m.job = null;
    return;
  }
  const rest = job.stops.slice(job.index + 1).map((s) => s.at);
  if (es !== undefined) {
    deliverHere(state, content, es, m, stop.at, events);
    if (rest.length > 0) pickUpHere(content, es, m, stop.at, rest, state.tick, events);
  }
  const next = job.stops[job.index + 1];
  const e = next === undefined ? undefined : state.elements[next.at];
  if (next === undefined || e === undefined) {
    m.job = null;
    events.push({ tick: state.tick, kind: 'job_done', mobile: m.id, job });
    return;
  }
  m.where = {
    kind: 'trip',
    trip: {
      from: positionOf(m, state.tick),
      to: e.pos,
      toElement: e.id,
      departTick: stop.leave,
      arriveTick: next.arrive,
      seq: job.seq,
    },
  };
  m.job = { ...job, index: job.index + 1, startTick: next.arrive, endTick: next.leave };
  events.push({ tick: state.tick, kind: 'trip_started', mobile: m.id, arriveTick: next.arrive });
}

export function validateCancel(state: SimState, actor: ActorId, args: unknown): Reject | null {
  if (!isRecord(args) || !isStr(args.mobile)) return 'bad_args';
  const m = ownMobile(state, actor, args.mobile);
  if (typeof m === 'string') return m;
  if (m.job?.kind !== 'route') return 'no_route';
  if (m.job.index >= m.job.stops.length - 1) return 'unchanged';
  return null;
}

export function applyCancel(state: SimState, order: Order, events: Event[]): void {
  const args = order.args as OrderArgs['cancel'];
  const m = get(state.mobiles, args.mobile, 'móvil');
  const job = m.job;
  if (job?.kind !== 'route') throw new Error('cancelar: sin ruta (debió rechazarse)');
  m.job = { ...job, stops: job.stops.slice(0, job.index + 1) };
  events.push({ tick: state.tick, kind: 'route_cancelled', mobile: m.id });
}

export function validateUnload(
  state: SimState,
  content: CompiledContent,
  actor: ActorId,
  args: unknown,
): Reject | null {
  if (!isRecord(args) || !isStr(args.mobile)) return 'bad_args';
  const m = ownFreeMobile(state, actor, args.mobile);
  if (typeof m === 'string') return m;
  const es = state.district.errands;
  const place =
    m.where.kind === 'at' && m.where.element !== null ? state.elements[m.where.element] : undefined;
  const kind = placeOf(content, place);
  if (es === undefined || place === undefined || kind === undefined) return 'not_a_place';
  const cargo = carriedBy(state, m.id);
  if (cargo.length === 0) return 'nothing_to_do';
  const free = kind.capacity - loadAt(es, place.id);
  if (!cargo.some((r) => r.size <= free)) return 'place_full';
  return null;
}

/** Deja en el sitio lo que quepa, por orden de recogida (los recados más antiguos primero). */
export function applyUnload(state: SimState, content: CompiledContent, order: Order, events: Event[]): void {
  const args = order.args as OrderArgs['unload'];
  const m = get(state.mobiles, args.mobile, 'móvil');
  const es = state.district.errands;
  const placeId = m.where.kind === 'at' ? m.where.element : null;
  const kind = placeId === null ? undefined : placeOf(content, state.elements[placeId]);
  if (es === undefined || placeId === null || kind === undefined) throw new Error('dejar: sin sitio');
  let free = kind.capacity - loadAt(es, placeId);
  for (const r of carriedBy(state, m.id)) {
    if (r.size > free) continue;
    free -= r.size;
    r.at = placeId;
    delete r.carrier;
    events.push({ tick: state.tick, kind: 'errand_dropped', errand: r.id, at: placeId });
  }
}

/** Para la interfaz: los sitios de recados, por id, con lo que tienen. */
export function errandsAt(state: SimState, place: ElementId): Errand[] {
  const es = state.district.errands;
  return es === undefined ? [] : errandList(es).filter((r) => r.at === place);
}

/** Orden estable de ids de sitios para quien lo necesite (la interfaz). */
export function placeIds(state: SimState, content: CompiledContent): ElementId[] {
  return places(state, content)
    .map((e) => e.id)
    .sort(compareStrings);
}
