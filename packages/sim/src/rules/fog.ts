/**
 * Niebla: abrir sectores y materializar lo que había. Esquema del paquete sim, §7 y §11.
 *
 * Con la curva de apertura (F1, P14), un obrero va a empezar la apertura y queda libre; el
 * sector sigue oculto, con su apertura en marcha, hasta que pasa su tiempo, de día y de noche.
 */

import { min } from '../arith.js';
import { at, removeKey, sortedKeys } from '../iter.js';
import { key, neighbors, parse, type HexKey } from '../hex.js';
import type { CompiledContent } from '../types/content.js';
import type { Event } from '../types/events.js';
import type { ActorId, ElementId, Int, Tick } from '../types/ids.js';
import type { SimState } from '../types/state.js';
import { addElement } from './elements.js';

/** Un sector oculto se puede abrir si existe y tiene al menos un vecino abierto. */
export function hasRevealedNeighbor(state: SimState, k: HexKey): boolean {
  for (const n of neighbors(parse(k))) {
    if (state.map.sectors[key(n)]?.status === 'revealed') return true;
  }
  return false;
}

/**
 * Abre un sector: pasa a público lo que la escena generó al crearse, con el nombre de quien
 * lo abre, y crea los elementos encontrados. Devuelve los ids creados.
 */
export function revealSector(
  state: SimState,
  content: CompiledContent,
  k: HexKey,
  by: ActorId,
  events: Event[],
): ElementId[] {
  const sector = state.map.sectors[k];
  if (sector === undefined) throw new Error(`niebla: el sector ${k} no existe`);
  if (sector.status === 'revealed') return [];
  const hidden = state.hidden.sectorContents[k];
  if (hidden === undefined) throw new Error(`niebla: el sector ${k} no tiene contenido oculto`);

  sector.status = 'revealed';
  sector.revealedBy = by;
  sector.revealedTick = state.tick;
  sector.terrain = hidden.terrain;
  delete sector.opening;

  const owner = sector.plot === null ? null : (state.plots[sector.plot]?.owner ?? null);
  const found: ElementId[] = [];
  for (const f of hidden.finds) {
    const e = addElement(
      state,
      content,
      owner === null
        ? { kind: f.kind, pos: f.pos, sector: k }
        : { kind: f.kind, pos: f.pos, sector: k, owner },
    );
    found.push(e.id);
  }
  removeKey(state.hidden.sectorContents, k);
  events.push({ tick: state.tick, kind: 'sector_revealed', hex: k, by, found });
  return found;
}

/** Aperturas que ha empezado el actor (cuenta las de la curva). */
const OPENINGS = 'reveal';

/** Duración de la próxima apertura que empezara el actor: su lugar en la curva. */
export function openingTicks(state: SimState, actor: ActorId, curve: readonly Int[]): Int {
  if (curve.length === 0) throw new Error('niebla: curva de apertura vacía');
  const n = state.actors[actor]?.started?.[OPENINGS] ?? 0;
  return at(curve, min(n, curve.length - 1));
}

/** Apunta que el actor ha empezado una apertura más (avanza su lugar en la curva). */
export function countOpening(state: SimState, actor: ActorId): void {
  const a = state.actors[actor];
  if (a === undefined) return;
  const started = a.started ?? {};
  started[OPENINGS] = (started[OPENINGS] ?? 0) + 1;
  a.started = started;
}

/** Un obrero de alguien va ya a empezar la apertura de este sector. */
export function openingPending(state: SimState, k: HexKey): boolean {
  for (const id of sortedKeys(state.mobiles)) {
    const job = state.mobiles[id]?.job;
    if (job?.kind === 'reveal' && job.hex === k) return true;
  }
  return false;
}

/**
 * El obrero ha llegado y empieza la apertura. Si mientras iba el sector se abrió o alguien
 * empezó a abrirlo, no pasa nada.
 */
export function startOpening(state: SimState, k: HexKey, by: ActorId, endTick: Tick, events: Event[]): void {
  const sector = state.map.sectors[k];
  if (sector?.status !== 'hidden' || sector.opening !== undefined) return;
  sector.opening = { by, startTick: state.tick, endTick };
  events.push({ tick: state.tick, kind: 'opening', hex: k, by, endTick });
}

/** Sectores cuya apertura acaba en este tick, por clave ordenada. */
export function processOpenings(state: SimState, content: CompiledContent, events: Event[]): void {
  for (const k of sortedKeys(state.map.sectors)) {
    const opening = state.map.sectors[k]?.opening;
    if (opening === undefined || opening.endTick > state.tick) continue;
    revealSector(state, content, k, opening.by, events);
  }
}

/** Próximo tick ≥ el actual en que acaba una apertura, o null. */
export function nextOpeningEnd(state: SimState): Tick | null {
  let next: Tick | null = null;
  for (const k of sortedKeys(state.map.sectors)) {
    const end = state.map.sectors[k]?.opening?.endTick;
    if (end === undefined) continue;
    const t = end < state.tick ? state.tick : end;
    if (next === null || t < next) next = t;
  }
  return next;
}
