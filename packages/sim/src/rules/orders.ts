/**
 * Validación y aplicación de órdenes. Esquema del paquete sim, §8.
 *
 * `validate` es la misma función en cliente y servidor: precomprueba una intención contra el
 * estado actual. `apply` vuelve a validar en el tick de ejecución (el estado puede haber
 * cambiado) y, si la orden ya no vale, la deja en el registro con el evento `rejected`.
 */

import { canEnter } from '../access.js';
import { center, parse } from '../hex.js';
import { get } from '../iter.js';
import type { CompiledContent } from '../types/content.js';
import type { Event } from '../types/events.js';
import { SYSTEM_ACTOR } from '../types/ids.js';
import type { Order, OrderArgs, OrderIntent, OrderKind, Reject } from '../types/orders.js';
import { ORDER_KINDS, SYSTEM_ORDER_KINDS } from '../types/orders.js';
import type { Mobile, SimState } from '../types/state.js';
import { hasRevealedNeighbor } from './fog.js';
import { startTrip } from './movement.js';

/** Efectos de una orden sobre el bucle del paso (no sobre el estado). */
export interface StepEffects {
  /** Ticks que el tick salta al final del paso (orden `skip`). */
  skip: number;
}

function ownMobile(state: SimState, actor: string, id: string): Mobile | Reject {
  const m = state.mobiles[id];
  if (m === undefined) return 'unknown_mobile';
  if (m.owner !== actor) return 'not_owner';
  return m;
}

function validateMove(state: SimState, actor: string, args: OrderArgs['move']): Reject | null {
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

function validateReveal(
  state: SimState,
  actor: string,
  args: OrderArgs['reveal'],
  content: CompiledContent,
): Reject | null {
  const m = ownMobile(state, actor, args.mobile);
  if (typeof m === 'string') return m;
  if (m.job !== null) return 'busy';
  const sector = state.map.sectors[args.hex];
  if (sector === undefined) return 'off_map';
  if (sector.status !== 'hidden') return 'not_hidden';
  if (!canEnter(state, actor, sector)) return 'no_access';
  if (!hasRevealedNeighbor(state, args.hex)) return 'not_adjacent';
  const cost = content.actions.reveal;
  const stock = state.actors[actor]?.stocks[cost.resource] ?? 0;
  if (stock < cost.cost) return `insufficient:${cost.resource}`;
  return null;
}

function validateLedger(
  state: SimState,
  args: OrderArgs['credit'] | OrderArgs['debit'],
  debit: boolean,
): Reject | null {
  const a = state.actors[args.actor];
  if (a === undefined) return 'unknown_actor';
  if (!Number.isSafeInteger(args.amount) || args.amount <= 0) return 'bad_amount';
  if (debit && (a.stocks[args.resource] ?? 0) < args.amount) return `insufficient:${args.resource}`;
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
  switch (intent.kind) {
    case 'move':
      return validateMove(state, intent.actor, intent.args as OrderArgs['move']);
    case 'reveal':
      return validateReveal(state, intent.actor, intent.args as OrderArgs['reveal'], content);
    case 'skip': {
      const { ticks } = intent.args as OrderArgs['skip'];
      return Number.isSafeInteger(ticks) && ticks > 0 ? null : 'bad_amount';
    }
    case 'content':
      return (intent.args as OrderArgs['content']).hash === content.hash ? null : 'content_mismatch';
    case 'credit':
      return validateLedger(state, intent.args as OrderArgs['credit'], false);
    case 'debit':
      return validateLedger(state, intent.args as OrderArgs['debit'], true);
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
      const trip = startTrip(state, m, e.pos, e.id, order.seq);
      events.push({ tick: state.tick, kind: 'trip_started', mobile: m.id, arriveTick: trip.arriveTick });
      return;
    }
    case 'reveal': {
      const args = order.args as OrderArgs['reveal'];
      const m = get(state.mobiles, args.mobile, 'móvil');
      const cost = content.actions.reveal;
      const actor = get(state.actors, order.actor, 'actor');
      actor.stocks[cost.resource] = (actor.stocks[cost.resource] ?? 0) - cost.cost;
      events.push({
        tick: state.tick,
        kind: 'stock',
        actor: order.actor,
        resource: cost.resource,
        delta: -cost.cost,
        reason: 'reveal',
      });
      const target = center(parse(args.hex), { hexW: state.scene.hexW, hexH: state.scene.hexH });
      const trip = startTrip(state, m, target, null, order.seq);
      m.job = {
        kind: 'reveal',
        hex: args.hex,
        startTick: trip.arriveTick,
        endTick: trip.arriveTick + cost.ticks,
      };
      events.push({ tick: state.tick, kind: 'trip_started', mobile: m.id, arriveTick: trip.arriveTick });
      return;
    }
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
    case 'credit':
    case 'debit': {
      const args = order.args as OrderArgs['credit'];
      const actor = get(state.actors, args.actor, 'actor');
      const delta = order.kind === 'credit' ? args.amount : -args.amount;
      actor.stocks[args.resource] = (actor.stocks[args.resource] ?? 0) + delta;
      events.push({
        tick: state.tick,
        kind: 'stock',
        actor: args.actor,
        resource: args.resource,
        delta,
        reason: args.ref,
      });
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
