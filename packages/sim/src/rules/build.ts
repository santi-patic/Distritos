/**
 * Construir: un obrero levanta un edificio en un punto de un sector abierto propio.
 * Diseño de la casa §7.
 *
 * El coste (Eagles, madera, piedra…) se cobra al dar la orden; el obrero va al punto y trabaja
 * las horas de la tabla con luz; al terminar aparece el edificio con el nombre de quien lo hizo.
 */

import { mul } from '../arith.js';
import { dist2, type Vec } from '../geom.js';
import { distance, key, nearest, parse, type HexKey, type Lattice } from '../hex.js';
import { get, sortedKeys } from '../iter.js';
import type { BuildKind, CompiledContent } from '../types/content.js';
import type { Event } from '../types/events.js';
import type { ActorId, Int } from '../types/ids.js';
import type { Order, OrderArgs, Reject } from '../types/orders.js';
import type { BuildJob, Mobile, SimState } from '../types/state.js';
import { isRecord, isStr, isVec } from './args.js';
import { addElement } from './elements.js';
import { lacking, pay } from './inventory.js';
import { startTrip } from './movement.js';
import { baseWork, markStarted, ownFreeMobile, planWork } from './work.js';

function latticeOf(state: SimState): Lattice {
  return { hexW: state.scene.hexW, hexH: state.scene.hexH };
}

/** Hay un elemento, o una obra en curso, a menos de `gap` del punto. */
function tooClose(state: SimState, pos: Vec, gap: Int): boolean {
  if (gap <= 0) return false;
  const g2 = mul(gap, gap);
  for (const id of sortedKeys(state.elements)) {
    const e = state.elements[id];
    if (e !== undefined && dist2(e.pos, pos) < g2) return true;
  }
  for (const id of sortedKeys(state.mobiles)) {
    const job = state.mobiles[id]?.job;
    if (job?.kind === 'build' && dist2(job.pos, pos) < g2) return true;
  }
  return false;
}

function isNear(state: SimState, sector: HexKey, near: NonNullable<BuildKind['near']>): boolean {
  const h = parse(sector);
  for (const id of sortedKeys(state.elements)) {
    const e = state.elements[id];
    if (e === undefined || !near.kinds.includes(e.kind)) continue;
    if (distance(parse(e.sector), h) <= near.hexes) return true;
  }
  return false;
}

export function validateBuild(
  state: SimState,
  content: CompiledContent,
  actor: ActorId,
  args: unknown,
): Reject | null {
  if (!isRecord(args) || !isStr(args.mobile) || !isStr(args.kind) || !isVec(args.pos)) return 'bad_args';
  const m = ownFreeMobile(state, actor, args.mobile);
  if (typeof m === 'string') return m;
  const b = content.builds?.[args.kind];
  if (b === undefined || content.elements[args.kind] === undefined) return 'not_buildable';
  const sectorKey = key(nearest(args.pos, latticeOf(state)));
  const sector = state.map.sectors[sectorKey];
  if (sector === undefined) return 'off_map';
  if (sector.plot === null || state.plots[sector.plot]?.owner !== actor) return 'no_access';
  if (sector.status !== 'revealed') return 'bad_position';
  if (tooClose(state, args.pos, b.gapMm)) return 'too_close';
  if (b.near !== undefined && !isNear(state, sectorKey, b.near)) return 'not_near';
  const lack = lacking(state, content, actor, b.cost);
  if (lack !== null) return `insufficient:${lack}`;
  const work = baseWork(state, actor, `build:${args.kind}`, b);
  if (planWork(state, content, m, args.pos, null, work) === null) return 'dark';
  return null;
}

export function startBuild(state: SimState, content: CompiledContent, order: Order, events: Event[]): void {
  const args = order.args as OrderArgs['build'];
  const m = get(state.mobiles, args.mobile, 'móvil');
  const b = get(content.builds ?? {}, args.kind, 'edificio');
  const pos: Vec = { x: args.pos.x, y: args.pos.y };
  const workKey = `build:${args.kind}`;
  const work = baseWork(state, order.actor, workKey, b);
  const plan = planWork(state, content, m, pos, null, work);
  if (plan === null) throw new Error('construir: sin luz (debió rechazarse)');
  pay(state, content, order.actor, b.cost, events, 'build');
  markStarted(state, order.actor, workKey, b);
  const trip = startTrip(state, content, m, pos, null, order.seq);
  m.job = { kind: 'build', what: args.kind, pos, startTick: plan.arrive, endTick: plan.end };
  events.push({ tick: state.tick, kind: 'trip_started', mobile: m.id, arriveTick: trip.arriveTick });
}

export function completeBuild(
  state: SimState,
  content: CompiledContent,
  m: Mobile,
  job: BuildJob,
  events: Event[],
): void {
  const sector = key(nearest(job.pos, latticeOf(state)));
  const e = addElement(state, content, {
    kind: job.what,
    pos: job.pos,
    sector,
    owner: m.owner,
    builtBy: [m.owner],
  });
  events.push({ tick: state.tick, kind: 'built', element: e.id, by: m.owner });
}
