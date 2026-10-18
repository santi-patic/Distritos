/**
 * Órdenes. Esquema del paquete sim, §8.
 *
 * El registro de órdenes es la verdad: todo estado se deriva de él. Una orden inválida en su
 * tick no se borra: queda en el registro y produce el evento `rejected`.
 */

import type { Vec } from '../geom.js';
import type { HexKey } from '../hex.js';
import type { ActorId, ElementId, Int, KindId, MobileId, ResourceId, Tick } from './ids.js';

export interface OrderArgs {
  // ---- del jugador (F0) ----
  /** Mueve un móvil libre a un elemento. */
  move: { mobile: MobileId; to: ElementId };
  /** Manda un obrero a abrir un sector oculto adyacente a uno abierto; cuesta energía y tiempo. */
  reveal: { mobile: MobileId; hex: HexKey };
  // ---- del jugador (F1) ----
  /** Manda un obrero a levantar un edificio en un punto de un sector abierto propio. */
  build: { mobile: MobileId; kind: KindId; pos: Vec };
  /** Manda un obrero a tender un nexo (cable, canal, camino) entre dos elementos propios. */
  link: { mobile: MobileId; kind: KindId; from: ElementId; to: ElementId };
  /** Manda un obrero a hacer una tarea sobre un elemento (sacar agua, recoger, limpiar…). */
  job: { mobile: MobileId; element: ElementId; task: KindId };
  /** Enciende o apaga un elemento conmutable; no necesita obrero. */
  toggle: { element: ElementId; on: boolean };
  /** Contrata un obrero si hay cama libre; llega al amanecer. */
  hire: { kind: KindId };
  /** Manda un obrero a cumplir (en parte) el encargo de la pizarra del común. */
  deliver: { mobile: MobileId; encargo: Int };
  /** Manda un obrero a una ruta de recados por varios sitios, en orden. */
  route: { mobile: MobileId; stops: ElementId[] };
  /** Corta la ruta de un obrero: acaba en la parada a la que va o en la que está. */
  cancel: { mobile: MobileId };
  /** Deja los recados que lleva un obrero parado en el sitio donde está. */
  unload: { mobile: MobileId };
  /**
   * Pone nombre a un lugar o a un obrero (P16): uno de los dos. Un nombre vacío devuelve al
   * lugar el suyo por defecto; un obrero siempre tiene nombre.
   */
  rename: { element?: ElementId; mobile?: MobileId; name: string };
  // ---- del sistema (formato fijado ya; uso desde F2) ----
  /** Puesta al día más allá del tope: el tick salta sin producir. */
  skip: { ticks: Int };
  /** Cambio de tablas en caliente. */
  content: { hash: string };
  /** Apunte del libro u otra escena: entra en las existencias del actor. */
  credit: { actor: ActorId; resource: ResourceId; amount: Int; ref: string };
  /** Apunte del libro u otra escena: sale de las existencias del actor. */
  debit: { actor: ActorId; resource: ResourceId; amount: Int; ref: string };
}

export type OrderKind = keyof OrderArgs;

export const ORDER_KINDS: readonly OrderKind[] = [
  'move',
  'reveal',
  'build',
  'link',
  'job',
  'toggle',
  'hire',
  'deliver',
  'route',
  'cancel',
  'unload',
  'rename',
  'skip',
  'content',
  'credit',
  'debit',
];

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
  | 'bad_args'
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
  // F1
  | 'dark'
  | 'not_buildable'
  | 'bad_position'
  | 'too_close'
  | 'not_near'
  | 'not_linkable'
  | 'already_linked'
  | 'too_long'
  | 'not_switchable'
  | 'no_supply'
  | 'unchanged'
  | 'unknown_task'
  | 'wrong_element'
  | 'nothing_to_do'
  | 'not_hireable'
  | 'no_bed'
  | 'no_encargo'
  | 'encargo_done'
  | 'bad_route'
  | 'not_a_place'
  | 'no_route'
  | 'place_full'
  | 'opening'
  | 'bad_name'
  | `insufficient:${ResourceId}`
  | `full:${ResourceId}`;

export function compareOrders(a: Order, b: Order): number {
  return a.tick !== b.tick ? a.tick - b.tick : a.seq - b.seq;
}
