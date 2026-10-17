/**
 * Nexos: cables, canales y caminos entre dos elementos. Diseño de la casa §2 y §7 (C2).
 *
 * Un nexo que lleva un recurso une un almacén con quien lo llena (el panel con la batería) o
 * con quien tira de él (la batería con la casa, el pozo con la huerta), y se guarda en el
 * sentido del flujo. Quien produce o consume tiene un solo nexo de cada tipo: tender uno nuevo
 * sustituye al anterior (reconectar la huerta del pozo a la bomba). Un camino une dos
 * elementos cualesquiera y acelera a los obreros que van de uno a otro.
 */

import { ceilDiv, max, mul } from '../arith.js';
import { dist } from '../geom.js';
import { get, removeKey, sortedKeys } from '../iter.js';
import type { CompiledContent, LinkKind } from '../types/content.js';
import type { Event } from '../types/events.js';
import type { ActorId, Int, LinkId, ResourceId } from '../types/ids.js';
import type { Order, OrderArgs, Reject } from '../types/orders.js';
import type { Element, Link, LinkJob, Mobile, SimState } from '../types/state.js';
import { isRecord, isStr } from './args.js';
import { addCosts, lacking, pay } from './inventory.js';
import { startTrip } from './movement.js';
import { baseWork, markStarted, ownFreeMobile, planWork } from './work.js';

/**
 * Sentido del flujo de un nexo que lleva `r` entre a y b: [aguas arriba, aguas abajo, extremo
 * que no es almacén], o null si no une un almacén con quien lo llena o lo vacía.
 */
export function flowRoles(
  content: CompiledContent,
  a: Element,
  b: Element,
  r: ResourceId,
): [Element, Element, Element] | null {
  const ka = content.elements[a.kind];
  const kb = content.elements[b.kind];
  const aStore = ka?.stores?.[r] !== undefined;
  const bStore = kb?.stores?.[r] !== undefined;
  const feeds = (k: typeof ka): boolean => k?.produce?.resource === r && k.produce.to === 'link';
  const draws = (k: typeof ka): boolean => k?.consume?.resource === r;
  if (aStore && !bStore) {
    if (feeds(kb)) return [b, a, b];
    if (draws(kb)) return [a, b, b];
  }
  if (bStore && !aStore) {
    if (feeds(ka)) return [a, b, a];
    if (draws(ka)) return [b, a, a];
  }
  return null;
}

/** Tramos de un nexo de esa longitud: al menos uno. */
function unitsOf(lk: LinkKind, length: Int): Int {
  return max(1, ceilDiv(length, lk.unitMm));
}

function costOf(lk: LinkKind, units: Int): Record<ResourceId, Int> {
  return addCosts(lk.cost, lk.costPerUnit, units);
}

function workSpec(lk: LinkKind, units: Int): { ticks: Int; firstTicks?: Int } {
  const ticks = mul(units, lk.ticksPerUnit);
  return lk.firstTicks === undefined ? { ticks } : { ticks, firstTicks: lk.firstTicks };
}

/** Ya hay (o se está tendiendo) un nexo de ese tipo entre esos dos elementos. */
function alreadyLinked(state: SimState, kind: string, a: string, b: string): boolean {
  const same = (x: string, y: string): boolean => (x === a && y === b) || (x === b && y === a);
  for (const id of sortedKeys(state.links)) {
    const l = state.links[id];
    if (l?.kind === kind && same(l.from, l.to)) return true;
  }
  for (const id of sortedKeys(state.mobiles)) {
    const job = state.mobiles[id]?.job;
    if (job?.kind === 'link' && job.what === kind && same(job.from, job.to)) return true;
  }
  return false;
}

