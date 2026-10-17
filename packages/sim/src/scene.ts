/**
 * Creación de la escena desde una plantilla. Esquema del paquete sim, §7 y §11.
 *
 * La plantilla fija qué sectores son de cada terreno y cuáles son tierra común; el arquetipo
 * de cada terreno fija qué puede haber; la semilla decide qué hay en cada sector y dónde.
 * Todo el azar de la creación sale de `state.rng`, en un orden fijo: terrenos en el orden de
 * la plantilla, sectores por (q, r).
 */

import { assertInt, fdiv, min } from './arith.js';
import { COMMON_ACCESS, PLOT_ACCESS, copyAccess } from './access.js';
import { add, type Vec } from './geom.js';
import { assertLattice, center, key, keyOf, nearest, parse, range, type Hex, type Lattice } from './hex.js';
import { at, get, removeKey, sortedKeys } from './iter.js';
import { nextInt, pickWeighted, seed, type RngState } from './rng.js';
import { initBoard } from './rules/board.js';
import { addElement, capacityOf, setLevel } from './rules/elements.js';
import { assertFlowContent } from './rules/flows.js';
import { addLink } from './rules/links.js';
import type {
  Archetype,
  CommonElement,
  CompiledContent,
  StartElement,
  Template,
  Weighted,
} from './types/content.js';
import { NOTHING } from './types/content.js';
import type { ActorId, Int, KindId, PlotId } from './types/ids.js';
import { SYSTEM_ACTOR } from './types/ids.js';
import type { Character, Element, Mobile, Plot, SceneKind, SectorContent, SimState } from './types/state.js';
import { STATE_VERSION } from './types/state.js';
import { RULES_VERSION } from './version.js';

export interface SceneActorParams {
  id: ActorId;
  plot: PlotId;
  character?: Character;
}

export interface SceneParams {
  kind: SceneKind;
  template: KindId;
  /** 64 bits en hexadecimal. */
  seed: string;
  actors: SceneActorParams[];
  dayOffset?: Int;
}

export const EMPTY_CHARACTER: Readonly<Character> = { skills: {}, blueprints: [], experience: 0 };

function need<T>(record: Readonly<Record<string, T>>, id: string, what: string): T {
  const v = record[id];
  if (v === undefined) throw new Error(`contenido: ${what} desconocido: ${id}`);
  return v;
}

function pick(rng: RngState, table: readonly Weighted[], what: string): [KindId, RngState] {
  if (table.length === 0) throw new Error(`contenido: tabla vacía: ${what}`);
  const [i, next] = pickWeighted(
    rng,
    table.map((w) => w.weight),
  );
  return [at(table, i).kind, next];
}

/** Punto al azar dentro del sector: dentro de un rectángulo centrado que cabe en el hexágono. */
function randomOffset(rng: RngState, lat: Lattice): [Vec, RngState] {
  const rx = fdiv(lat.hexW, 3);
  const ry = fdiv(lat.hexH, 3);
  const [dx, r1] = nextInt(rng, 2 * rx + 1);
  const [dy, r2] = nextInt(r1, 2 * ry + 1);
  return [{ x: dx - rx, y: dy - ry }, r2];
}

function generateSector(
  state: SimState,
  h: Hex,
  plot: PlotId | null,
  archetype: Archetype,
  lat: Lattice,
  content: CompiledContent,
): void {
  const k = key(h);
  if (state.map.sectors[k] !== undefined) throw new Error(`plantilla: el sector ${k} está en dos sitios`);
  state.map.sectors[k] = {
    q: h.q,
    r: h.r,
    plot,
    status: 'hidden',
    access: copyAccess(plot === null ? COMMON_ACCESS : PLOT_ACCESS),
  };
  const [terrain, rngAfterTerrain] = pick(state.rng, archetype.terrains, 'terrenos del arquetipo');
  let rng = rngAfterTerrain;
  need(content.terrains, terrain, 'terreno');
  const findsTable = archetype.finds[terrain] ?? [];
  const finds: SectorContent['finds'] = [];
  if (findsTable.length > 0) {
    let kind: KindId;
    [kind, rng] = pick(rng, findsTable, `hallazgos de ${terrain}`);
    if (kind !== NOTHING) {
      need(content.elements, kind, 'elemento');
      let offset: Vec;
      [offset, rng] = randomOffset(rng, lat);
      finds.push({ kind, pos: add(center(h, lat), offset) });
    }
  }
  state.hidden.sectorContents[k] = { terrain, finds };
  state.rng = rng;
}

