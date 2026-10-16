/**
 * Identificadores y unidades del estado. Esquema del paquete sim, §7.
 *
 * Convención: código en inglés; los valores de `KindId` y `ResourceId` son ids de contenido
 * del glosario, en castellano sin acentos ('casa', 'panel', 'obrero_peon', 'energia'…).
 */

import type { Int } from '../arith.js';

export type { Int };

/** Ticks desde la creación de la escena. */
export type Tick = Int;
/** Longitud en milímetros. */
export type Mm = Int;
/** Velocidad en milímetros por segundo (en tablas; por tick se deriva). */
export type MmPerS = Int;
/** Energía en julios. */
export type Joule = Int;
/** Fracción en milésimas, 0..1000. */
export type Permille = Int;

/** 'sys', o el id de jugador que asigna el servidor. */
export type ActorId = string;
/** 'p' + índice en la plantilla. */
export type PlotId = string;
/** 'e' + contador de la escena. */
export type ElementId = string;
/** 'm' + contador de la escena. */
export type MobileId = string;
/** 'l' + contador de la escena (F1). */
export type LinkId = string;
/** Id de contenido: 'casa', 'panel', 'obrero_peon', 'bosque', 'pantano'… */
export type KindId = string;
/** 'energia', 'comida', 'eagles'… */
export type ResourceId = string;

export const SYSTEM_ACTOR: ActorId = 'sys';
