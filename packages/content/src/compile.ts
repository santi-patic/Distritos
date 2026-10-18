/**
 * Compilador de tablas: valida contra los esquemas JSON, comprueba referencias cruzadas,
 * convierte unidades (segundos → ticks, tasas → unidades por día, hexágono → retícula entera)
 * y calcula el hash.
 *
 * El resultado es el `CompiledContent` que consume el sim. El hash es el sha-256 del JSON
 * canónico del contenido compilado: cambia si cambia una tabla o una conversión.
 */

import { Ajv, type ErrorObject } from 'ajv';
import {
  hashOf,
  NOTHING,
  type Archetype,
  type BoardTable,
  type BuildKind,
  type CompiledContent,
  type ElementKind,
  type ErrandTable,
  type HireKind,
  type LinkKind,
  type MobileKind,
  type PlaceKind,
  type ResourceKind,
  type RevealWork,
  type SceneKind,
  type SceneTable,
  type TaskKind,
  type Template,
  type WorkSpec,
} from '@distritos/sim';
import type { RatePeriod, RawRate, RawScene, RawTables, RawWork, TableName } from './raw.js';
import { TABLE_NAMES } from './raw.js';
import { schemas } from './schemas.js';

const SCENE_KINDS: readonly SceneKind[] = ['district', 'incursion', 'charge', 'dispute'];

/** Cuántas veces cabe cada periodo de tasa en un día de 24 h. */
const PER_DAY: Record<RatePeriod, number> = { s: 86_400, h: 24, dia: 1 };

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

/** Tasa en unidades por día de 24 h. */
function perDay(rate: RawRate): number {
  return rate.amount * PER_DAY[rate.per];
}

function copyAmounts(a: Record<string, number> | undefined): Record<string, number> | undefined {
  return a === undefined ? undefined : { ...a };
}

