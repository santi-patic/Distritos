/**
 * Contenido compilado: la forma en que el sim consume las tablas. Esquema del paquete sim, §14.
 *
 * Las tablas JSON viven en @distritos/content y llegan aquí ya validadas y convertidas
 * (duraciones en ticks, velocidades en mm/s). El sim recibe este objeto como argumento en
 * todas sus funciones y nunca lo importa ni lo cachea: cambiar de tablas es cambiar de
 * argumento, y el hash de las tablas entra en el estado.
 */

import type { Hex } from '../hex.js';
import type { Int, Joule, KindId, Mm, PlotId, ResourceId } from './ids.js';
import type { SceneKind, Stats } from './state.js';

export interface SceneTable {
  tickMs: Int;
  dayTicks: Int;
  /** Curva de luz por tramos: pares [tick del ciclo, milésimas], ordenados por tick. */
  light: [Int, Int][];
  /** Radio centro–vértice del hexágono, mm. */
  hexSizeMm: Mm;
  /** Retícula entera: hexW = 2·round(hexSizeMm·√3/2) (par), hexH = round(hexSizeMm·3/2). */
  hexW: Mm;
  hexH: Mm;
  maxCatchupTicks: Int;
}

export interface Weighted {
  kind: KindId;
  weight: Int;
}

export interface StartElement {
  kind: KindId;
  /** Desplazamiento respecto al centro del sector central, mm. */
  dx: Mm;
  dy: Mm;
}

export interface StartKit {
  /** Terreno del sector central, abierto desde el principio. */
  terrain: KindId;
  elements: StartElement[];
  mobiles: { kind: KindId }[];
  stocks: Record<ResourceId, Int>;
}

export interface Archetype {
  /** Experiencia mínima para ocupar un terreno de este arquetipo. */
  tier: Int;
  /** Qué terreno sale en cada sector oculto. */
  terrains: Weighted[];
  /** Qué se encuentra al abrir, por terreno. 'nada' es un hallazgo válido. */
  finds: Record<KindId, Weighted[]>;
  start: StartKit;
}

export interface TemplatePlot {
  id: PlotId;
  archetype: KindId;
  anchor: Hex;
  /** Los sectores del terreno son range(anchor, radius); más adelante, listas explícitas. */
  radius: Int;
}

export interface Template {
  kind: SceneKind;
  plots: TemplatePlot[];
  /** Tierra común del distrito: sus sectores y el arquetipo que decide qué hay en ellos. */
  common: { archetype: KindId; sectors: Hex[] } | null;
}

export interface ElementKind {
  /** Círculo (fijo), rombo (recurso) o círculo de sitio; el cliente dibuja por categoría. */
  category: 'fixed' | 'resource' | 'site';
}

export interface MobileKind {
  stats: Stats;
  /** Tabla de nombres; se elige con el generador de la escena. */
  names: string[];
}

export interface TerrainKind {
  /** Solo existencia por ahora; el cliente le da color. */
  category: 'ground' | 'water' | 'wood' | 'stone';
}

export interface Actions {
  /** Abrir un sector: qué recurso cuesta, cuánto, y cuántos ticks trabaja el obrero al llegar. */
  reveal: { resource: ResourceId; cost: Joule; ticks: Int };
}

export interface CompiledContent {
  /** sha-256 del JSON canónico de todas las tablas. */
  hash: string;
  scenes: Record<SceneKind, SceneTable>;
  archetypes: Record<KindId, Archetype>;
  templates: Record<KindId, Template>;
  elements: Record<KindId, ElementKind>;
  mobiles: Record<KindId, MobileKind>;
  terrains: Record<KindId, TerrainKind>;
  actions: Actions;
}

/** Hallazgo que no deja nada en el sector. */
export const NOTHING: KindId = 'nada';
