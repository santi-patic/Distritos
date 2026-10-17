/**
 * Elementos: creación con sus campos de F1 y lectura de almacenes. Esquema del paquete sim, §7.
 *
 * Un elemento nace con los campos que su tipo necesita (almacenes y restos a cero, apagado si
 * es conmutable, desgaste a cero si se desgasta) y sin los demás: unas tablas sin almacenes
 * dan los mismos elementos que en F0.
 */

import { fdiv, mul } from '../arith.js';
import type { Vec } from '../geom.js';
import type { HexKey } from '../hex.js';
import { sortedKeys } from '../iter.js';
import type { CompiledContent, ElementKind } from '../types/content.js';
import type { ActorId, Int, KindId, ResourceId } from '../types/ids.js';
import type { Element, SimState } from '../types/state.js';

export function kindOf(content: CompiledContent, e: Element): ElementKind | undefined {
  return content.elements[e.kind];
}

export interface NewElement {
  kind: KindId;
  pos: Vec;
  sector: HexKey;
  owner?: ActorId;
  builtBy?: ActorId[];
}

/** Crea un elemento con id nuevo y lo añade al estado. */
export function addElement(state: SimState, content: CompiledContent, spec: NewElement): Element {
  state.counters.element += 1;
  const element: Element = {
    id: `e${state.counters.element}`,
    kind: spec.kind,
    pos: spec.pos,
    sector: spec.sector,
    level: 1,
  };
  if (spec.owner !== undefined) element.owner = spec.owner;
  if (spec.builtBy !== undefined) element.builtBy = [...spec.builtBy];
  const k = content.elements[spec.kind];
  if (k?.stores !== undefined) {
    const store: Record<ResourceId, Int> = {};
    const carry: Record<string, Int> = {};
    for (const r of sortedKeys(k.stores)) {
      store[r] = 0;
      carry[r] = 0;
    }
    element.store = store;
    element.carry = carry;
  }
  if (k?.soil !== undefined || k?.cycles !== undefined) element.wear = 0;
  if (k?.cycles !== undefined) element.drawn = 0;
  if (k?.switchable === true) element.on = false;
  state.elements[element.id] = element;
  return element;
}

/** Capacidad de un almacén; la de una batería baja con el desgaste por ciclos. */
export function capacityOf(content: CompiledContent, e: Element, resource: ResourceId): Int {
  const k = content.elements[e.kind];
  const base = k?.stores?.[resource] ?? 0;
  if (k?.cycles === undefined) return base;
  return fdiv(mul(base, 1000 - (e.wear ?? 0)), 1000);
}

export function levelOf(e: Element, resource: ResourceId): Int {
  return e.store?.[resource] ?? 0;
}

/** Fija la existencia de un almacén (debe existir en el tipo). */
export function setLevel(e: Element, resource: ResourceId, value: Int): void {
  if (e.store === undefined) throw new Error(`almacén inexistente: ${e.id}.${resource}`);
  e.store[resource] = value;
}

/** Si el elemento tiene almacén de ese recurso. */
export function stores(content: CompiledContent, e: Element, resource: ResourceId): boolean {
  return content.elements[e.kind]?.stores?.[resource] !== undefined;
}
