/**
 * Contenido de prueba: un `CompiledContent` mínimo y fijo para la batería del sim.
 * No es el contenido del juego (ese vive en @distritos/content); cambiarlo cambia los dorados.
 */

import { hashOf } from '../src/hash.js';
import type { CompiledContent, SceneTable } from '../src/types/content.js';

const DAY = 864_000; // 24 h a 100 ms

const sceneTable: SceneTable = {
  tickMs: 100,
  dayTicks: DAY,
  // Noche hasta las 6, amanecer hasta las 7:30, día hasta las 16:30, atardecer hasta las 18.
  light: [
    [0, 0],
    [216_000, 0],
    [270_000, 1000],
    [594_000, 1000],
    [648_000, 0],
  ],
  hexSizeMm: 50_000,
  hexW: 86_602,
  hexH: 75_000,
  maxCatchupTicks: 30 * DAY,
};

const tables: Omit<CompiledContent, 'hash'> = {
  scenes: {
    district: sceneTable,
    incursion: {
      ...sceneTable,
      dayTicks: 9_000,
      light: [
        [0, 1000],
        [6_000, 1000],
        [9_000, 0],
      ],
    },
    charge: {
      ...sceneTable,
      dayTicks: 3_000,
      light: [
        [0, 1000],
        [3_000, 0],
      ],
    },
    dispute: sceneTable,
  },
  archetypes: {
    prueba: {
      tier: 1,
      terrains: [
        { kind: 'prado', weight: 5 },
        { kind: 'bosque', weight: 3 },
        { kind: 'agua', weight: 1 },
        { kind: 'cantera', weight: 1 },
      ],
      finds: {
        prado: [
          { kind: 'nada', weight: 3 },
          { kind: 'colina', weight: 1 },
          { kind: 'paso', weight: 1 },
        ],
        bosque: [
          { kind: 'madera', weight: 4 },
          { kind: 'nada', weight: 1 },
        ],
        agua: [
          { kind: 'manantial', weight: 2 },
          { kind: 'salto', weight: 1 },
        ],
        cantera: [{ kind: 'piedra', weight: 1 }],
      },
      start: {
        terrain: 'prado',
        elements: [
          { kind: 'casa', dx: 0, dy: 0 },
          { kind: 'panel', dx: 12_000, dy: -8_000 },
          { kind: 'pozo', dx: -15_000, dy: 6_000 },
          { kind: 'huerta', dx: 4_000, dy: 14_000 },
        ],
        mobiles: [{ kind: 'obrero_peon' }],
        stocks: { energia: 3_600_000, comida: 50, eagles: 0 },
      },
    },
    comun: {
      tier: 0,
      terrains: [
        { kind: 'prado', weight: 2 },
        { kind: 'bosque', weight: 1 },
      ],
      finds: { prado: [{ kind: 'nada', weight: 1 }], bosque: [{ kind: 'madera', weight: 1 }] },
      start: { terrain: 'prado', elements: [{ kind: 'casa', dx: 0, dy: 0 }], mobiles: [], stocks: {} },
    },
  },
  templates: {
    f0_solo: {
      kind: 'district',
      plots: [{ id: 'p1', archetype: 'prueba', anchor: { q: 0, r: 0 }, radius: 3 }],
      common: null,
    },
    f0_dos: {
      kind: 'district',
      plots: [
        { id: 'p1', archetype: 'prueba', anchor: { q: 0, r: 0 }, radius: 2 },
        { id: 'p2', archetype: 'prueba', anchor: { q: 6, r: 0 }, radius: 2 },
      ],
      common: {
        archetype: 'comun',
        sectors: [
          { q: 3, r: 0 },
          { q: 3, r: -1 },
          { q: 2, r: 1 },
        ],
      },
    },
  },
  elements: {
    casa: { category: 'fixed' },
    panel: { category: 'fixed' },
    bateria: { category: 'fixed' },
    pozo: { category: 'fixed' },
    huerta: { category: 'fixed' },
    colina: { category: 'site' },
    paso: { category: 'site' },
    salto: { category: 'site' },
    madera: { category: 'resource' },
    piedra: { category: 'resource' },
    manantial: { category: 'resource' },
  },
  mobiles: {
    obrero_peon: {
      stats: { force: 1, vision: 2, alert: 1, speed: 20_000 },
      names: ['Antía', 'Breixo', 'Xiana', 'Roi', 'Sabela', 'Brais'],
    },
    obrero_tecnico: {
      stats: { force: 1, vision: 3, alert: 2, speed: 15_000 },
      names: ['Iria', 'Xoán', 'Uxía', 'Paio'],
    },
  },
  terrains: {
    prado: { category: 'ground' },
    bosque: { category: 'wood' },
    agua: { category: 'water' },
    cantera: { category: 'stone' },
  },
  actions: {
    reveal: { resource: 'energia', cost: 360_000, ticks: 50 },
  },
};

export function testContent(): CompiledContent {
  return { hash: hashOf(tables), ...structuredClone(tables) };
}
