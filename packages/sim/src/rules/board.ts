/**
 * La pizarra del común: el encargo del día y las entregas. Diseño de la casa §8 (C6, opción B;
 * decisión del autor del 17 oct 2026).
 *
 * En F1 el distrito lo lleva el juego: cada día, en el paso diario, la pizarra publica el
 * siguiente encargo de la tabla (lo que el común necesita: energía en el punto de carga,
 * raciones en el almacén, horas de obra). Un obrero lo cumple llevando lo que pide (se saca
 * de las existencias al dar la orden y viaja con él) o trabajando allí. Cada entrega paga su
 * parte de la recompensa en Eagles, que nacen de ese trabajo para el común; la pizarra apunta
 * quién entregó qué. La parte se fija al dar la orden: si el encargo cambia mientras el obrero
 * va de camino, la entrega se cobra igual y nada de lo entregado se pierde.
 */

import { fdiv, fmod, min, mul } from '../arith.js';
import { canEnter } from '../access.js';
import { at, get, sortedKeys } from '../iter.js';
import type { CompiledContent } from '../types/content.js';
import type { Event } from '../types/events.js';
import type { ActorId, ElementId, Int } from '../types/ids.js';
import type { Order, OrderArgs, Reject } from '../types/orders.js';
import type { Board, DeliverJob, Encargo, Mobile, SimState } from '../types/state.js';
import { isInt, isRecord, isStr } from './args.js';
import { capacityOf, levelOf, setLevel } from './elements.js';
import { available, put, take } from './inventory.js';
import { startTrip } from './movement.js';
import { ownFreeMobile, planWork } from './work.js';

/** Primer elemento de la tierra común (sin dueño) de un tipo. */
function commonElement(state: SimState, kind: string): ElementId | null {
  for (const id of sortedKeys(state.elements)) {
    const e = state.elements[id];
    if (e?.kind === kind && e.owner === undefined) return e.id;
  }
  return null;
}

/** Publica el encargo del día de la pizarra. */
function publish(state: SimState, content: CompiledContent, board: Board, events: Event[]): void {
  const table = content.board;
  board.encargo = null;
  if (table === undefined || table.encargos.length === 0) return;
  const kind = at(table.encargos, fmod(board.day, table.encargos.length));
  const dest = commonElement(state, kind.at);
  if (dest === null) return;
  const encargo: Encargo = {
    id: board.next,
    kind: kind.id,
    at: dest,
    resource: kind.resource,
    work: kind.work === true,
    amount: kind.amount,
    perTrip: kind.perTrip,
    reward: kind.reward,
    reserved: 0,
    delivered: 0,
    by: {},
  };
  board.next += 1;
  board.encargo = encargo;
  events.push({ tick: state.tick, kind: 'encargo', id: encargo.id, encargo: kind.id });
}

/** Crea la pizarra si las tablas la tienen y la plantilla tiene tierra común con sus destinos. */
export function initBoard(state: SimState, content: CompiledContent): void {
  if (content.board === undefined) return;
  const board: Board = { day: 0, next: 1, encargo: null, totals: {} };
  publish(state, content, board, []);
  if (board.encargo !== null) state.district.board = board;
}

/** Paso diario de la pizarra: el encargo de ayer se retira y se publica el de hoy. */
export function rotateBoard(state: SimState, content: CompiledContent, events: Event[]): void {
  const board = state.district.board;
  if (board === undefined) return;
  board.day += 1;
  publish(state, content, board, events);
}

/** Lo que un obrero entregaría ahora: hasta su viaje, lo que falta y lo que hay. */
function deliverable(state: SimState, content: CompiledContent, actor: ActorId, e: Encargo): Int {
  const left = min(e.perTrip, e.amount - e.reserved);
  return e.work ? left : min(left, available(state, content, actor, e.resource));
}

