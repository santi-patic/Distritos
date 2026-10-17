/**
 * Calendario: el ciclo día-noche en ticks. Esquema del paquete sim, §5.3.
 *
 * La luz es una curva por tramos constantes en la tabla de escena: pares [tick del ciclo,
 * milésimas], ordenados y dentro de [0, dayTicks). Cada punto fija la luz desde su tick hasta
 * el siguiente; antes del primer punto rige el último (el ciclo envuelve). Tramos constantes
 * y no rampas: así la producción solar y las ventanas de trabajo son constantes entre dos
 * cambios de luz, y el avance por saltos acumula con fórmula cerrada.
 *
 * Las tareas solo avanzan con luz de trabajo (`workLight`); su fin se calcula al dar la orden
 * saltando los tramos oscuros, de modo que sigue siendo una hora conocida.
 */

import { fmod } from './arith.js';
import { at } from './iter.js';
import type { CompiledContent } from './types/content.js';
import type { Int, Permille, Tick } from './types/ids.js';
import type { SimState } from './types/state.js';

/** Fase del ciclo (0..dayTicks−1) en un tick. */
export function phaseAt(state: SimState, tick: Tick = state.tick): Int {
  return fmod(tick + state.scene.dayOffset, state.scene.dayTicks);
}

function curveOf(state: SimState, content: CompiledContent): readonly [Int, Int][] {
  return content.scenes[state.scene.kind].light;
}

/** Luz en milésimas en un tick: la del último punto de la curva con tick de ciclo ≤ fase. */
export function light(state: SimState, content: CompiledContent, tick: Tick = state.tick): Permille {
  const curve = curveOf(state, content);
  const n = curve.length;
  if (n === 0) return 1000;
  const phase = phaseAt(state, tick);
  let value = at(curve, n - 1)[1];
  for (const [t, v] of curve) {
    if (t > phase) break;
    value = v;
  }
  return value;
}

/** Primer tick posterior a `tick` en el que la luz cambia de valor, o null si es constante. */
export function nextLightChange(state: SimState, content: CompiledContent, tick: Tick): Tick | null {
  const curve = curveOf(state, content);
  const n = curve.length;
  if (n <= 1) return null;
  const period = state.scene.dayTicks;
  const phase = phaseAt(state, tick);
  const current = light(state, content, tick);
  let first = 0;
  while (first < n && at(curve, first)[0] <= phase) first++;
  for (let k = 0; k < n; k++) {
    const i = first + k;
    const [t, v] = at(curve, i < n ? i : i - n);
    if (v !== current) return tick + (i < n ? t - phase : t + period - phase);
  }
  return null;
}

/** Si en ese tick hay luz para trabajar. Sin umbral en la tabla, siempre. */
export function workable(state: SimState, content: CompiledContent, tick: Tick): boolean {
  const threshold = content.scenes[state.scene.kind].workLight;
  return threshold === undefined || light(state, content, tick) >= threshold;
}

/**
 * Tick en el que se completan `work` ticks de trabajo empezando en `start`: el menor E tal que
 * en [start, E) hay exactamente `work` ticks con luz de trabajo. null si nunca hay luz.
 */
export function workEnd(state: SimState, content: CompiledContent, start: Tick, work: Int): Tick | null {
  if (work <= 0) return start;
  if (content.scenes[state.scene.kind].workLight === undefined) return start + work;
  const steps = curveOf(state, content).length;
  let t = start;
  let remaining = work;
  let dark = 0;
  for (;;) {
    const next = nextLightChange(state, content, t);
    if (workable(state, content, t)) {
      dark = 0;
      if (next === null || remaining <= next - t) return t + remaining;
      remaining -= next - t;
      t = next;
    } else {
      // Una vuelta entera de la curva sin luz de trabajo: nunca terminaría.
      if (next === null || ++dark > steps) return null;
      t = next;
    }
  }
}

/**
 * Comienzo de la próxima ventana de trabajo estrictamente posterior a `tick` (el amanecer
 * siguiente). Sin umbral de luz, el tick siguiente. null si nunca hay luz.
 */
export function nextWorkStart(state: SimState, content: CompiledContent, tick: Tick): Tick | null {
  if (content.scenes[state.scene.kind].workLight === undefined) return tick + 1;
  const steps = curveOf(state, content).length;
  let t = tick;
  let wasWorkable = workable(state, content, t);
  for (let k = 0; k <= 2 * steps; k++) {
    const next = nextLightChange(state, content, t);
    if (next === null) return null;
    t = next;
    const now = workable(state, content, t);
    if (now && !wasWorkable) return t;
    wasWorkable = now;
  }
  return null;
}

/**
 * Si el tick es el del paso diario de la escena. El tick de creación nunca lo es: el primer
 * día empieza al crear la escena, aunque se cree justo a la hora del paso diario.
 */
export function isDailyTick(state: SimState, content: CompiledContent, tick: Tick = state.tick): boolean {
  const daily = content.scenes[state.scene.kind].dailyAt;
  return daily !== undefined && tick > 0 && phaseAt(state, tick) === daily;
}

/** Próximo tick ≥ `tick` del paso diario, o null si la escena no tiene paso diario. */
export function nextDailyTick(state: SimState, content: CompiledContent, tick: Tick): Tick | null {
  const daily = content.scenes[state.scene.kind].dailyAt;
  if (daily === undefined) return null;
  const next = tick + fmod(daily - phaseAt(state, tick), state.scene.dayTicks);
  return next === 0 ? state.scene.dayTicks : next;
}