function compileScene(kind: SceneKind, raw: RawScene): SceneTable {
  const { tickMs } = raw;
  const dayTicks = secondsToTicks(raw.daySeconds, tickMs, `scenes.${kind}.daySeconds`);
  const light = raw.light.map(([s, l], i): [number, number] => {
    const t = secondsToTicks(s, tickMs, `scenes.${kind}.light[${i}]`);
    if (t >= dayTicks) throw new ContentError(`scenes.${kind}.light[${i}]: ${s} s se sale del ciclo`);
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
  const out: SceneTable = {
    tickMs,
    dayTicks,
    light,
    hexSizeMm: raw.hexSizeMm,
    hexW,
    hexH,
    maxCatchupTicks: raw.maxCatchupDays * dayTicks,
  };
  if (raw.workLight !== undefined) out.workLight = raw.workLight;
  if (raw.dailyAt !== undefined) {
    if (raw.dailyAt >= raw.daySeconds) throw new ContentError(`scenes.${kind}.dailyAt: se sale del día`);
    out.dailyAt = secondsToTicks(raw.dailyAt, tickMs, `scenes.${kind}.dailyAt`);
  }
  return out;
}

function compileWork(raw: RawWork, tickMs: number, what: string): WorkSpec {
  const out: WorkSpec = { ticks: secondsToTicks(raw.seconds, tickMs, `${what}.seconds`) };
  if (raw.firstSeconds !== undefined)
    out.firstTicks = secondsToTicks(raw.firstSeconds, tickMs, `${what}.firstSeconds`);
  if (raw.cost !== undefined) out.cost = { ...raw.cost };
  return out;
}

function compileElement(id: string, raw: RawTables['elements'][string]): ElementKind {
  const out: ElementKind = { category: raw.category };
  if (raw.stores !== undefined) out.stores = { ...raw.stores };
  if (raw.inventory !== undefined) out.inventory = raw.inventory;
  if (raw.produce !== undefined) {
    const p = raw.produce;
    let rate = perDay(p);
    if (p.yieldPermille !== undefined) rate = Math.floor((rate * p.yieldPermille) / 1000);
    if (!Number.isSafeInteger(rate)) throw new ContentError(`elements.${id}.produce: tasa fuera de rango`);
    out.produce = { resource: p.resource, perDay: rate, to: p.to };
    if (p.light !== undefined) out.produce.light = p.light;
    if (p.wear !== undefined) out.produce.wear = p.wear;
  }
  if (raw.consume !== undefined)
    out.consume = { resource: raw.consume.resource, perDay: perDay(raw.consume) };
  if (raw.switchable !== undefined) out.switchable = raw.switchable;
  if (raw.beds !== undefined) out.beds = raw.beds;
  if (raw.soil !== undefined) out.soil = { perDay: raw.soil.perDay, max: raw.soil.max };
  if (raw.cycles !== undefined) out.cycles = { lossPermille: raw.cycles.lossPermille };
  return out;
}

function checkReferences(tables: RawTables, errors: string[]): void {
  const has = (table: Exclude<TableName, 'scenes' | 'actions' | 'board' | 'recados'>, id: string): boolean =>
    (tables[table] as Record<string, unknown>)[id] !== undefined;
  const resource = (where: string, r: string): void => {
    if (!has('resources', r)) errors.push(`${where}: recurso desconocido ${r}`);
  };
  const element = (where: string, k: string): void => {
    if (!has('elements', k)) errors.push(`${where}: elemento desconocido ${k}`);
  };
  const amounts = (where: string, a: Record<string, number> | undefined): void => {
    for (const r of Object.keys(a ?? {})) resource(where, r);
  };

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
    a.start.elements.forEach((e, i) => {
      element(`archetypes.${id}.start.elements[${i}]`, e.kind);
      for (const r of Object.keys(e.store ?? {})) {
        if (tables.elements[e.kind]?.stores?.[r] === undefined) {
          errors.push(`archetypes.${id}.start.elements[${i}]: ${e.kind} no almacena ${r}`);
        }
      }
      if (e.on !== undefined && tables.elements[e.kind]?.switchable !== true) {
        errors.push(`archetypes.${id}.start.elements[${i}]: ${e.kind} no se enciende`);
      }
    });
    for (const m of a.start.mobiles) {
      if (!has('mobiles', m.kind)) errors.push(`archetypes.${id}.start.mobiles: móvil desconocido ${m.kind}`);
    }
    amounts(`archetypes.${id}.start.stocks`, a.start.stocks);
    (a.start.links ?? []).forEach((l, i) => {
      if (!has('links', l.kind))
        errors.push(`archetypes.${id}.start.links[${i}]: nexo desconocido ${l.kind}`);
      const n = a.start.elements.length;
      if (l.a >= n || l.b >= n || l.a === l.b)
        errors.push(`archetypes.${id}.start.links[${i}]: índices fuera de la dotación`);
    });
  }
  for (const [id, t] of entriesOf(tables.templates)) {
    const ids = new Set<string>();
    for (const p of t.plots) {
      if (ids.has(p.id)) errors.push(`templates.${id}: terreno repetido ${p.id}`);
      ids.add(p.id);
      if (!has('archetypes', p.archetype))
        errors.push(`templates.${id}.${p.id}: arquetipo desconocido ${p.archetype}`);
    }
    if (t.common !== null) {
      if (!has('archetypes', t.common.archetype)) {
        errors.push(`templates.${id}.common: arquetipo desconocido ${t.common.archetype}`);
      }
      for (const e of t.common.elements ?? []) {
        element(`templates.${id}.common.elements`, e.kind);
        if (!t.common.sectors.some((h) => h.q === e.hex.q && h.r === e.hex.r)) {
          errors.push(`templates.${id}.common.elements: ${e.kind} no está en un sector común`);
        }
      }
    }
  }
  for (const [id, e] of entriesOf(tables.elements)) {
    amounts(`elements.${id}.stores`, e.stores);
    if (e.produce !== undefined) resource(`elements.${id}.produce`, e.produce.resource);
    if (e.consume !== undefined) resource(`elements.${id}.consume`, e.consume.resource);
    if (e.produce?.to === 'self' && e.stores?.[e.produce.resource] === undefined) {
      errors.push(`elements.${id}.produce: produce para sí pero no almacena ${e.produce.resource}`);
    }
    const p = e.produce === undefined ? undefined : tables.resources[e.produce.resource];
    const c = e.consume === undefined ? undefined : tables.resources[e.consume.resource];
    if (p !== undefined && c !== undefined && c.order >= p.order) {
      errors.push(
        `elements.${id}: gasta ${e.consume?.resource} para producir ${e.produce?.resource}; tiene que ir antes en resources`,
      );
    }
  }
  for (const [id, m] of entriesOf(tables.mobiles)) {
    if (m.eats !== undefined) resource(`mobiles.${id}.eats`, m.eats.resource);
  }
  resource('actions.reveal', tables.actions.reveal.resource);
  {
    const r = tables.actions.reveal;
    if ((r.seconds === undefined) === (r.curveSeconds === undefined))
      errors.push(
        'actions.reveal: o seconds (abrir trabajando) o curveSeconds (curva de apertura), uno de los dos',
      );
    if (r.curveSeconds !== undefined && r.firstSeconds !== undefined)
      errors.push('actions.reveal: firstSeconds no vale con curva (la curva ya empieza corta)');
  }
  for (const [id, t] of entriesOf(tables.tasks)) {
    for (const k of t.at) element(`tasks.${id}.at`, k);
    amounts(`tasks.${id}.cost`, t.cost);
    amounts(`tasks.${id}.gives`, t.gives);
    if (t.collect !== undefined) resource(`tasks.${id}.collect`, t.collect);
    if (t.gives !== undefined && t.into === undefined) errors.push(`tasks.${id}: gives sin into`);
    if (t.tool !== undefined) {
      element(`tasks.${id}.tool`, t.tool.kind);
      amounts(`tasks.${id}.tool.cost`, t.tool.cost);
    }
  }
  for (const [id, b] of entriesOf(tables.builds)) {
    element(`builds.${id}`, id);
    amounts(`builds.${id}.cost`, b.cost);
    for (const k of b.near?.kinds ?? []) element(`builds.${id}.near`, k);
  }
  for (const [id, l] of entriesOf(tables.links)) {
    if (l.carries !== undefined) resource(`links.${id}.carries`, l.carries);
    amounts(`links.${id}.cost`, l.cost);
    amounts(`links.${id}.costPerUnit`, l.costPerUnit);
  }
  for (const [id, h] of entriesOf(tables.hires)) {
    if (!has('mobiles', id)) errors.push(`hires.${id}: móvil desconocido`);
    amounts(`hires.${id}.cost`, h.cost);
  }
  resource('recados.currency', tables.recados.currency);
  const types = tables.recados.types;
  for (const [id, k] of entriesOf(tables.recados.kinds)) {
    for (const to of k.to) {
      element(`recados.kinds.${id}.to`, to);
      if (!has('places', to)) errors.push(`recados.kinds.${id}.to: ${to} no es un sitio de recados`);
    }
    amounts(`recados.kinds.${id}.takes`, k.takes);
    // Clase del tipo (P15): los de hacer no ocupan carga y llevan su trabajo; los de llevar, al revés.
    const hacer = k.workSeconds !== undefined;
    if (hacer && k.size !== 0) errors.push(`recados.kinds.${id}: un recado de hacer no ocupa carga (size 0)`);
    if (!hacer && k.size < 1) errors.push(`recados.kinds.${id}: un recado de llevar ocupa al menos un bulto`);
    if (hacer && k.takes !== undefined)
      errors.push(`recados.kinds.${id}: un recado de hacer no lleva nada (takes)`);
    if (types !== undefined) {
      if (k.type === undefined) errors.push(`recados.kinds.${id}: falta el tipo (type)`);
      else {
        const t = types[k.type];
        if (t === undefined) errors.push(`recados.kinds.${id}.type: tipo desconocido ${k.type}`);
        else if ((t.class === 'hacer') !== hacer)
          errors.push(`recados.kinds.${id}: el tipo ${k.type} es de ${t.class} y el recado no`);
      }
    } else if (k.type !== undefined) errors.push(`recados.kinds.${id}.type: no hay tabla de tipos (types)`);
  }
  for (const [id, p] of entriesOf(tables.places)) {
    element(`places.${id}`, id);
    for (const m of p.makes ?? []) {
      if (tables.recados.kinds[m.kind] === undefined)
        errors.push(`places.${id}.makes: recado desconocido ${m.kind}`);
    }
    if ((p.makes ?? []).length > 0 && p.every === undefined)
      errors.push(`places.${id}: genera recados pero no dice cada cuánto (every)`);
  }
  resource('board.currency', tables.board.currency);
  tables.board.encargos.forEach((e, i) => {
    element(`board.encargos[${i}].at`, e.at);
    if (e.work !== true) resource(`board.encargos[${i}]`, e.resource);
    if (e.perTrip > e.amount) errors.push(`board.encargos[${i}]: perTrip mayor que amount`);
  });
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
    const start: Archetype['start'] = {
      terrain: a.start.terrain,
      elements: a.start.elements.map((e) => {
        const out: Archetype['start']['elements'][number] = { kind: e.kind, dx: e.dx, dy: e.dy };
        if (e.store !== undefined) out.store = { ...e.store };
        if (e.on !== undefined) out.on = e.on;
        return out;
      }),
      mobiles: a.start.mobiles.map((m) => ({ kind: m.kind })),
      stocks: { ...a.start.stocks },
    };
    if (a.start.links !== undefined)
      start.links = a.start.links.map((l) => ({ kind: l.kind, a: l.a, b: l.b }));
    archetypes[id] = {
      tier: a.tier,
      terrains: a.terrains.map((w) => ({ kind: w.kind, weight: w.weight })),
      finds: Object.fromEntries(
        Object.entries(a.finds).map(([t, ws]) => [t, ws.map((w) => ({ kind: w.kind, weight: w.weight }))]),
      ),
      start,
    };
  }

  const templates: Record<string, Template> = {};
  for (const [id, t] of entriesOf(tables.templates)) {
    let common: Template['common'] = null;
    if (t.common !== null) {
      common = { archetype: t.common.archetype, sectors: t.common.sectors.map((h) => ({ q: h.q, r: h.r })) };
      if (t.common.elements !== undefined) {
        common.elements = t.common.elements.map((e) => ({
          kind: e.kind,
          hex: { q: e.hex.q, r: e.hex.r },
          dx: e.dx,
          dy: e.dy,
        }));
      }
    }
    templates[id] = {
      kind: t.kind,
      plots: t.plots.map((p) => ({
        id: p.id,
        archetype: p.archetype,
        anchor: { q: p.anchor.q, r: p.anchor.r },
        radius: p.radius,
      })),
      common,
    };
  }

  const mobiles: Record<string, MobileKind> = {};
  for (const [k, m] of entriesOf(tables.mobiles)) {
    const out: MobileKind = {
      stats: {
        force: m.stats.force,
        vision: m.stats.vision,
        alert: m.stats.alert,
        speed: m.stats.speedMmPerS,
      },
      names: [...m.names],
    };
    if (m.eats !== undefined) out.eats = { resource: m.eats.resource, perDay: m.eats.perDay };
    if (m.hungryPermille !== undefined) out.hungryPermille = m.hungryPermille;
    if (m.carry !== undefined) out.carry = m.carry;
    mobiles[k] = out;
  }

  const rawReveal = tables.actions.reveal;
  let reveal: CompiledContent['actions']['reveal'];
  if (rawReveal.curveSeconds !== undefined) {
    reveal = {
      resource: rawReveal.resource,
      cost: rawReveal.costJ,
      curve: rawReveal.curveSeconds.map((sec, i) =>
        secondsToTicks(sec, tickMs, `actions.reveal.curveSeconds[${i}]`),
      ),
    };
  } else {
    const work: RevealWork = {
      resource: rawReveal.resource,
      cost: rawReveal.costJ,
      ticks: secondsToTicks(rawReveal.seconds ?? 0, tickMs, 'actions.reveal.seconds'),
    };
    if (rawReveal.firstSeconds !== undefined)
      work.firstTicks = secondsToTicks(rawReveal.firstSeconds, tickMs, 'actions.reveal.firstSeconds');
    reveal = work;
  }
  const actions: CompiledContent['actions'] = { reveal };
  if (tables.actions.name !== undefined) actions.name = { maxLength: tables.actions.name.maxLength };

  const resources: Record<string, ResourceKind> = {};
  for (const [k, r] of entriesOf(tables.resources)) resources[k] = { physical: r.physical, order: r.order };

  const tasks: Record<string, TaskKind> = {};
  for (const [k, t] of entriesOf(tables.tasks)) {
    const out: TaskKind = { at: [...t.at], ...compileWork(t, tickMs, `tasks.${k}`) };
    if (t.gives !== undefined) out.gives = { ...t.gives };
    if (t.into !== undefined) out.into = t.into;
    if (t.collect !== undefined) out.collect = t.collect;
    if (t.clean !== undefined) out.clean = t.clean;
    if (t.tool !== undefined)
      out.tool = { kind: t.tool.kind, ...compileWork(t.tool, tickMs, `tasks.${k}.tool`) };
    if (t.jornada !== undefined) out.jornada = t.jornada;
    tasks[k] = out;
  }

  const builds: Record<string, BuildKind> = {};
  for (const [k, b] of entriesOf(tables.builds)) {
    const work = compileWork(b, tickMs, `builds.${k}`);
    const out: BuildKind = { ...work, cost: { ...b.cost }, gapMm: b.gapMm };
    if (b.near !== undefined) out.near = { kinds: [...b.near.kinds], hexes: b.near.hexes };
    builds[k] = out;
  }

  const links: Record<string, LinkKind> = {};
  for (const [k, l] of entriesOf(tables.links)) {
    const out: LinkKind = {
      unitMm: l.unitMm,
      ticksPerUnit: secondsToTicks(l.secondsPerUnit, tickMs, `links.${k}.secondsPerUnit`),
    };
    if (l.carries !== undefined) out.carries = l.carries;
    if (l.speedPermille !== undefined) out.speedPermille = l.speedPermille;
    if (l.firstSeconds !== undefined)
      out.firstTicks = secondsToTicks(l.firstSeconds, tickMs, `links.${k}.firstSeconds`);
    const cost = copyAmounts(l.cost);
    if (cost !== undefined) out.cost = cost;
    const costPerUnit = copyAmounts(l.costPerUnit);
    if (costPerUnit !== undefined) out.costPerUnit = costPerUnit;
    if (l.maxMm !== undefined) out.maxMm = l.maxMm;
    links[k] = out;
  }

  const hires: Record<string, HireKind> = {};
  for (const [k, h] of entriesOf(tables.hires)) hires[k] = { cost: { ...h.cost } };

  const board: BoardTable = {
    currency: tables.board.currency,
    encargos: tables.board.encargos.map((e, i) => {
      const work = e.work === true;
      const units = (n: number, what: string): number =>
        work ? secondsToTicks(n, tickMs, `board.encargos[${i}].${what}`) : n;
      const out: BoardTable['encargos'][number] = {
        id: e.id,
        at: e.at,
        resource: e.resource,
        amount: units(e.amount, 'amount'),
        perTrip: units(e.perTrip, 'perTrip'),
        reward: e.reward,
      };
      if (work) out.work = true;
      return out;
    }),
  };

  const places: Record<string, PlaceKind> = {};
  for (const [k, p] of entriesOf(tables.places)) {
    const out: PlaceKind = { capacity: p.capacity };
    if (p.start !== undefined) out.start = p.start;
    if (p.makes !== undefined) out.makes = p.makes.map((w) => ({ kind: w.kind, weight: w.weight }));
    if (p.every !== undefined) out.everyTicks = secondsToTicks(p.every, tickMs, `places.${k}.every`);
    places[k] = out;
  }

  const r = tables.recados;
  const errands: ErrandTable = {
    currency: r.currency,
    stopTicks: secondsToTicks(r.stopSeconds, tickMs, 'recados.stopSeconds'),
    maxStops: r.maxStops,
    kinds: Object.fromEntries(
      entriesOf(r.kinds).map(([k, e]) => {
        const out: ErrandTable['kinds'][string] = { to: [...e.to], size: e.size, pay: e.pay };
        if (e.expiresSeconds !== undefined)
          out.expiresTicks = secondsToTicks(e.expiresSeconds, tickMs, `recados.kinds.${k}.expiresSeconds`);
        if (e.type !== undefined) out.type = e.type;
        if (e.workSeconds !== undefined)
          out.work = secondsToTicks(e.workSeconds, tickMs, `recados.kinds.${k}.workSeconds`);
        if (e.takes !== undefined) out.takes = { ...e.takes };
        return [k, out];
      }),
    ),
  };
  if (r.types !== undefined)
    errands.types = Object.fromEntries(entriesOf(r.types).map(([k, t]) => [k, { class: t.class }]));
  if (r.firstStopSeconds !== undefined)
    errands.firstStopTicks = secondsToTicks(r.firstStopSeconds, tickMs, 'recados.firstStopSeconds');

  const compiled: Omit<CompiledContent, 'hash'> = {
    scenes,
    archetypes,
    templates,
    elements: Object.fromEntries(entriesOf(tables.elements).map(([k, e]) => [k, compileElement(k, e)])),
    mobiles,
    terrains: Object.fromEntries(entriesOf(tables.terrains).map(([k, t]) => [k, { category: t.category }])),
    actions,
    resources,
    tasks,
    builds,
    links,
    hires,
    board,
    places,
    errands,
  };
  return { hash: hashOf(compiled), ...compiled };
}
