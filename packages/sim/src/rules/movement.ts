/**
 * Movimiento lineal entre elementos. Esquema del paquete sim, §7.
 *
 * Un viaje es un compromiso: origen, destino y llegada se fijan al salir y la posición se
 * deriva con `positionOf`. No hay posición mutable por tick; «una vez iniciado no se detiene
 * ni se desvía» es estructural.
 */

import { ceilDiv, fdiv, max, mul } from '../arith.js';
import { dist, lerpVec, type Vec } from '../geom.js';
import { sortedKeys } from '../iter.js';
import type { CompiledContent } from '../types/content.js';
import type { ElementId, Int, MmPerS, Tick } from '../types/ids.js';
import type { Event } from '../types/events.js';
import type { Mobile, SimState, Trip } from '../types/state.js';

/** Posición de un móvil en un tick: la propia si está parado, interpolada si viaja. */
export function positionOf(m: Mobile, tick: Tick): Vec {
  if (m.where.kind === 'at') return m.where.pos;
  const t = m.where.trip;
  if (tick <= t.departTick) return t.from;
  if (tick >= t.arriveTick) return t.to;
  return lerpVec(t.from, t.to, tick - t.departTick, t.arriveTick - t.departTick);
}

/** Tick de llegada: al menos uno después de salir; ceil(dist·1000 / (velocidad·tickMs)). */
export function arrivalTick(from: Vec, to: Vec, speedMmPerS: Int, tickMs: Int, now: Tick): Tick {
  if (speedMmPerS <= 0) throw new RangeError('velocidad no positiva');
  const d = dist(from, to);
  return now + max(1, ceilDiv(mul(d, 1000), mul(speedMmPerS, tickMs)));
}

/**
 * Velocidad entre dos elementos: la base, o la del camino que los une si hay uno con velocidad
 * propia (F1). Movimiento lineal: solo cuenta el camino directo.
 */
export function speedBetween(
  state: SimState,
  content: CompiledContent,
  base: MmPerS,
  from: ElementId | null,
  to: ElementId | null,
): MmPerS {
  if (from === null || to === null) return base;
  let best = base;
  for (const id of sortedKeys(state.links)) {
    const link = state.links[id];
    if (link === undefined) continue;
    const joins = (link.from === from && link.to === to) || (link.from === to && link.to === from);
    if (!joins) continue;
    const permille = content.links?.[link.kind]?.speedPermille;
    if (permille === undefined) continue;
    const v = fdiv(mul(base, permille), 1000);
    if (v > best) best = v;
  }
  return best;
}

/**
 * Velocidad de un viaje: la del móvil, o la del camino si sale de un elemento unido al destino
 * por un nexo con velocidad propia (F1).
 */
export function tripSpeed(
  state: SimState,
  content: CompiledContent,
  m: Mobile,
  toElement: ElementId | null,
): MmPerS {
  const from = m.where.kind === 'at' ? m.where.element : null;
  return speedBetween(state, content, m.stats.speed, from, toElement);
}

/** Tick de llegada de un viaje que saliera ahora, sin lanzarlo. */
export function plannedArrival(
  state: SimState,
  content: CompiledContent,
  m: Mobile,
  to: Vec,
  toElement: ElementId | null,
): Tick {
  const speed = tripSpeed(state, content, m, toElement);
  return arrivalTick(positionOf(m, state.tick), to, speed, state.scene.tickMs, state.tick);
}

/** Lanza un viaje desde la posición actual del móvil. Si ya viajaba, el nuevo parte de donde está ahora. */
export function startTrip(
  state: SimState,
  content: CompiledContent,
  m: Mobile,
  to: Vec,
  toElement: ElementId | null,
  seq: Int,
): Trip {
  const from = positionOf(m, state.tick);
  const trip: Trip = {
    from,
    to,
    toElement,
    departTick: state.tick,
    arriveTick: arrivalTick(
      from,
      to,
      tripSpeed(state, content, m, toElement),
      state.scene.tickMs,
      state.tick,
    ),
    seq,
  };
  m.where = { kind: 'trip', trip };
  return trip;
}

/** Llegadas de este tick, por id ordenado. Si el móvil lleva tarea, la tarea empieza al llegar. */
export function processArrivals(state: SimState, events: Event[]): void {
  for (const id of sortedKeys(state.mobiles)) {
    const m = state.mobiles[id];
    if (m?.where.kind !== 'trip') continue;
    const t = m.where.trip;
    if (t.arriveTick > state.tick) continue;
    m.where = { kind: 'at', pos: t.to, element: t.toElement };
    events.push({ tick: state.tick, kind: 'arrived', mobile: m.id, element: t.toElement });
    if (m.job !== null && m.job.startTick <= state.tick) {
      events.push({ tick: state.tick, kind: 'job_started', mobile: m.id, job: m.job });
    }
  }
}

/** Próximo tick con una llegada pendiente, o null. */
export function nextArrival(state: SimState): Tick | null {
  let next: Tick | null = null;
  for (const id of sortedKeys(state.mobiles)) {
    const m = state.mobiles[id];
    if (m?.where.kind !== 'trip') continue;
    const t = max(state.tick, m.where.trip.arriveTick);
    if (next === null || t < next) next = t;
  }
  return next;
}
