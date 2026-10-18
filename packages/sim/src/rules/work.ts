/**
 * Lo común a las tareas de los obreros: quién puede hacerlas, cuánto trabajo son y cuándo
 * terminan. Diseño de la casa §5 y §7; registro C3 y C7.
 *
 * El fin de una tarea se calcula al dar la orden: llegada más el trabajo, contando solo los
 * ticks con luz de trabajo. Lo que cambie después (la comida de mañana, la luz) no lo mueve.
 * Un obrero sin comer al dar la orden rinde menos durante toda la tarea. La primera vez que
 * un actor hace cada tarea con variante corta, dura lo de la variante (entrada fácil).
 */

import { ceilDiv, mul } from '../arith.js';
import { workEnd } from '../calendar.js';
import type { Vec } from '../geom.js';
import type { CompiledContent } from '../types/content.js';
import type { ActorId, ElementId, Int, MobileId, Permille, Tick } from '../types/ids.js';
import type { Reject } from '../types/orders.js';
import type { Mobile, SimState } from '../types/state.js';
import { plannedArrival } from './movement.js';

export function ownMobile(state: SimState, actor: ActorId, id: MobileId): Mobile | Reject {
  const m = state.mobiles[id];
  if (m === undefined) return 'unknown_mobile';
  if (m.owner !== actor) return 'not_owner';
  return m;
}

/** Un móvil propio y sin tarea. */
export function ownFreeMobile(state: SimState, actor: ActorId, id: MobileId): Mobile | Reject {
  const m = ownMobile(state, actor, id);
  if (typeof m === 'string') return m;
  if (m.job !== null) return 'busy';
  return m;
}

export interface WorkSpecLike {
  ticks: Int;
  firstTicks?: Int;
}

/** Ticks de trabajo de una tarea para un actor: la variante corta si es su primera vez. */
export function baseWork(state: SimState, actor: ActorId, key: string, spec: WorkSpecLike): Int {
  if (spec.firstTicks === undefined) return spec.ticks;
  const done = state.actors[actor]?.started?.[key] ?? 0;
  return done === 0 ? spec.firstTicks : spec.ticks;
}

/** Apunta que el actor ha empezado una tarea con variante corta (solo esas cuentan). */
export function markStarted(state: SimState, actor: ActorId, key: string, spec: WorkSpecLike): void {
  if (spec.firstTicks === undefined) return;
  const a = state.actors[actor];
  if (a === undefined) return;
  const started = a.started ?? {};
  started[key] = (started[key] ?? 0) + 1;
  a.started = started;
}

/** Rendimiento de un obrero en milésimas: 1000, o `hungryPermille` si no ha comido. */
export function performance(content: CompiledContent, m: Mobile): Permille {
  if (m.hungry !== true) return 1000;
  const permille = content.mobiles[m.kind]?.hungryPermille;
  if (permille === undefined || permille >= 1000 || permille <= 0) return 1000;
  return permille;
}

/** Trabajo efectivo de un obrero: sin comer, rinde `hungryPermille` milésimas. */
export function effectiveWork(content: CompiledContent, m: Mobile, work: Int): Int {
  const permille = performance(content, m);
  if (permille === 1000) return work;
  return ceilDiv(mul(work, 1000), permille);
}

/** Si el actor no ha empezado nunca una tarea con variante corta (la primera vez vale la corta). */
export function isFirstTime(state: SimState, actor: ActorId, key: string, spec: WorkSpecLike): boolean {
  return spec.firstTicks !== undefined && (state.actors[actor]?.started?.[key] ?? 0) === 0;
}

export interface Plan {
  arrive: Tick;
  end: Tick;
}

/**
 * Llegada y fin de una tarea que empezara ahora: viaje hasta `to` y `work` ticks de trabajo
 * con luz. null si nunca habría luz para terminarla.
 */
export function planWork(
  state: SimState,
  content: CompiledContent,
  m: Mobile,
  to: Vec,
  toElement: ElementId | null,
  work: Int,
): Plan | null {
  const arrive = plannedArrival(state, content, m, to, toElement);
  const end = workEnd(state, content, arrive, effectiveWork(content, m, work));
  return end === null ? null : { arrive, end };
}
