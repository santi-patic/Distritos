/**
 * Forma de las tablas tal como están escritas (antes de compilar).
 *
 * Unidades de autor: duraciones en segundos, velocidades en mm/s, longitudes en mm, energía
 * en J, agua en L, comida en raciones. Las tasas se escriben con su periodo (`per`: 's', 'h' o
 * 'dia'): 400 J por segundo son 400 W, 400 L por hora, 2 raciones por día. El compilador lo
 * pasa todo a ticks y a unidades por día de 24 h.
 */

import type { SceneKind, Weighted } from '@distritos/sim';

export type RatePeriod = 's' | 'h' | 'dia';

export interface RawRate {
  resource: string;
  amount: number;
  per: RatePeriod;
}

export interface RawScene {
  tickMs: number;
  daySeconds: number;
  /** Curva de luz escalonada: [segundo del día, milésimas]; cada punto rige hasta el siguiente. */
  light: [number, number][];
  hexSizeMm: number;
  maxCatchupDays: number;
  /** Luz mínima para que avance una tarea (F1). */
  workLight?: number;
  /** Segundo del día del paso diario: comidas, suciedad, ciclos, pizarra (F1). */
  dailyAt?: number;
}

export type RawScenes = Record<SceneKind, RawScene>;

export interface RawStartElement {
  kind: string;
  dx: number;
  dy: number;
  store?: Record<string, number>;
  on?: boolean;
}

export interface RawArchetype {
  tier: number;
  terrains: Weighted[];
  finds: Record<string, Weighted[]>;
  start: {
    terrain: string;
    elements: RawStartElement[];
    mobiles: { kind: string }[];
    stocks: Record<string, number>;
    links?: { kind: string; a: number; b: number }[];
  };
}

export interface RawTemplate {
  kind: SceneKind;
  plots: { id: string; archetype: string; anchor: { q: number; r: number }; radius: number }[];
  common: {
    archetype: string;
    sectors: { q: number; r: number }[];
    elements?: { kind: string; hex: { q: number; r: number }; dx: number; dy: number }[];
  } | null;
}

export interface RawElement {
  category: 'fixed' | 'resource' | 'site';
  stores?: Record<string, number>;
  inventory?: boolean;
  produce?: RawRate & {
    to: 'self' | 'link';
    light?: boolean;
    wear?: boolean;
    /** Milésimas de la producción nominal que da de media a plena luz (cielo, orientación). */
    yieldPermille?: number;
  };
  consume?: RawRate;
  switchable?: boolean;
  beds?: number;
  soil?: { perDay: number; max: number };
  cycles?: { lossPermille: number };
}

export interface RawMobile {
  stats: { force: number; vision: number; alert: number; speedMmPerS: number };
  names: string[];
  eats?: { resource: string; perDay: number };
  hungryPermille?: number;
  carry?: number;
}

export interface RawTerrain {
  category: 'ground' | 'water' | 'wood' | 'stone';
}

export interface RawActions {
  /**
   * Abrir un sector: o trabajando `seconds` (y `firstSeconds` la primera vez), o con la curva de
   * `curveSeconds` (P14): una duración por apertura, en el orden en que el jugador las empieza.
   */
  reveal: {
    resource: string;
    costJ: number;
    seconds?: number;
    firstSeconds?: number;
    curveSeconds?: number[];
  };
  /** Nombres que pone el jugador (P16). */
  name?: { maxLength: number };
}

export interface RawResource {
  physical: boolean;
  order: number;
}

export interface RawWork {
  seconds: number;
  firstSeconds?: number;
  cost?: Record<string, number>;
}

export interface RawTask extends RawWork {
  at: string[];
  gives?: Record<string, number>;
  into?: 'self' | 'inventory';
  collect?: string;
  clean?: boolean;
  tool?: RawWork & { kind: string };
  /** Tarea de jornada (P9): `gives` es lo que rinde cada `seconds` de trabajo. */
  jornada?: boolean;
}

export interface RawBuild extends RawWork {
  cost: Record<string, number>;
  gapMm: number;
  near?: { kinds: string[]; hexes: number };
}

export interface RawLink {
  carries?: string;
  speedPermille?: number;
  unitMm: number;
  secondsPerUnit: number;
  firstSeconds?: number;
  cost?: Record<string, number>;
  costPerUnit?: Record<string, number>;
  maxMm?: number;
}

export interface RawHire {
  cost: Record<string, number>;
}

export interface RawEncargo {
  id: string;
  at: string;
  resource: string;
  /** Si es trabajo, `amount` y `perTrip` van en segundos de trabajo. */
  work?: boolean;
  amount: number;
  perTrip: number;
  reward: number;
}

export interface RawBoard {
  currency: string;
  encargos: RawEncargo[];
}

export interface RawPlace {
  capacity: number;
  start?: number;
  makes?: Weighted[];
  /** Segundos entre dos recados generados. */
  every?: number;
}

export interface RawErrandKind {
  to: string[];
  size: number;
  pay: number;
  expiresSeconds?: number;
  /** Tipo (P15): pictograma y color en la interfaz, y la clase (llevar o hacer). */
  type?: string;
  /** Recado de hacer: segundos de trabajo en el destino. */
  workSeconds?: number;
  /** Lo que se saca de las existencias de quien lo recoge. */
  takes?: Record<string, number>;
}

export interface RawErrands {
  currency: string;
  stopSeconds: number;
  firstStopSeconds?: number;
  maxStops: number;
  types?: Record<string, { class: 'llevar' | 'hacer' }>;
  kinds: Record<string, RawErrandKind>;
}

export interface RawTables {
  scenes: RawScenes;
  archetypes: Record<string, RawArchetype>;
  templates: Record<string, RawTemplate>;
  elements: Record<string, RawElement>;
  mobiles: Record<string, RawMobile>;
  terrains: Record<string, RawTerrain>;
  actions: RawActions;
  resources: Record<string, RawResource>;
  tasks: Record<string, RawTask>;
  builds: Record<string, RawBuild>;
  links: Record<string, RawLink>;
  hires: Record<string, RawHire>;
  board: RawBoard;
  places: Record<string, RawPlace>;
  recados: RawErrands;
}

export const TABLE_NAMES = [
  'scenes',
  'archetypes',
  'templates',
  'elements',
  'mobiles',
  'terrains',
  'actions',
  'resources',
  'tasks',
  'builds',
  'links',
  'hires',
  'board',
  'places',
  'recados',
] as const;
export type TableName = (typeof TABLE_NAMES)[number];
