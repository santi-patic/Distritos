/**
 * Vista por actor: lo que un cliente recibe y sobre lo que predice. Esquema del paquete sim, §11.
 *
 * Función pura del estado y del actor. Contiene los sectores que el actor puede ver (los de
 * su terreno, la tierra común, los ajenos concedidos) con sus elementos y móviles; los demás
 * sectores aparecen como desconocidos; los terrenos ajenos, resumidos; los actores ajenos,
 * sin stocks. Nunca contiene `hidden`, `rng` ni los contadores.
 */

import { canSee } from './access.js';
import { entries } from './iter.js';
import { key, nearest } from './hex.js';
import type { HexKey } from './hex.js';
import type { ActorId, Int, PlotId, Tick } from './types/ids.js';
import type {
  ActorState,
  DistrictState,
  Element,
  Mobile,
  Plot,
  SceneHeader,
  Sector,
  SimState,
} from './types/state.js';
import { positionOf } from './rules/movement.js';

export interface UnknownSector {
  q: Int;
  r: Int;
  plot: PlotId | null;
  status: 'unknown';
}

export interface ActorSummary {
  plot: PlotId | null;
  share: Int;
}

export interface PublicState {
  v: 1;
  scene: SceneHeader;
  tick: Tick;
  viewer: ActorId;
  plots: Record<PlotId, Plot>;
  map: { sectors: Record<HexKey, Sector | UnknownSector> };
  elements: Record<string, Element>;
  mobiles: Record<string, Mobile>;
  actors: Record<ActorId, ActorState | ActorSummary>;
  district: DistrictState;
}

export function view(state: SimState, viewer: ActorId): PublicState {
  const lat = { hexW: state.scene.hexW, hexH: state.scene.hexH };
  const visible: Record<HexKey, true> = {};
  const sectors: Record<HexKey, Sector | UnknownSector> = {};
  for (const [k, s] of entries(state.map.sectors)) {
    if (canSee(state, viewer, s)) {
      visible[k] = true;
      sectors[k] = s;
    } else {
      sectors[k] = { q: s.q, r: s.r, plot: s.plot, status: 'unknown' };
    }
  }
  const elements: Record<string, Element> = {};
  for (const [id, e] of entries(state.elements)) {
    if (visible[e.sector] === true) elements[id] = e;
  }
  const mobiles: Record<string, Mobile> = {};
  for (const [id, m] of entries(state.mobiles)) {
    if (m.owner === viewer || visible[key(nearest(positionOf(m, state.tick), lat))] === true) mobiles[id] = m;
  }
  const actors: Record<ActorId, ActorState | ActorSummary> = {};
  for (const [id, a] of entries(state.actors)) {
    actors[id] = id === viewer ? a : { plot: a.plot, share: a.share };
  }
  return {
    v: 1,
    scene: state.scene,
    tick: state.tick,
    viewer,
    plots: state.plots,
    map: { sectors },
    elements,
    mobiles,
    actors,
    district: state.district,
  };
}
