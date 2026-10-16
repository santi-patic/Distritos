/**
 * Calendario: el ciclo día-noche en ticks. Esquema del paquete sim, §5.3.
 *
 * La luz es una curva por tramos en la tabla de escena: pares [tick del ciclo, milésimas],
 * ordenados y dentro de [0, dayTicks). Entre dos puntos se interpola con enteros; el tramo
 * del último punto al primero envuelve el final del ciclo.
 */

import { fmod, lerp } from './arith.js';
import { at } from './iter.js';
import type { CompiledContent } from './types/content.js';
import type { Int, Permille, Tick } from './types/ids.js';
import type { SimState } from './types/state.js';

/** Fase del ciclo (0..dayTicks−1) en un tick. */
export function phaseAt(state: SimState, tick: Tick = state.tick): Int {
  return fmod(tick + state.scene.dayOffset, state.scene.dayTicks);
}

/** Luz en milésimas en un tick, según la curva de la tabla de escena. */
export function light(state: SimState, content: CompiledContent, tick: Tick = state.tick): Permille {
  const curve = content.scenes[state.scene.kind].light;
  const n = curve.length;
  if (n === 0) return 1000;
  const first = at(curve, 0);
  const last = at(curve, n - 1);
  if (n === 1) return first[1];
  const period = state.scene.dayTicks;
  const phase = phaseAt(state, tick);
  if (phase < first[0] || phase >= last[0]) {
    // Tramo envolvente: del último punto al primero del ciclo siguiente.
    const p = phase < first[0] ? phase + period : phase;
    const span = first[0] + period - last[0];
    return span === 0 ? last[1] : lerp(last[1], first[1], p - last[0], span);
  }
  for (let i = 0; i + 1 < n; i++) {
    const a = at(curve, i);
    const b = at(curve, i + 1);
    if (phase >= a[0] && phase < b[0]) {
      return b[0] === a[0] ? a[1] : lerp(a[1], b[1], phase - a[0], b[0] - a[0]);
    }
  }
  return last[1];
}
