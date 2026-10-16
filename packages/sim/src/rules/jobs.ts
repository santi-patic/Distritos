/**
 * Tareas de los móviles. Esquema del paquete sim, §8.3 y §10.
 *
 * Una tarea se fija al dar la orden con ticks absolutos: empieza al llegar (startTick) y
 * termina en endTick. Al completarse produce su efecto (abrir un sector, en F0) y el móvil
 * queda libre.
 */

import { max } from '../arith.js';
import { sortedKeys } from '../iter.js';
import type { Event } from '../types/events.js';
import type { Tick } from '../types/ids.js';
import type { SimState } from '../types/state.js';
import { revealSector } from './fog.js';

/** Tareas que terminan en este tick, por id ordenado. */
export function processJobs(state: SimState, events: Event[]): void {
  for (const id of sortedKeys(state.mobiles)) {
    const m = state.mobiles[id];
    if (m === undefined || m.job === null) continue;
    if (m.job.endTick > state.tick) continue;
    const job = m.job;
    switch (job.kind) {
      case 'reveal':
        revealSector(state, job.hex, m.owner, events);
        break;
    }
    m.job = null;
    events.push({ tick: state.tick, kind: 'job_done', mobile: m.id, job });
  }
}

/** Próximo tick en que termina alguna tarea, o null. */
export function nextJobEnd(state: SimState): Tick | null {
  let next: Tick | null = null;
  for (const id of sortedKeys(state.mobiles)) {
    const m = state.mobiles[id];
    if (m === undefined || m.job === null) continue;
    const t = max(state.tick, m.job.endTick);
    if (next === null || t < next) next = t;
  }
  return next;
}
