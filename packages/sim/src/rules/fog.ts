/**
 * Niebla: abrir sectores y materializar lo que había. Esquema del paquete sim, §7 y §11.
 */

import { removeKey } from '../iter.js';
import { key, neighbors, parse, type HexKey } from '../hex.js';
import type { CompiledContent } from '../types/content.js';
import type { Event } from '../types/events.js';
import type { ActorId, ElementId } from '../types/ids.js';
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
