/**
 * Validación y aplicación de órdenes. Esquema del paquete sim, §8.
 *
 * `validate` es la misma función en cliente y servidor: precomprueba una intención contra el
 * estado actual. `apply` vuelve a validar en el tick de ejecución (el estado puede haber
 * cambiado) y, si la orden ya no vale, la deja en el registro con el evento `rejected`.
 * Cada mecánica valida y ejecuta en su módulo; aquí solo se reparte.
 */

import { canEnter } from '../access.js';
import { center, parse } from '../hex.js';
import { get, sortedKeys } from '../iter.js';
import type { CompiledContent } from '../types/content.js';
import type { Event } from '../types/events.js';
import { SYSTEM_ACTOR, type ActorId } from '../types/ids.js';
import type { Order, OrderArgs, OrderIntent, OrderKind, Reject } from '../types/orders.js';
import { ORDER_KINDS, SYSTEM_ORDER_KINDS } from '../types/orders.js';
import type { SimState } from '../types/state.js';
import { isBool, isRecord, isStr } from './args.js';
import { startDeliver, validateDeliver } from './board.js';
import { startBuild, validateBuild } from './build.js';
import {
  applyCancel,
  applyUnload,
  startRoute,
  validateCancel,
  validateRoute,
  validateUnload,
} from './errands.js';
import { hasRevealedNeighbor } from './fog.js';
import { available, pay, put, take } from './inventory.js';
import { startLink, validateLink } from './links.js';
import { startTrip } from './movement.js';
import { startJob, validateJob } from './tasks.js';
import { baseWork, markStarted, ownFreeMobile, ownMobile, planWork } from './work.js';
import { startHire, validateHire } from './workers.js';

/** Efectos de una orden sobre el bucle del paso (no sobre el estado). */
export interface StepEffects {
  /** Ticks que el tick salta al final del paso (orden `skip`). */
  skip: number;
}

function validateMove(state: SimState, actor: ActorId, args: OrderArgs['move']): Reject | null {
  const m = ownMobile(state, actor, args.mobile);
  if (typeof m === 'string') return m;
  if (m.job !== null) return 'busy';
  const e = state.elements[args.to];
  if (e === undefined) return 'unknown_element';
  const sector = state.map.sectors[e.sector];
  if (sector === undefined) return 'off_map';
  if (!canEnter(state, actor, sector)) return 'no_access';
  if (m.where.kind === 'at' && m.where.element === args.to) return 'already_there';
  return null;
}

function latticeOf(state: SimState): { hexW: number; hexH: number } {
  return { hexW: state.scene.hexW, hexH: state.scene.hexH };
}

function validateReveal(
  state: SimState,
  actor: ActorId,
  args: OrderArgs['reveal'],
  content: CompiledContent,
): Reject | null {
  const m = ownFreeMobile(state, actor, args.mobile);
  if (typeof m === 'string') return m;
  const sector = state.map.sectors[args.hex];
  if (sector === undefined) return 'off_map';
  if (sector.status !== 'hidden') return 'not_hidden';
  if (!canEnter(state, actor, sector)) return 'no_access';
  if (!hasRevealedNeighbor(state, args.hex)) return 'not_adjacent';
  const cost = content.actions.reveal;
  if (available(state, content, actor, cost.resource) < cost.cost) return `insufficient:${cost.resource}`;
  const target = center(parse(args.hex), latticeOf(state));
  if (planWork(state, content, m, target, null, baseWork(state, actor, 'reveal', cost)) === null)
    return 'dark';
  return null;
}

function supplied(state: SimState, content: CompiledContent, element: string): boolean {
  const e = state.elements[element];
  const consume = e === undefined ? undefined : content.elements[e.kind]?.consume;
  if (consume === undefined) return true;
  for (const id of sortedKeys(state.links)) {
    const l = state.links[id];
    if (l?.to === element && content.links?.[l.kind]?.carries === consume.resource) return true;
  }
  return false;
}

function validateToggle(
  state: SimState,
  content: CompiledContent,
  actor: ActorId,
  args: unknown,
): Reject | null {
  if (!isRecord(args) || !isStr(args.element) || !isBool(args.on)) return 'bad_args';
  const e = state.elements[args.element];
  if (e === undefined) return 'unknown_element';
  if (e.owner !== actor) return 'not_owner';
  if (content.elements[e.kind]?.switchable !== true) return 'not_switchable';
  if ((e.on === true) === args.on) return 'unchanged';
  if (args.on && !supplied(state, content, e.id)) return 'no_supply';
  return null;
}

function validateLedger(
  state: SimState,
  content: CompiledContent,
  args: OrderArgs['credit'] | OrderArgs['debit'],
  debit: boolean,
): Reject | null {
  const a = state.actors[args.actor];
  if (a === undefined) return 'unknown_actor';
  if (!Number.isSafeInteger(args.amount) || args.amount <= 0) return 'bad_amount';
  if (debit && available(state, content, args.actor, args.resource) < args.amount) {
    return `insufficient:${args.resource}`;
  }
  return null;
}

/**
 * Comprueba una intención contra el estado actual. Devuelve el motivo de rechazo o null.
 * Es la precomprobación del cliente y la comprobación del servidor: el mismo código.
 */
