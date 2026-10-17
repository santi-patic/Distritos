/**
 * El paso diario, en el tick del ciclo que fija la tabla de escena (`dailyAt`).
 * Diseño de la casa §4, §6 y §8; registro C4.
 *
 * En este orden: la suciedad de los paneles sube (desgaste por calendario, reversible y con
 * tope); las baterías cuentan los ciclos completos de descarga y pierden capacidad (desgaste
 * por uso: ausente, nadie consume y no ciclan); los obreros comen; la pizarra publica el
 * encargo del día. Todo por id ordenado.
 */

import { min } from '../arith.js';
import { sortedKeys } from '../iter.js';
import type { CompiledContent } from '../types/content.js';
import type { Event } from '../types/events.js';
import type { SimState } from '../types/state.js';
import { rotateBoard } from './board.js';
import { capacityOf, levelOf, setLevel } from './elements.js';
import { meals } from './workers.js';

function soil(state: SimState, content: CompiledContent): void {
  for (const id of sortedKeys(state.elements)) {
    const e = state.elements[id];
    const s = e === undefined ? undefined : content.elements[e.kind]?.soil;
    if (e === undefined || s === undefined) continue;
    e.wear = min(s.max, (e.wear ?? 0) + s.perDay);
  }
}

function cycles(state: SimState, content: CompiledContent, events: Event[]): void {
  for (const id of sortedKeys(state.elements)) {
    const e = state.elements[id];
    const k = e === undefined ? undefined : content.elements[e.kind];
    if (e === undefined || k?.cycles === undefined || k.stores === undefined) continue;
    const resources = sortedKeys(k.stores);
    const main = resources[0];
    if (main === undefined) continue;
    let cap = capacityOf(content, e, main);
    while (cap > 0 && (e.drawn ?? 0) >= cap && (e.wear ?? 0) < 1000) {
      e.drawn = (e.drawn ?? 0) - cap;
      e.wear = min(1000, (e.wear ?? 0) + k.cycles.lossPermille);
      events.push({ tick: state.tick, kind: 'cycled', element: e.id, wear: e.wear });
      cap = capacityOf(content, e, main);
    }
    for (const r of resources) {
      const c = capacityOf(content, e, r);
      if (levelOf(e, r) > c) setLevel(e, r, c);
    }
  }
}

export function dailyStep(state: SimState, content: CompiledContent, events: Event[]): void {
  soil(state, content);
  cycles(state, content, events);
  meals(state, content, events);
  rotateBoard(state, content, events);
}
