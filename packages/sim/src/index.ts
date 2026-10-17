/**
 * @distritos/sim — simulación determinista compartida por cliente y servidor.
 *
 * Tick fijo, enteros, estado como pliegue de órdenes, hash de estado, azar sembrado dentro
 * del estado. Ver «Esquema del paquete sim — F0» en el proyecto SURGO - EL JUEGO.
 */

// Núcleo: no contiene diseño de juego.
export * as arith from './arith.js';
export * as rng from './rng.js';
export * as hex from './hex.js';
export * as geom from './geom.js';
export * as iter from './iter.js';
export type { Int, Rate } from './arith.js';
export type { RngState } from './rng.js';
export type { Hex, HexKey, Lattice } from './hex.js';
export type { Vec } from './geom.js';
export { canon, hashOf, sha256Hex, shortHash } from './hash.js';
export { serialize, deserialize, clone, assertAllIntegers } from './serialize.js';
export { RULES_VERSION } from './version.js';

// Tipos.
export type * from './types/ids.js';
export { SYSTEM_ACTOR } from './types/ids.js';
export type * from './types/state.js';
export { STATE_VERSION } from './types/state.js';
export type * from './types/orders.js';
export { ORDER_KINDS, SYSTEM_ORDER_KINDS, compareOrders } from './types/orders.js';
export type * from './types/events.js';
export type * from './types/content.js';
export { NOTHING } from './types/content.js';

// Escena, órdenes, paso, vista.
export { createScene, EMPTY_CHARACTER } from './scene.js';
export type { SceneParams, SceneActorParams } from './scene.js';
export { validate } from './rules/orders.js';
export { step, advance, replay, nextEventTick } from './step.js';
export { view } from './view.js';
export type { PublicState, UnknownSector, ActorSummary } from './view.js';
export { positionOf, arrivalTick, tripSpeed, plannedArrival } from './rules/movement.js';
export {
  light,
  phaseAt,
  nextLightChange,
  workable,
  workEnd,
  nextWorkStart,
  isDailyTick,
  nextDailyTick,
} from './calendar.js';
export { canSee, canEnter, PLOT_ACCESS, COMMON_ACCESS } from './access.js';

// Lecturas de F1 para la interfaz: almacenes, flujos, existencias, camas, tareas.
export { resolveFlows, rateDen } from './rules/flows.js';
export type { Flows, StoreFlow } from './rules/flows.js';
export { available, room, isPhysical } from './rules/inventory.js';
export { capacityOf, levelOf } from './rules/elements.js';
export { bedsOf, workersOf } from './rules/workers.js';
export { taskVariant } from './rules/tasks.js';
export { flowRoles } from './rules/links.js';
export { planWork, effectiveWork, baseWork } from './rules/work.js';

import { hashOf } from './hash.js';
import type { ActorId } from './types/ids.js';
import type { SimState } from './types/state.js';
import { view } from './view.js';

/**
 * Hash del estado completo, o de la vista de un actor si se indica. Dos escenas con la misma
 * plantilla, semilla, tablas, versión y registro dan el mismo hash en cualquier máquina.
 */
export function hashState(state: SimState, opts?: { actor?: ActorId }): string {
  return hashOf(opts?.actor === undefined ? state : view(state, opts.actor));
}
