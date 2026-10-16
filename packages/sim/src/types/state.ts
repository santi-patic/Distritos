/**
 * Tipos de estado. Esquema del paquete sim, §7.
 *
 * El estado es JSON plano de enteros seguros, cadenas, booleanos y null: se serializa con
 * `serialize`, se hashea con `hashState` y se reconstruye desde el registro de órdenes.
 * Los campos marcados F1–F5 son huecos reservados: existen en el tipo, no en las reglas.
 */

import type { Vec } from '../geom.js';
import type { HexKey } from '../hex.js';
import type { RngState } from '../rng.js';
import type {
  ActorId,
  ElementId,
  Int,
  KindId,
  LinkId,
  Mm,
  MmPerS,
  MobileId,
  Permille,
  PlotId,
  ResourceId,
  Tick,
} from './ids.js';

/** La casa es un terreno dentro de 'district'; incursión, carga y disputa son escenas aparte. */
export type SceneKind = 'district' | 'incursion' | 'charge' | 'dispute';

export interface SceneHeader {
  kind: SceneKind;
  /** Plantilla de la que nace la escena. */
  template: KindId;
  /** Semilla de la escena, 64 bits en hexadecimal. */
  seed: string;
  tickMs: Int;
  /** Longitud del ciclo día-noche en ticks. */
  dayTicks: Int;
  /** Fase del ciclo en el tick 0. */
  dayOffset: Int;
  /** Retícula entera de centros (hex.ts); precomputada, sin raíces en ejecución. */
  hexW: Mm;
  hexH: Mm;
  /** sha-256 de las tablas compiladas con las que corre la escena. */
  contentHash: string;
  /** Versión de las reglas (semver del paquete sim). */
  rules: string;
}

export type Audience = 'owner' | 'district' | 'all' | { actors: ActorId[] };

export interface Access {
  see: Audience;
  enter: Audience;
}

export interface Sector {
  q: Int;
  r: Int;
  /** null: tierra común del distrito. */
  plot: PlotId | null;
  /** 'rumor' reservado para la radio (F5). */
  status: 'hidden' | 'revealed';
  /** «El nombre de quien abre cada sector.» */
  revealedBy?: ActorId;
  revealedTick?: Tick;
  /** Lo que se vio al abrir. */
  terrain?: KindId;
  access: Access;
}

export interface MapState {
  sectors: Record<HexKey, Sector>;
}

export type PlotStatus = 'vacant' | 'occupied' | 'called' | 'custody';

export interface Plot {
  id: PlotId;
  archetype: KindId;
  /** Experiencia mínima para ocuparlo. */
  tier: Int;
  /** Sector central; los sectores del terreno llevan Sector.plot. */
  anchor: HexKey;
  owner: ActorId | null;
  status: PlotStatus;
  /** Tick del último cambio de estado. */
  since: Tick;
  /** Llamada a la actividad en curso (F5). */
  calledTick?: Tick;
}

export interface Element {
  id: ElementId;
  kind: KindId;
  pos: Vec;
  sector: HexKey;
  /** El tamaño es el nivel. */
  level: Int;
  owner?: ActorId;
  /** Obras con nombre (F1 en el terreno, F5 en la tierra común). */
  builtBy?: ActorId[];
  /** Degradación (F1). */
  wear?: Permille;
  /** Restos de acumuladores de tasa, por tasa (F1). */
  carry?: Record<string, Int>;
}

export interface Stats {
  force: Int;
  vision: Int;
  alert: Int;
  speed: MmPerS;
}

/** Un viaje es un compromiso: origen, destino y llegada se fijan al salir. La posición se deriva. */
export interface Trip {
  from: Vec;
  to: Vec;
  /** null cuando el destino es un punto (el centro de un sector). */
  toElement: ElementId | null;
  departTick: Tick;
  arriveTick: Tick;
  /** Orden que lo lanzó; desempata llegadas simultáneas. */
  seq: Int;
}

export type Where = { kind: 'at'; pos: Vec; element: ElementId | null } | { kind: 'trip'; trip: Trip };

export interface RevealJob {
  kind: 'reveal';
  hex: HexKey;
  startTick: Tick;
  endTick: Tick;
}

/** F1: BuildJob | RepairJob | HaulJob. */
export type Job = RevealJob;

export interface Mobile {
  id: MobileId;
  kind: KindId;
  owner: ActorId;
  /** Dato del jugador o de una tabla de nombres; no es texto traducible. */
  name?: string;
  stats: Stats;
  where: Where;
  job: Job | null;
}

export interface Link {
  id: LinkId;
  kind: KindId;
  from: ElementId;
  to: ElementId;
  wear?: Permille;
}

/** Lo que viaja entre distritos (F1+); vacío en F0. Copia de la entidad del servidor. */
export interface Character {
  /** Oficios y nivel. */
  skills: Record<KindId, Int>;
  /** Planos y habilidades. */
  blueprints: KindId[];
  /** Calculada en tabla a partir del libro de hechos del servidor. */
  experience: Int;
}

export interface ActorState {
  plot: PlotId | null;
  stocks: Record<ResourceId, Int>;
  /** Parte de los flujos propios que va al común, en milésimas (F5; inerte antes). */
  share: Permille;
  /** Actividad: cualquier orden aceptada del actor. */
  lastOrderTick: Tick;
  character: Character;
}

/** Lo común; se detalla con el diseño del distrito (F5). */
export interface DistrictState {
  pot: Record<ResourceId, Int>;
}

export interface SectorContent {
  terrain: KindId;
  finds: { kind: KindId; pos: Vec }[];
}

/** Lo que ningún actor ve. Generado al crear la escena; pasa a público al abrir. */
export interface HiddenState {
  sectorContents: Record<HexKey, SectorContent>;
}

export interface SimState {
  v: 1;
  scene: SceneHeader;
  /** Próximo tick a ejecutar. */
  tick: Tick;
  rng: RngState;
  counters: { element: Int; mobile: Int; link: Int };
  map: MapState;
  plots: Record<PlotId, Plot>;
  elements: Record<ElementId, Element>;
  mobiles: Record<MobileId, Mobile>;
  links: Record<LinkId, Link>;
  actors: Record<ActorId, ActorState>;
  district: DistrictState;
  hidden: HiddenState;
}

export const STATE_VERSION = 1 as const;