export function validateDeliver(
  state: SimState,
  content: CompiledContent,
  actor: ActorId,
  args: unknown,
): Reject | null {
  if (!isRecord(args) || !isStr(args.mobile) || !isInt(args.encargo)) return 'bad_args';
  const m = ownFreeMobile(state, actor, args.mobile);
  if (typeof m === 'string') return m;
  const e = state.district.board?.encargo;
  if (e?.id !== args.encargo) return 'no_encargo';
  if (e.reserved >= e.amount) return 'encargo_done';
  const dest = state.elements[e.at];
  if (dest === undefined) return 'no_encargo';
  const sector = state.map.sectors[dest.sector];
  if (sector === undefined || !canEnter(state, actor, sector)) return 'no_access';
  const amount = deliverable(state, content, actor, e);
  if (amount <= 0) return `insufficient:${e.resource}`;
  if (planWork(state, content, m, dest.pos, dest.id, e.work ? amount : 0) === null) return 'dark';
  return null;
}

export function startDeliver(state: SimState, content: CompiledContent, order: Order, events: Event[]): void {
  const args = order.args as OrderArgs['deliver'];
  const m = get(state.mobiles, args.mobile, 'móvil');
  const e = state.district.board?.encargo;
  if (e?.id !== args.encargo) throw new Error('entregar: encargo inexistente (debió rechazarse)');
  const dest = get(state.elements, e.at, 'destino');
  const amount = deliverable(state, content, order.actor, e);
  const plan = planWork(state, content, m, dest.pos, dest.id, e.work ? amount : 0);
  if (plan === null) throw new Error('entregar: sin luz (debió rechazarse)');
  if (!e.work) {
    take(state, content, order.actor, e.resource, amount, events, 'deliver');
    m.cargo = { [e.resource]: amount };
  }
  // La parte de la recompensa que paga esta entrega, sin perder nada por redondeo.
  const pay = fdiv(mul(e.reward, e.reserved + amount), e.amount) - fdiv(mul(e.reward, e.reserved), e.amount);
  e.reserved += amount;
  const trip = startTrip(state, content, m, dest.pos, dest.id, order.seq);
  m.job = {
    kind: 'deliver',
    encargo: e.id,
    element: dest.id,
    resource: e.resource,
    work: e.work,
    amount,
    pay,
    startTick: plan.arrive,
    endTick: plan.end,
  };
  events.push({ tick: state.tick, kind: 'trip_started', mobile: m.id, arriveTick: trip.arriveTick });
}

export function completeDelivery(
  state: SimState,
  content: CompiledContent,
  m: Mobile,
  job: DeliverJob,
  events: Event[],
): void {
  const dest = state.elements[job.element];
  if (!job.work && dest?.store?.[job.resource] !== undefined) {
    const have = levelOf(dest, job.resource);
    const added = min(capacityOf(content, dest, job.resource) - have, job.amount);
    if (added > 0) {
      setLevel(dest, job.resource, have + added);
      events.push({
        tick: state.tick,
        kind: 'store',
        element: dest.id,
        resource: job.resource,
        delta: added,
        reason: 'deliver',
      });
    }
  }
  delete m.cargo;
  const board = state.district.board;
  if (board !== undefined) {
    const e = board.encargo;
    if (e?.id === job.encargo) {
      e.delivered += job.amount;
      e.by[m.owner] = (e.by[m.owner] ?? 0) + job.amount;
    }
    const totals = board.totals[m.owner] ?? {};
    totals[job.resource] = (totals[job.resource] ?? 0) + job.amount;
    board.totals[m.owner] = totals;
  }
  const currency = content.board?.currency;
  if (currency !== undefined && job.pay > 0)
    put(state, content, m.owner, currency, job.pay, events, 'encargo');
  events.push({
    tick: state.tick,
    kind: 'delivered',
    actor: m.owner,
    encargo: job.encargo,
    resource: job.resource,
    amount: job.amount,
    pay: job.pay,
  });
}
