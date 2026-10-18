/**
 * El paso de tick, el avance por saltos y la repetición. Esquema del paquete sim, §5.4 y §10.
 *
 *   step: órdenes por seq → llegadas → fin de tareas (y paradas de las rutas) → aperturas que
 *         acaban → contratados que llegan → [paso diario] → los que no han comido comen →
 *         recados (generar, caducar) → tasas (apagados y un tick de flujos) → tick + 1
 *
 * `step` muta el estado que recibe y devuelve los eventos; quien necesite conservar un estado
 * lo clona antes. `advance` salta los tramos en los que no hay nada que hacer: acumula los
 * flujos de todo el tramo con fórmula cerrada (igual que tick a tick, lo exige la batería
 * «rápido = lento») y ejecuta `step` en el siguiente tick con algo: una orden, una llegada, un
 * fin de tarea o de parada, una apertura que acaba, una contratación, el paso diario, un recado
 * que se genera o caduca, o un cambio de tasas.
 */

import { min } from './arith.js';
import { isDailyTick, nextDailyTick } from './calendar.js';
import { at } from './iter.js';
import { createScene, type SceneParams } from './scene.js';
import { dailyStep } from './rules/daily.js';
import { nextErrandEvent, processErrands } from './rules/errands.js';
import { flowsJump, flowsStep, nextFlowEvent } from './rules/flows.js';
import { nextOpeningEnd, processOpenings } from './rules/fog.js';
import { processJobs, nextJobEnd } from './rules/jobs.js';
import { nextArrival, processArrivals } from './rules/movement.js';
import { apply, type StepEffects } from './rules/orders.js';
import { feedHungry, nextHire, processHires } from './rules/workers.js';
import type { CompiledContent } from './types/content.js';
import type { Event } from './types/events.js';
import type { Tick } from './types/ids.js';
import { compareOrders, type Order, type OrderLog } from './types/orders.js';
import type { SimState } from './types/state.js';

/** Ejecuta el tick actual con sus órdenes y deja el estado en el tick siguiente. Muta `state`. */
export function step(state: SimState, orders: readonly Order[], content: CompiledContent): Event[] {
  const events: Event[] = [];
  const effects: StepEffects = { skip: 0 };
  const sorted = [...orders].sort(compareOrders);
  for (const o of sorted) apply(state, o, content, events, effects);
  processArrivals(state, events);
  processJobs(state, content, events);
  processOpenings(state, content, events);
  processHires(state, content, events);
  if (isDailyTick(state, content)) dailyStep(state, content, events);
  feedHungry(state, content, events);
  processErrands(state, content, events);
  flowsStep(state, content, events);
  state.tick += 1 + effects.skip;
  return events;
}

function earliest(a: Tick | null, b: Tick | null): Tick | null {
  if (a === null) return b;
  if (b === null) return a;
  return min(a, b);
}

/** Próximo tick ≥ el actual con algo que hacer sin contar las órdenes, o null si no hay nada. */
export function nextEventTick(state: SimState, content: CompiledContent): Tick | null {
  let next = earliest(nextArrival(state), nextJobEnd(state));
  next = earliest(next, nextHire(state));
  next = earliest(next, nextDailyTick(state, content, state.tick));
  next = earliest(next, nextFlowEvent(state, content));
  next = earliest(next, nextErrandEvent(state));
  next = earliest(next, nextOpeningEnd(state));
  return next;
}

/**
 * Avanza el estado hasta `until` (exclusivo: el estado queda con tick = until) aplicando las
 * órdenes del registro que caigan en el camino. Las órdenes anteriores al tick actual se
 * consideran ya aplicadas y se ignoran. El registro debe estar ordenado por (tick, seq).
 */
export function advance(state: SimState, log: OrderLog, until: Tick, content: CompiledContent): Event[] {
  const events: Event[] = [];
  let i = 0;
  while (state.tick < until) {
    // Órdenes anteriores al tick actual (ya aplicadas, o caídas dentro de un `skip`): se ignoran.
    while (i < log.length && at(log, i).tick < state.tick) i++;
    const nextOrder = i < log.length ? at(log, i).tick : null;
    const nextEvent = nextEventTick(state, content);
    let target = until;
    if (nextOrder !== null && nextOrder < target) target = nextOrder;
    if (nextEvent !== null && nextEvent < target) target = nextEvent;
    if (target > state.tick) {
      // Tramo sin nada que hacer: los flujos se acumulan en bloque y el tick salta.
      flowsJump(state, content, target - state.tick);
      state.tick = target;
      if (state.tick >= until) break;
    }
    const batch: Order[] = [];
    while (i < log.length && at(log, i).tick === state.tick) batch.push(at(log, i++));
    for (const e of step(state, batch, content)) events.push(e);
  }
  return events;
}

/** Reconstruye el estado en `until` desde los parámetros de la escena y el registro. */
export function replay(params: SceneParams, log: OrderLog, until: Tick, content: CompiledContent): SimState {
  const state = createScene(params, content);
  advance(state, log, until, content);
  return state;
}