export function validate(state: SimState, intent: OrderIntent, content: CompiledContent): Reject | null {
  if (!ORDER_KINDS.includes(intent.kind)) return 'unknown_kind';
  if (intent.tick !== undefined && intent.tick < state.tick) return 'too_late';
  const system = SYSTEM_ORDER_KINDS.includes(intent.kind);
  if (system && intent.actor !== SYSTEM_ACTOR) return 'not_system';
  if (!system && state.actors[intent.actor] === undefined) return 'unknown_actor';
  if (!isRecord(intent.args)) return 'bad_args';
  switch (intent.kind) {
    case 'move':
      return validateMove(state, intent.actor, intent.args as OrderArgs['move']);
    case 'reveal':
      return validateReveal(state, intent.actor, intent.args as OrderArgs['reveal'], content);
    case 'build':
      return validateBuild(state, content, intent.actor, intent.args);
    case 'link':
      return validateLink(state, content, intent.actor, intent.args);
    case 'job':
      return validateJob(state, content, intent.actor, intent.args);
    case 'toggle':
      return validateToggle(state, content, intent.actor, intent.args);
    case 'hire':
      return validateHire(state, content, intent.actor, intent.args);
    case 'deliver':
      return validateDeliver(state, content, intent.actor, intent.args);
    case 'route':
      return validateRoute(state, content, intent.actor, intent.args);
    case 'cancel':
      return validateCancel(state, intent.actor, intent.args);
    case 'unload':
      return validateUnload(state, content, intent.actor, intent.args);
    case 'skip': {
      const { ticks } = intent.args as OrderArgs['skip'];
      return Number.isSafeInteger(ticks) && ticks > 0 ? null : 'bad_amount';
    }
    case 'content':
      return (intent.args as OrderArgs['content']).hash === content.hash ? null : 'content_mismatch';
    case 'credit':
      return validateLedger(state, content, intent.args as OrderArgs['credit'], false);
    case 'debit':
      return validateLedger(state, content, intent.args as OrderArgs['debit'], true);
  }
}

function execute(
  state: SimState,
  order: Order,
  content: CompiledContent,
  events: Event[],
  effects: StepEffects,
): void {
  switch (order.kind) {
    case 'move': {
      const args = order.args as OrderArgs['move'];
      const m = get(state.mobiles, args.mobile, 'móvil');
      const e = get(state.elements, args.to, 'elemento');
      const trip = startTrip(state, content, m, e.pos, e.id, order.seq);
      events.push({ tick: state.tick, kind: 'trip_started', mobile: m.id, arriveTick: trip.arriveTick });
      return;
    }
    case 'reveal': {
      const args = order.args as OrderArgs['reveal'];
      const m = get(state.mobiles, args.mobile, 'móvil');
      const cost = content.actions.reveal;
      const target = center(parse(args.hex), latticeOf(state));
      const plan = planWork(state, content, m, target, null, baseWork(state, order.actor, 'reveal', cost));
      if (plan === null) throw new Error('abrir: sin luz (debió rechazarse)');
      pay(state, content, order.actor, { [cost.resource]: cost.cost }, events, 'reveal');
      markStarted(state, order.actor, 'reveal', cost);
      const trip = startTrip(state, content, m, target, null, order.seq);
      m.job = { kind: 'reveal', hex: args.hex, startTick: plan.arrive, endTick: plan.end };
      events.push({ tick: state.tick, kind: 'trip_started', mobile: m.id, arriveTick: trip.arriveTick });
      return;
    }
    case 'build':
      startBuild(state, content, order, events);
      return;
    case 'link':
      startLink(state, content, order, events);
      return;
    case 'job':
      startJob(state, content, order, events);
      return;
    case 'toggle': {
      const args = order.args as OrderArgs['toggle'];
      const e = get(state.elements, args.element, 'elemento');
      e.on = args.on;
      events.push({ tick: state.tick, kind: 'switched', element: e.id, on: args.on, reason: 'order' });
      return;
    }
    case 'hire':
      startHire(state, content, order, events);
      return;
    case 'deliver':
      startDeliver(state, content, order, events);
      return;
    case 'route':
      startRoute(state, content, order, events);
      return;
    case 'cancel':
      applyCancel(state, order, events);
      return;
    case 'unload':
      applyUnload(state, content, order, events);
      return;
    case 'skip': {
      const { ticks } = order.args as OrderArgs['skip'];
      effects.skip += ticks;
      events.push({ tick: state.tick, kind: 'skipped', ticks });
      return;
    }
    case 'content': {
      const { hash } = order.args as OrderArgs['content'];
      state.scene.contentHash = hash;
      events.push({ tick: state.tick, kind: 'content_changed', hash });
      return;
    }
    case 'credit': {
      const args = order.args as OrderArgs['credit'];
      put(state, content, args.actor, args.resource, args.amount, events, args.ref);
      return;
    }
    case 'debit': {
      const args = order.args as OrderArgs['debit'];
      take(state, content, args.actor, args.resource, args.amount, events, args.ref);
      return;
    }
  }
}

/** Aplica una orden en su tick: valida de nuevo, ejecuta o rechaza con evento. */
export function apply(
  state: SimState,
  order: Order,
  content: CompiledContent,
  events: Event[],
  effects: StepEffects,
): void {
  if (order.tick !== state.tick) {
    throw new Error(`apply: la orden ${order.seq} es del tick ${order.tick}, no del ${state.tick}`);
  }
  const reason = validate(state, order, content);
  if (reason !== null) {
    events.push({ tick: state.tick, kind: 'rejected', seq: order.seq, reason });
    return;
  }
  execute(state, order, content, events, effects);
  const actor = state.actors[order.actor];
  if (actor !== undefined) actor.lastOrderTick = state.tick;
}

export type { OrderKind };
