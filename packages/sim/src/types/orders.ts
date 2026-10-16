/**
 * Órdenes. Esquema del paquete sim, §8.
 *
 * El registro de órdenes es la verdad: todo estado se deriva de él. Una orden inválida en su
 * tick no se borra: queda en el registro y produce el evento `rejected`.
 */

import type { HexKey } from '../hex.js';
import type { ActorId, ElementId, Int, MobileId, ResourceId, Tick } from './ids.js';

export interface OrderArgs {
  // ---- del jugador (F0) ----
  /** Mueve un móvil libre a un elemento. */
  move: { mobile: MobileId; to: ElementId };
  /** Manda un obrero a abrir un sector oculto adyacente a uno abierto; cuesta energía y tiempo. */
  reveal: { mobile: MobileId; hex: HexKey };
  // ---- del sistema (formato fijado ya; uso desde F2) ----
  /** Puesta al día más allá del tope: el tick salta sin producir. */
  skip: { ticks: Int };
  /** Cambio de tablas en caliente. */
  content: { hash: string };
  /** Apunte del libro u otra escena: entra en los stocks del actor. */
  credit: { actor: ActorId; resource: ResourceId; amount: Int; ref: string };
  /** Apunte del libro u otra escena: sale de los stocks del actor. */
  debit: { actor: ActorId; resource: ResourceId; amount: Int; ref: string };
}

export type OrderKind = keyof OrderArgs;

export const ORDER_KINDS: readonly OrderKind[] = ['move', 'reveal', 'skip', 'content', 'credit', 'debit'];

/** Órdenes que solo puede emitir el sistema. */
export const SYSTEM_ORDER_KINDS: readonly OrderKind[] = ['skip', 'content', 'credit', 'debit'];

export interface Order<K extends OrderKind = OrderKind> {
  /** Único y creciente en el registro de la escena; lo asigna el árbitro. */
  seq: Int;
  /** Tick en el que se ejecuta. */
  tick: Tick;
  /** 'sys' para el sistema. */
  actor: ActorId;
  kind: K;
  args: OrderArgs[K];
}

/** Lo que propone un cliente: sin seq, y con tick solo como petición. */
export interface OrderIntent<K extends OrderKind = OrderKind> {
  actor: ActorId;
  kind: K;
  args: OrderArgs[K];
  tick?: Tick;
}

/** Ordenado por (tick, seq). */
export type OrderLog = Order[];

export type Reject =
  | 'too_late'
  | 'unknown_kind'
  | 'not_system'
  | 'unknown_actor'
  | 'unknown_mobile'
  | 'not_owner'
  | 'busy'
  | 'unknown_element'
  | 'already_there'
  | 'no_access'
  | 'off_map'
  | 'not_hidden'
  | 'not_adjacent'
  | 'bad_amount'
  | 'content_mismatch'
  | `insufficient:${ResourceId}`;

export function compareOrders(a: Order, b: Order): number {
  return a.tick !== b.tick ? a.tick - b.tick : a.seq - b.seq;
}
