/**
 * Compilador de tablas: valida contra los esquemas JSON, comprueba referencias cruzadas,
 * convierte unidades (segundos → ticks, hexágono → retícula entera) y calcula el hash.
 *
 * El resultado es el `CompiledContent` que consume el sim. El hash es el sha-256 del JSON
 * canónico del contenido compilado: cambia si cambia una tabla o una conversión.
 */

import { Ajv, type ErrorObject } from 'ajv';
import {
  hashOf,
  NOTHING,
  type Archetype,
  type CompiledContent,
  type SceneKind,
  type SceneTable,
  type Template,
} from '@distritos/sim';
import type { RawScene, RawTables, TableName } from './raw.js';
import { TABLE_NAMES } from './raw.js';
import { schemas } from './schemas.js';

const SCENE_KINDS: readonly SceneKind[] = ['district', 'incursion', 'charge', 'dispute'];

export class ContentError extends Error {
  constructor(
    message: string,
    public readonly details: readonly string[] = [],
  ) {
    super(details.length > 0 ? `${message}\n  ${details.join('\n  ')}` : message);
    this.name = 'ContentError';
  }
}

function formatErrors(table: string, errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((e) => `${table}${e.instancePath}: ${e.message ?? 'inválido'}`);
}

let ajv: Ajv | null = null;

function validator(): Ajv {
  if (ajv === null) {
    ajv = new Ajv({ allErrors: true, strict: true });
    ajv.addSchema(schemas.common);
    for (const name of TABLE_NAMES) ajv.addSchema(schemas[name]);
  }
  return ajv;
}

/** Valida cada tabla contra su esquema. Devuelve la lista de errores (vacía si todo vale). */
export function validateTables(tables: RawTables): string[] {
  const v = validator();
  const errors: string[] = [];
  for (const name of TABLE_NAMES) {
    const validate = v.getSchema(schemas[name].$id);
    if (validate === undefined) throw new ContentError(`esquema no registrado: ${name}`);
    if (!validate(tables[name])) errors.push(...formatErrors(name, validate.errors));
  }
  return errors;
}

/** Quita la clave `$schema` que las tablas llevan para el editor. */
function entriesOf<T>(table: Record<string, T>): [string, T][] {
  return Object.entries(table).filter(([k]) => k !== '$schema');
}

function exactDiv(num: number, den: number, what: string): number {
  if (num % den !== 0) throw new ContentError(`${what}: ${num} no es múltiplo de ${den}`);
  return num / den;
}

function secondsToTicks(seconds: number, tickMs: number, what: string): number {
  return exactDiv(seconds * 1000, tickMs, what);
}

function compileScene(kind: SceneKind, raw: RawScene): SceneTable {
  const { tickMs } = raw;
  const dayTicks = secondsToTicks(raw.daySeconds, tickMs, `scenes.${kind}.daySeconds`);
  const light = raw.light.map(([s, l], i): [number, number] => {
    const t = secondsToTicks(s, tickMs, `scenes.${kind}.light[${i}]`);
    if (t > dayTicks) throw new ContentError(`scenes.${kind}.light[${i}]: ${s} s se sale del ciclo`);
    return [t, l];
  });
  for (let i = 1; i < light.length; i++) {
    const prev = light[i - 1];
    const cur = light[i];
    if (prev !== undefined && cur !== undefined && cur[0] <= prev[0]) {
      throw new ContentError(`scenes.${kind}.light: los puntos deben ir en orden creciente`);
    }
  }
  // Retícula entera: la única raíz cuadrada del proyecto vive aquí, fuera del sim, y su
  // resultado queda fijado por el hash del contenido.
  const hexW = 2 * Math.round((raw.hexSizeMm * Math.sqrt(3)) / 2);
  const hexH = Math.round((raw.hexSizeMm * 3) / 2);
  return {
    tickMs,
    dayTicks,
    light,
    hexSizeMm: raw.hexSizeMm,
    hexW,
    hexH,
    maxCatchupTicks: raw.maxCatchupDays * dayTicks,
  };
}