/** Existencias iniciales y encendido de un elemento de la dotación (F1). */
function stock(content: CompiledContent, element: Element, spec: StartElement): void {
  if (spec.store !== undefined) {
    for (const r of sortedKeys(spec.store)) {
      if (element.store?.[r] === undefined) throw new Error(`contenido: ${element.kind} no almacena ${r}`);
      setLevel(element, r, min(spec.store[r] ?? 0, capacityOf(content, element, r)));
    }
  }
  if (spec.on !== undefined) {
    if (element.on === undefined) throw new Error(`contenido: ${element.kind} no se enciende`);
    element.on = spec.on;
  }
}

function newMobileId(state: SimState): string {
  state.counters.mobile += 1;
  return `m${state.counters.mobile}`;
}

function occupy(state: SimState, actor: SceneActorParams, content: CompiledContent, lat: Lattice): void {
  const plot = state.plots[actor.plot];
  if (plot === undefined) throw new Error(`escena: el terreno ${actor.plot} no existe en la plantilla`);
  if (plot.status !== 'vacant') throw new Error(`escena: el terreno ${actor.plot} ya está ocupado`);
  if (state.actors[actor.id] !== undefined) throw new Error(`escena: actor repetido: ${actor.id}`);
  const archetype = need(content.archetypes, plot.archetype, 'arquetipo');
  const kit = archetype.start;

  plot.owner = actor.id;
  plot.status = 'occupied';
  plot.since = state.tick;

  state.actors[actor.id] = {
    plot: plot.id,
    stocks: { ...kit.stocks },
    share: 0,
    lastOrderTick: state.tick,
    character: actor.character ?? { skills: {}, blueprints: [], experience: 0 },
  };

  const anchorHex = parse(plot.anchor);
  const sector = get(state.map.sectors, plot.anchor, 'sector central');
  sector.status = 'revealed';
  sector.revealedBy = actor.id;
  sector.revealedTick = state.tick;
  sector.terrain = kit.terrain;
  need(content.terrains, kit.terrain, 'terreno');
  // El sector central no se descubre: lo que hubiera generado se descarta.
  removeKey(state.hidden.sectorContents, plot.anchor);

  const origin = center(anchorHex, lat);
  let home: Element | null = null;
  const placed: Element[] = [];
  for (const e of kit.elements) {
    need(content.elements, e.kind, 'elemento');
    const pos = add(origin, { x: e.dx, y: e.dy });
    const at = nearest(pos, lat);
    if (key(at) !== plot.anchor) {
      throw new Error(`contenido: el elemento inicial ${e.kind} cae fuera del sector central`);
    }
    const element = addElement(state, content, { kind: e.kind, pos, sector: plot.anchor, owner: actor.id });
    stock(content, element, e);
    placed.push(element);
    home ??= element;
  }
  if (home === null) throw new Error('contenido: la dotación inicial no tiene elementos');
  // La finca empieza cableada (F1).
  for (const l of kit.links ?? []) {
    const a = placed[l.a];
    const b = placed[l.b];
    if (a === undefined || b === undefined) throw new Error(`contenido: nexo inicial fuera de la dotación`);
    addLink(state, content, l.kind, a, b);
  }

  let rng = state.rng;
  for (const m of kit.mobiles) {
    const kind = need(content.mobiles, m.kind, 'móvil');
    let name: string | undefined;
    if (kind.names.length > 0) {
      let i: Int;
      [i, rng] = nextInt(rng, kind.names.length);
      name = kind.names[i];
    }
    const mobile: Mobile = {
      id: newMobileId(state),
      kind: m.kind,
      owner: actor.id,
      stats: { ...kind.stats },
      where: { kind: 'at', pos: home.pos, element: home.id },
      job: null,
    };
    if (name !== undefined) mobile.name = name;
    state.mobiles[mobile.id] = mobile;
  }
  state.rng = rng;
}

