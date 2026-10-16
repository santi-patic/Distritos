/**
 * Quién ve y quién entra. Esquema del paquete sim, §7 y §11.
 *
 * Cada sector lleva dos audiencias: `see` y `enter`. El dueño del terreno siempre puede; el
 * sistema siempre puede; 'district' son los actores de la escena; 'all', cualquiera;
 * una lista, esos actores. La tierra común es del distrito por defecto.
 */

import type { ActorId } from './types/ids.js';
import { SYSTEM_ACTOR } from './types/ids.js';
import type { Access, Audience, Sector, SimState } from './types/state.js';

export const PLOT_ACCESS: Readonly<Access> = { see: 'owner', enter: 'owner' };
export const COMMON_ACCESS: Readonly<Access> = { see: 'district', enter: 'district' };

export function ownerOf(state: SimState, sector: Sector): ActorId | null {
  if (sector.plot === null) return null;
  return state.plots[sector.plot]?.owner ?? null;
}

export function allows(state: SimState, audience: Audience, actor: ActorId, sector: Sector): boolean {
  if (actor === SYSTEM_ACTOR) return true;
  if (ownerOf(state, sector) === actor) return true;
  if (audience === 'owner') return false;
  if (audience === 'all') return true;
  if (audience === 'district') return state.actors[actor] !== undefined;
  return audience.actors.includes(actor);
}

export function canSee(state: SimState, actor: ActorId, sector: Sector): boolean {
  return allows(state, sector.access.see, actor, sector);
}

export function canEnter(state: SimState, actor: ActorId, sector: Sector): boolean {
  return allows(state, sector.access.enter, actor, sector);
}

export function copyAccess(a: Readonly<Access>): Access {
  const copy = (x: Audience): Audience => (typeof x === 'string' ? x : { actors: [...x.actors] });
  return { see: copy(a.see), enter: copy(a.enter) };
}