function checkReferences(tables: RawTables, errors: string[]): void {
  const has = (table: Exclude<TableName, 'scenes' | 'actions'>, id: string): boolean =>
    tables[table][id] !== undefined;
  for (const [id, a] of entriesOf(tables.archetypes)) {
    for (const t of a.terrains) {
      if (!has('terrains', t.kind)) errors.push(`archetypes.${id}.terrains: terreno desconocido ${t.kind}`);
    }
    for (const [terrain, finds] of Object.entries(a.finds)) {
      if (!has('terrains', terrain)) errors.push(`archetypes.${id}.finds: terreno desconocido ${terrain}`);
      for (const f of finds) {
        if (f.kind !== NOTHING && !has('elements', f.kind)) {
          errors.push(`archetypes.${id}.finds.${terrain}: elemento desconocido ${f.kind}`);
        }
      }
    }
    if (!has('terrains', a.start.terrain)) errors.push(`archetypes.${id}.start.terrain: terreno desconocido`);
    for (const e of a.start.elements) {
      if (!has('elements', e.kind))
        errors.push(`archetypes.${id}.start.elements: elemento desconocido ${e.kind}`);
    }
    for (const m of a.start.mobiles) {
      if (!has('mobiles', m.kind)) errors.push(`archetypes.${id}.start.mobiles: móvil desconocido ${m.kind}`);
    }
  }
  for (const [id, t] of entriesOf(tables.templates)) {
    const ids = new Set<string>();
    for (const p of t.plots) {
      if (ids.has(p.id)) errors.push(`templates.${id}: terreno repetido ${p.id}`);
      ids.add(p.id);
      if (!has('archetypes', p.archetype))
        errors.push(`templates.${id}.${p.id}: arquetipo desconocido ${p.archetype}`);
    }
    if (t.common !== null && !has('archetypes', t.common.archetype)) {
      errors.push(`templates.${id}.common: arquetipo desconocido ${t.common.archetype}`);
    }
  }
}

/** Valida, convierte y hashea. Lanza `ContentError` con todos los problemas encontrados. */
export function compile(tables: RawTables): CompiledContent {
  const errors = validateTables(tables);
  if (errors.length > 0) throw new ContentError('las tablas no cumplen su esquema', errors);
  checkReferences(tables, errors);
  if (errors.length > 0) throw new ContentError('referencias rotas entre tablas', errors);

  const scenes = {} as Record<SceneKind, SceneTable>;
  for (const kind of SCENE_KINDS) scenes[kind] = compileScene(kind, tables.scenes[kind]);
  const tickMs = scenes.district.tickMs;
  for (const kind of SCENE_KINDS) {
    if (scenes[kind].tickMs !== tickMs) {
      throw new ContentError(`scenes.${kind}.tickMs: todas las escenas comparten el tick (${tickMs} ms)`);
    }
  }

  const archetypes: Record<string, Archetype> = {};
  for (const [id, a] of entriesOf(tables.archetypes)) {
    archetypes[id] = {
      tier: a.tier,
      terrains: a.terrains.map((w) => ({ kind: w.kind, weight: w.weight })),
      finds: Object.fromEntries(
        Object.entries(a.finds).map(([t, ws]) => [t, ws.map((w) => ({ kind: w.kind, weight: w.weight }))]),
      ),
      start: {
        terrain: a.start.terrain,
        elements: a.start.elements.map((e) => ({ kind: e.kind, dx: e.dx, dy: e.dy })),
        mobiles: a.start.mobiles.map((m) => ({ kind: m.kind })),
        stocks: { ...a.start.stocks },
      },
    };
  }

  const templates: Record<string, Template> = {};
  for (const [id, t] of entriesOf(tables.templates)) {
    templates[id] = {
      kind: t.kind,
      plots: t.plots.map((p) => ({
        id: p.id,
        archetype: p.archetype,
        anchor: { q: p.anchor.q, r: p.anchor.r },
        radius: p.radius,
      })),
      common:
        t.common === null
          ? null
          : { archetype: t.common.archetype, sectors: t.common.sectors.map((h) => ({ q: h.q, r: h.r })) },
    };
  }

  const compiled: Omit<CompiledContent, 'hash'> = {
    scenes,
    archetypes,
    templates,
    elements: Object.fromEntries(entriesOf(tables.elements).map(([k, e]) => [k, { category: e.category }])),
    mobiles: Object.fromEntries(
      entriesOf(tables.mobiles).map(([k, m]) => [
        k,
        {
          stats: {
            force: m.stats.force,
            vision: m.stats.vision,
            alert: m.stats.alert,
            speed: m.stats.speedMmPerS,
          },
          names: [...m.names],
        },
      ]),
    ),
    terrains: Object.fromEntries(entriesOf(tables.terrains).map(([k, t]) => [k, { category: t.category }])),
    actions: {
      reveal: {
        resource: tables.actions.reveal.resource,
        cost: tables.actions.reveal.costJ,
        ticks: secondsToTicks(tables.actions.reveal.seconds, tickMs, 'actions.reveal.seconds'),
      },
    },
  };
  return { hash: hashOf(compiled), ...compiled };
}
