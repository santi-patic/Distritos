/**
 * Existencias de un actor. Diseño de la casa §3 (C1).
 *
 * Un recurso físico (energía, agua, comida, madera, piedra) vive en los almacenes de los
 * elementos; las existencias de un actor son los almacenes de sus elementos marcados como
 * `inventory` (la batería, la casa, el cobertizo), recorridos por id. Un recurso de libro
 * (Eagles) vive en `ActorState.stocks`. Sin tabla de recursos, todo es de libro, como en F0.
 */

import { min, mul } from '../arith.js';
import { sortedKeys } from '../iter.js';
import type { CompiledContent } from '../types/content.js';
import type { Event } from '../types/events.js';
import type { ActorId, Int, ResourceId } from '../types/ids.js';
import type { Element, SimState } from '../types/state.js';
import { capacityOf, levelOf, setLevel } from './elements.js';

export function isPhysical(content: CompiledContent, resource: ResourceId): boolean {
  return content.resources?.[resource]?.physical === true;
}

/** Almacenes del actor que cuentan como existencias de un recurso, por id. */
export function inventoryOf(
  state: SimState,
  content: CompiledContent,
  actor: ActorId,
  resource: ResourceId,
): Element[] {
  const out: Element[] = [];
  for (const id of sortedKeys(state.elements)) {
    const e = state.elements[id];
    if (e?.owner !== actor) continue;
    const k = content.elements[e.kind];
    if (k?.inventory !== true || k.stores?.[resource] === undefined) continue;
    out.push(e);
  }
  return out;
}

/** Cuánto tiene el actor de un recurso. */
export function available(
  state: SimState,
  content: CompiledContent,
  actor: ActorId,
  resource: ResourceId,
): Int {
  if (!isPhysical(content, resource)) return state.actors[actor]?.stocks[resource] ?? 0;
  let sum = 0;
  for (const e of inventoryOf(state, content, actor, resource)) sum += levelOf(e, resource);
  return sum;
}

/** Cuánto cabe todavía en las existencias del actor (los recursos de libro no tienen tope). */
export function room(state: SimState, content: CompiledContent, actor: ActorId, resource: ResourceId): Int {
  if (!isPhysical(content, resource)) return Number.MAX_SAFE_INTEGER;
  let sum = 0;
  for (const e of inventoryOf(state, content, actor, resource)) {
    sum += capacityOf(content, e, resource) - levelOf(e, resource);
  }
  return sum;
}

/** Primer recurso (por id) del que el actor no tiene bastante para pagar, o null. */
export function lacking(
  state: SimState,
  content: CompiledContent,
  actor: ActorId,
  cost: Readonly<Record<ResourceId, Int>> | undefined,
): ResourceId | null {
  if (cost === undefined) return null;
  for (const r of sortedKeys(cost)) {
    if (available(state, content, actor, r) < (cost[r] ?? 0)) return r;
  }
  return null;
}

/** Saca hasta `amount` de las existencias del actor; devuelve lo sacado. */
export function take(
  state: SimState,
  content: CompiledContent,
  actor: ActorId,
  resource: ResourceId,
  amount: Int,
  events: Event[],
  reason: string,
): Int {
  if (amount <= 0) return 0;
  if (!isPhysical(content, resource)) {
    const a = state.actors[actor];
    if (a === undefined) return 0;
    const have = a.stocks[resource] ?? 0;
    const taken = min(have, amount);
    a.stocks[resource] = have - taken;
    events.push({ tick: state.tick, kind: 'stock', actor, resource, delta: -taken, reason });
    return taken;
  }
  let left = amount;
  for (const e of inventoryOf(state, content, actor, resource)) {
    if (left === 0) break;
    const have = levelOf(e, resource);
    const taken = min(have, left);
    if (taken === 0) continue;
    setLevel(e, resource, have - taken);
    left -= taken;
    events.push({ tick: state.tick, kind: 'store', element: e.id, resource, delta: -taken, reason });
  }
  return amount - left;
}

/** Guarda hasta `amount` en las existencias del actor; devuelve lo guardado (lo que no cabe se pierde). */
export function put(
  state: SimState,
  content: CompiledContent,
  actor: ActorId,
  resource: ResourceId,
  amount: Int,
  events: Event[],
  reason: string,
): Int {
  if (amount <= 0) return 0;
  if (!isPhysical(content, resource)) {
    const a = state.actors[actor];
    if (a === undefined) return 0;
    a.stocks[resource] = (a.stocks[resource] ?? 0) + amount;
    events.push({ tick: state.tick, kind: 'stock', actor, resource, delta: amount, reason });
    return amount;
  }
  let left = amount;
  for (const e of inventoryOf(state, content, actor, resource)) {
    if (left === 0) break;
    const have = levelOf(e, resource);
    const stored = min(capacityOf(content, e, resource) - have, left);
    if (stored <= 0) continue;
    setLevel(e, resource, have + stored);
    left -= stored;
    events.push({ tick: state.tick, kind: 'store', element: e.id, resource, delta: stored, reason });
  }
  return amount - left;
}

/** Cobra un coste completo (quien llama ha comprobado antes que alcanza). */
export function pay(
  state: SimState,
  content: CompiledContent,
  actor: ActorId,
  cost: Readonly<Record<ResourceId, Int>> | undefined,
  events: Event[],
  reason: string,
): void {
  if (cost === undefined) return;
  for (const r of sortedKeys(cost)) take(state, content, actor, r, cost[r] ?? 0, events, reason);
}

/** Suma dos costes. */
export function addCosts(
  a: Readonly<Record<ResourceId, Int>> | undefined,
  b: Readonly<Record<ResourceId, Int>> | undefined,
  times: Int = 1,
): Record<ResourceId, Int> {
  const out: Record<ResourceId, Int> = {};
  if (a !== undefined) for (const r of sortedKeys(a)) out[r] = a[r] ?? 0;
  if (b !== undefined) for (const r of sortedKeys(b)) out[r] = (out[r] ?? 0) + mul(b[r] ?? 0, times);
  return out;
}
