/**
 * Forma de las tablas tal como están escritas (antes de compilar).
 * Duraciones en segundos, velocidades en mm/s, energías en julios, longitudes en mm.
 */

import type { SceneKind, Weighted } from '@distritos/sim';

export interface RawScene {
  tickMs: number;
  daySeconds: number;
  light: [number, number][];
  hexSizeMm: number;
  maxCatchupDays: number;
}

export type RawScenes = Record<SceneKind, RawScene>;

export interface RawArchetype {
  tier: number;
  terrains: Weighted[];
  finds: Record<string, Weighted[]>;
  start: {
    terrain: string;
    elements: { kind: string; dx: number; dy: number }[];
    mobiles: { kind: string }[];
    stocks: Record<string, number>;
  };
}

export interface RawTemplate {
  kind: SceneKind;
  plots: { id: string; archetype: string; anchor: { q: number; r: number }; radius: number }[];
  common: { archetype: string; sectors: { q: number; r: number }[] } | null;
}

export interface RawElement {
  category: 'fixed' | 'resource' | 'site';
}

export interface RawMobile {
  stats: { force: number; vision: number; alert: number; speedMmPerS: number };
  names: string[];
}

export interface RawTerrain {
  category: 'ground' | 'water' | 'wood' | 'stone';
}

export interface RawActions {
  reveal: { resource: string; costJ: number; seconds: number };
}

export interface RawTables {
  scenes: RawScenes;
  archetypes: Record<string, RawArchetype>;
  templates: Record<string, RawTemplate>;
  elements: Record<string, RawElement>;
  mobiles: Record<string, RawMobile>;
  terrains: Record<string, RawTerrain>;
  actions: RawActions;
}

export const TABLE_NAMES = [
  'scenes',
  'archetypes',
  'templates',
  'elements',
  'mobiles',
  'terrains',
  'actions',
] as const;
export type TableName = (typeof TABLE_NAMES)[number];