/** Estado inicial de una escena: plantilla + semilla + actores. Determinista. */
export function createScene(params: SceneParams, content: CompiledContent): SimState {
  const template: Template = need(content.templates, params.template, 'plantilla');
  if (template.kind !== params.kind) {
    throw new Error(`escena: la plantilla ${params.template} es de tipo ${template.kind}, no ${params.kind}`);
  }
  const table = content.scenes[params.kind];
  const lat: Lattice = { hexW: table.hexW, hexH: table.hexH };
  assertLattice(lat);
  assertFlowContent(content, table.tickMs);
  if (!/^[0-9a-f]{1,64}$/.test(params.seed))
    throw new Error('escena: la semilla es hexadecimal en minúsculas');

  const state: SimState = {
    v: STATE_VERSION,
    scene: {
      kind: params.kind,
      template: params.template,
      seed: params.seed,
      tickMs: assertInt(table.tickMs, 'tickMs'),
      dayTicks: assertInt(table.dayTicks, 'dayTicks'),
      dayOffset: assertInt(params.dayOffset ?? 0, 'dayOffset'),
      hexW: table.hexW,
      hexH: table.hexH,
      contentHash: content.hash,
      rules: RULES_VERSION,
    },
    tick: 0,
    rng: seed(params.seed, 0),
    counters: { element: 0, mobile: 0, link: 0 },
    map: { sectors: {} },
    plots: {},
    elements: {},
    mobiles: {},
    links: {},
    actors: {},
    district: { pot: {} },
    hidden: { sectorContents: {} },
  };

  for (const tp of template.plots) {
    if (state.plots[tp.id] !== undefined) throw new Error(`plantilla: terreno repetido: ${tp.id}`);
    const archetype = need(content.archetypes, tp.archetype, 'arquetipo');
    const plot: Plot = {
      id: tp.id,
      archetype: tp.archetype,
      tier: archetype.tier,
      anchor: keyOf(tp.anchor.q, tp.anchor.r),
      owner: null,
      status: 'vacant',
      since: 0,
    };
    state.plots[plot.id] = plot;
    for (const h of range(tp.anchor, tp.radius)) generateSector(state, h, plot.id, archetype, lat, content);
  }
  if (template.common !== null) {
    const archetype = need(content.archetypes, template.common.archetype, 'arquetipo');
    const sectors = [...template.common.sectors].sort((a, b) => (a.q !== b.q ? a.q - b.q : a.r - b.r));
    for (const h of sectors) generateSector(state, h, null, archetype, lat, content);
  }

  for (const actor of params.actors) occupy(state, actor, content, lat);
  if (template.common !== null) placeCommon(state, template.common.elements ?? [], content, lat);
  initBoard(state, content);

  return state;
}

/**
 * Elementos fijos de la tierra común (F1: el punto de carga y el almacén del común mínimo).
 * Su sector queda abierto por el distrito; lo que la semilla hubiera puesto allí se descarta.
 */
function placeCommon(
  state: SimState,
  elements: readonly CommonElement[],
  content: CompiledContent,
  lat: Lattice,
): void {
  for (const c of elements) {
    need(content.elements, c.kind, 'elemento');
    const k = keyOf(c.hex.q, c.hex.r);
    const sector = state.map.sectors[k];
    if (sector?.plot !== null) {
      throw new Error(`plantilla: el elemento común ${c.kind} no está en tierra común`);
    }
    const pos = add(center(c.hex, lat), { x: c.dx, y: c.dy });
    if (key(nearest(pos, lat)) !== k)
      throw new Error(`plantilla: el elemento común ${c.kind} cae fuera de su sector`);
    if (sector.status === 'hidden') {
      const hidden = state.hidden.sectorContents[k];
      sector.status = 'revealed';
      sector.revealedBy = SYSTEM_ACTOR;
      sector.revealedTick = state.tick;
      if (hidden !== undefined) sector.terrain = hidden.terrain;
      removeKey(state.hidden.sectorContents, k);
    }
    addElement(state, content, { kind: c.kind, pos, sector: k });
  }
}