export function validateLink(
  state: SimState,
  content: CompiledContent,
  actor: ActorId,
  args: unknown,
): Reject | null {
  if (!isRecord(args) || !isStr(args.mobile) || !isStr(args.kind) || !isStr(args.from) || !isStr(args.to)) {
    return 'bad_args';
  }
  const m = ownFreeMobile(state, actor, args.mobile);
  if (typeof m === 'string') return m;
  const lk = content.links?.[args.kind];
  if (lk === undefined) return 'not_linkable';
  const a = state.elements[args.from];
  const b = state.elements[args.to];
  if (a === undefined || b === undefined) return 'unknown_element';
  if (a.id === b.id) return 'not_linkable';
  if (a.owner !== actor || b.owner !== actor) return 'not_owner';
  if (lk.carries !== undefined && flowRoles(content, a, b, lk.carries) === null) return 'not_linkable';
  if (alreadyLinked(state, args.kind, a.id, b.id)) return 'already_linked';
  const length = dist(a.pos, b.pos);
  if (lk.maxMm !== undefined && length > lk.maxMm) return 'too_long';
  const units = unitsOf(lk, length);
  const lack = lacking(state, content, actor, costOf(lk, units));
  if (lack !== null) return `insufficient:${lack}`;
  const work = baseWork(state, actor, `link:${args.kind}`, workSpec(lk, units));
  if (planWork(state, content, m, a.pos, a.id, work) === null) return 'dark';
  return null;
}

export function startLink(state: SimState, content: CompiledContent, order: Order, events: Event[]): void {
  const args = order.args as OrderArgs['link'];
  const m = get(state.mobiles, args.mobile, 'móvil');
  const lk = get(content.links ?? {}, args.kind, 'nexo');
  const a = get(state.elements, args.from, 'elemento');
  const b = get(state.elements, args.to, 'elemento');
  const units = unitsOf(lk, dist(a.pos, b.pos));
  const spec = workSpec(lk, units);
  const workKey = `link:${args.kind}`;
  const plan = planWork(state, content, m, a.pos, a.id, baseWork(state, order.actor, workKey, spec));
  if (plan === null) throw new Error('nexo: sin luz (debió rechazarse)');
  pay(state, content, order.actor, costOf(lk, units), events, 'link');
  markStarted(state, order.actor, workKey, spec);
  const trip = startTrip(state, content, m, a.pos, a.id, order.seq);
  m.job = { kind: 'link', what: args.kind, from: a.id, to: b.id, startTick: plan.arrive, endTick: plan.end };
  events.push({ tick: state.tick, kind: 'trip_started', mobile: m.id, arriveTick: trip.arriveTick });
}

export function completeLink(
  state: SimState,
  content: CompiledContent,
  m: Mobile,
  job: LinkJob,
  events: Event[],
): void {
  const lk = content.links?.[job.what];
  const a = state.elements[job.from];
  const b = state.elements[job.to];
  if (lk === undefined || a === undefined || b === undefined) return;
  let from = a.id;
  let to = b.id;
  let replaced: LinkId | null = null;
  if (lk.carries !== undefined) {
    const roles = flowRoles(content, a, b, lk.carries);
    if (roles === null) return;
    const [up, down, end] = roles;
    from = up.id;
    to = down.id;
    // Quien produce o consume tiene un solo nexo de cada tipo: el nuevo sustituye al viejo.
    for (const id of sortedKeys(state.links)) {
      const l = state.links[id];
      if (l?.kind !== job.what || (l.from !== end.id && l.to !== end.id)) continue;
      removeKey(state.links, id);
      replaced = id;
    }
  }
  state.counters.link += 1;
  const id = `l${state.counters.link}`;
  state.links[id] = { id, kind: job.what, from, to, builtBy: [m.owner] };
  events.push({ tick: state.tick, kind: 'linked', link: id, replaced });
}

/** Crea un nexo sin obrero ni coste (dotación inicial). */
export function addLink(
  state: SimState,
  content: CompiledContent,
  kind: string,
  a: Element,
  b: Element,
  builtBy?: ActorId,
): void {
  const lk = content.links?.[kind];
  if (lk === undefined) throw new Error(`contenido: nexo desconocido: ${kind}`);
  let from = a.id;
  let to = b.id;
  if (lk.carries !== undefined) {
    const roles = flowRoles(content, a, b, lk.carries);
    if (roles === null) throw new Error(`contenido: el nexo ${kind} no une ${a.kind} con ${b.kind}`);
    from = roles[0].id;
    to = roles[1].id;
  }
  state.counters.link += 1;
  const id = `l${state.counters.link}`;
  const link: Link = { id, kind, from, to };
  if (builtBy !== undefined) link.builtBy = [builtBy];
  state.links[id] = link;
}
