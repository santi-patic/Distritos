/**
 * Flujos continuos: producción y consumo por almacén, con acumulador de resto.
 * Diseño de la casa §4; esquema del paquete sim §5.4 y §6.4.
 *
 * Cada almacén (la batería, el depósito del pozo o de la bomba, la huerta) tiene una entrada
 * (lo que producen los elementos que lo llenan) y una demanda (lo que consumen los que tira de
 * él a través de un nexo). Las tasas van en unidades por día de 24 h y se acumulan por tick
 * con un resto entero por almacén, de modo que n ticks de una vez dan exactamente lo mismo
 * que n ticks uno a uno.
 *
 * Entre dos sucesos las tasas son constantes. Los sucesos de los flujos son: un cambio de luz
 * (si hay paneles), un almacén que se vacía, un almacén que se llena cuando lo llena un
 * conmutable, y los apagados pendientes. `nextFlowEvent` los calcula con fórmula cerrada y
 * `advance` acumula en bloque hasta el siguiente.
 *
 * Reglas:
 * - Con existencias (o con entrada suficiente), toda la demanda se atiende: neto = entrada − demanda.
 * - Vacío y con entrada menor que la demanda (apagón): los conmutables se apagan solos; los
 *   demás se reparten la entrada a partes iguales en proporción y el almacén se queda a cero.
 * - Un conmutable que llena un almacén lleno se apaga solo.
 * - Lo que no cabe en un almacén lleno se pierde.
 * - Quien produce gastando algo (la bomba, la huerta) produce en la fracción en que lo recibe.
 */

import { ceilDiv, clamp, fdiv, fmod, max, min, mul } from '../arith.js';
import { light, nextLightChange } from '../calendar.js';
import { compareStrings, get, sortedKeys } from '../iter.js';
import type { CompiledContent, ElementKind } from '../types/content.js';
import type { Event, SwitchReason } from '../types/events.js';
import type { ElementId, Int, Permille, ResourceId, Tick } from '../types/ids.js';
import type { Element, SimState } from '../types/state.js';
import { capacityOf, levelOf, setLevel } from './elements.js';

const MS_PER_DAY = 86_400_000;

/** Ticks por día de 24 h: el denominador de todas las tasas. */
export function rateDen(state: SimState): Int {
  return fdiv(MS_PER_DAY, state.scene.tickMs);
}

/**
 * Comprueba que las tablas permiten resolver los flujos: con almacenes o flujos hace falta la
 * tabla de recursos, el tick tiene que dividir el día y quien produce gastando algo tiene que
 * gastar un recurso que se resuelve antes que el que produce.
 */
export function assertFlowContent(content: CompiledContent, tickMs: Int): void {
  const kinds = sortedKeys(content.elements);
  const uses = kinds.some((k) => {
    const e = content.elements[k];
    return e?.stores !== undefined || e?.produce !== undefined || e?.consume !== undefined;
  });
  if (!uses) return;
  const resources = content.resources;
  if (resources === undefined)
    throw new Error('contenido: hay almacenes o flujos y falta la tabla de recursos');
  if (fmod(MS_PER_DAY, tickMs) !== 0) throw new Error(`contenido: el tick (${tickMs} ms) no divide el día`);
  for (const k of kinds) {
    const e = content.elements[k];
    const p = e?.produce;
    const c = e?.consume;
    if (p !== undefined && resources[p.resource] === undefined)
      throw new Error(`contenido: recurso desconocido ${p.resource}`);
    if (c !== undefined && resources[c.resource] === undefined)
      throw new Error(`contenido: recurso desconocido ${c.resource}`);
    if (
      p !== undefined &&
      c !== undefined &&
      (resources[c.resource]?.order ?? 0) >= (resources[p.resource]?.order ?? 0)
    ) {
      throw new Error(
        `contenido: ${k} gasta ${c.resource} para producir ${p.resource}: ${c.resource} tiene que ir antes`,
      );
    }
  }
}

export interface StoreFlow {
  element: ElementId;
  resource: ResourceId;
  level: Int;
  cap: Int;
  /** Entrada por día de los productores activos. */
  inflow: Int;
  /** Demanda por día de los consumidores atendidos. */
  demand: Int;
  /** Variación neta por día. */
  net: Int;
  /** Fracción atendida de la demanda, en milésimas. */
  supply: Permille;
  /** Lo llena un conmutable encendido (que se apagará al llenarse). */
  switchableIn: boolean;
}

export interface Flows {
  stores: StoreFlow[];
  /** Conmutables que tienen que apagarse en este tick. */
  switches: { element: ElementId; reason: Exclude<SwitchReason, 'order'> }[];
  /** Algún productor activo depende de la luz. */
  usesLight: boolean;
  /** Producción por día de cada productor activo. */
  produced: Record<ElementId, Int>;
  /** Fracción atendida del consumo de cada consumidor, en milésimas. */
  supplied: Record<ElementId, Permille>;
}

interface Topology {
  /** Productores que llenan cada almacén a través de un nexo. */
  feeders: Record<ElementId, ElementId[]>;
  /** Consumidores que tiran de cada almacén a través de un nexo. */
  drawers: Record<ElementId, ElementId[]>;
}

function kindOf(content: CompiledContent, e: Element): ElementKind | undefined {
  return content.elements[e.kind];
}

/** Los nexos que llevan un recurso van del productor al almacén o del almacén al consumidor. */
function topology(state: SimState, content: CompiledContent): Topology {
  const feeders: Record<ElementId, ElementId[]> = {};
  const drawers: Record<ElementId, ElementId[]> = {};
  for (const id of sortedKeys(state.links)) {
    const link = state.links[id];
    if (link === undefined) continue;
    const carries = content.links?.[link.kind]?.carries;
    if (carries === undefined) continue;
    const from = state.elements[link.from];
    const to = state.elements[link.to];
    if (from === undefined || to === undefined) continue;
    const kf = kindOf(content, from);
    const kt = kindOf(content, to);
    if (
      kf?.produce?.resource === carries &&
      kf.produce.to === 'link' &&
      kt?.stores?.[carries] !== undefined
    ) {
      (feeders[to.id] ??= []).push(from.id);
    }
    if (kt?.consume?.resource === carries && kf?.stores?.[carries] !== undefined) {
      (drawers[from.id] ??= []).push(to.id);
    }
  }
  return { feeders, drawers };
}

function produceRate(state: SimState, content: CompiledContent, e: Element, k: ElementKind, tick: Tick): Int {
  const p = k.produce;
  if (p === undefined) return 0;
  let num = p.perDay;
  let den = 1;
  if (p.light === true) {
    num = mul(num, light(state, content, tick));
    den = mul(den, 1000);
  }
  if (p.wear === true) {
    num = mul(num, 1000 - (e.wear ?? 0));
    den = mul(den, 1000);
  }
  return fdiv(num, den);
}

function resourceOrder(content: CompiledContent): ResourceId[] {
  const table = content.resources ?? {};
  return sortedKeys(table).sort((a, b) => {
    const d = (table[a]?.order ?? 0) - (table[b]?.order ?? 0);
    return d !== 0 ? d : compareStrings(a, b);
  });
}

/** Tasas de todos los almacenes en un tick, a partir del estado. Pura. */
export function resolveFlows(state: SimState, content: CompiledContent, tick: Tick = state.tick): Flows {
  const out: Flows = { stores: [], switches: [], usesLight: false, produced: {}, supplied: {} };
  if (content.resources === undefined) return out;
  const { feeders, drawers } = topology(state, content);
  const ids = sortedKeys(state.elements);
  for (const r of resourceOrder(content)) {
    for (const id of ids) {
      const s = state.elements[id];
      if (s === undefined) continue;
      const ks = kindOf(content, s);
      if (ks?.stores?.[r] === undefined) continue;
      const level = levelOf(s, r);
      const cap = capacityOf(content, s, r);

      // Entrada: el propio elemento si produce para sí, y los que lo llenan por nexo.
      const producers: Element[] = [];
      if (ks.produce?.resource === r && ks.produce.to === 'self') producers.push(s);
      for (const pid of feeders[id] ?? []) {
        const p = state.elements[pid];
        if (p !== undefined && p.id !== s.id) producers.push(p);
      }
      producers.sort((a, b) => compareStrings(a.id, b.id));
      let inflow = 0;
      let switchableIn = false;
      for (const p of producers) {
        const kp = kindOf(content, p);
        if (kp === undefined) continue;
        if (kp.switchable === true) {
          if (p.on !== true) continue;
          if (level >= cap) {
            out.switches.push({ element: p.id, reason: 'full' });
            continue;
          }
        }
        let rate = produceRate(state, content, p, kp, tick);
        if (kp.consume !== undefined) rate = fdiv(mul(rate, out.supplied[p.id] ?? 0), 1000);
        // [F5] reparto al común: aquí se desviará la parte `share` de la producción propia.
        if (kp.produce?.light === true) out.usesLight = true;
        if (kp.switchable === true) switchableIn = true;
        out.produced[p.id] = rate;
        inflow += rate;
      }

      // Demanda: los consumidores unidos por nexo, encendidos si son conmutables.
      const consumers: Element[] = [];
      for (const cid of drawers[id] ?? []) {
        const c = state.elements[cid];
        if (c === undefined) continue;
        const kc = kindOf(content, c);
        if (kc?.consume === undefined) continue;
        if (kc.switchable === true && c.on !== true) continue;
        consumers.push(c);
      }
      consumers.sort((a, b) => compareStrings(a.id, b.id));
      const perDay = (c: Element): Int => kindOf(content, c)?.consume?.perDay ?? 0;
      const isSwitchable = (c: Element): boolean => kindOf(content, c)?.switchable === true;
      let demand = 0;
      for (const c of consumers) demand += perDay(c);

      let supply: Permille = 1000;
      let net: Int;
      if (level > 0 || inflow >= demand) {
        net = inflow - demand;
        for (const c of consumers) out.supplied[c.id] = 1000;
      } else {
        // Apagón: los conmutables se apagan; los demás se reparten la entrada.
        let fixed = 0;
        for (const c of consumers) {
          if (isSwitchable(c)) {
            out.switches.push({ element: c.id, reason: 'empty' });
            out.supplied[c.id] = 0;
          } else {
            fixed += perDay(c);
          }
        }
        if (inflow >= fixed) {
          net = inflow - fixed;
        } else {
          supply = fixed === 0 ? 1000 : fdiv(mul(inflow, 1000), fixed);
          net = 0;
        }
        demand = fixed;
        for (const c of consumers) if (!isSwitchable(c)) out.supplied[c.id] = supply;
      }
      out.stores.push({ element: id, resource: r, level, cap, inflow, demand, net, supply, switchableIn });
    }
  }
  return out;
}

/** Acumula `ticks` ticks de las tasas resueltas. Igual en bloque que tick a tick. */
export function accrueFlows(state: SimState, content: CompiledContent, flows: Flows, ticks: Int): void {
  const den = rateDen(state);
  for (const f of flows.stores) {
    const e = get(state.elements, f.element, 'almacén');
    const carry = e.carry ?? {};
    const t = mul(f.net, ticks) + (carry[f.resource] ?? 0);
    const before = levelOf(e, f.resource);
    const after = clamp(before + fdiv(t, den), 0, f.cap);
    setLevel(e, f.resource, after);
    carry[f.resource] = fmod(t, den);
    e.carry = carry;
    if (after < before && kindOf(content, e)?.cycles !== undefined) e.drawn = (e.drawn ?? 0) + before - after;
  }
}

/** Fase de tasas de un tick: apagados pendientes y un tick de acumulación. */
export function flowsStep(state: SimState, content: CompiledContent, events: Event[]): void {
  let flows = resolveFlows(state, content);
  for (let round = 0; flows.switches.length > 0; round++) {
    if (round > 64) throw new Error('flujos: los apagados no convergen');
    for (const s of flows.switches) {
      const e = get(state.elements, s.element, 'conmutable');
      if (e.on !== true) continue;
      e.on = false;
      events.push({ tick: state.tick, kind: 'switched', element: e.id, on: false, reason: s.reason });
    }
    flows = resolveFlows(state, content);
  }
  accrueFlows(state, content, flows, 1);
}

/** Acumulación en bloque de un tramo sin sucesos (lo usa `advance`). */
export function flowsJump(state: SimState, content: CompiledContent, ticks: Int): void {
  const flows = resolveFlows(state, content);
  if (flows.switches.length > 0) throw new Error('flujos: salto con apagados pendientes');
  accrueFlows(state, content, flows, ticks);
}

/**
 * Próximo tick ≥ el actual en el que cambian las tasas: ahora si hay apagados pendientes; el
 * próximo cambio de luz si hay paneles activos; el tick en que un almacén que baja llega a
 * cero; el tick en que se llena un almacén que llena un conmutable.
 */
export function nextFlowEvent(state: SimState, content: CompiledContent): Tick | null {
  const flows = resolveFlows(state, content);
  if (flows.switches.length > 0) return state.tick;
  const den = rateDen(state);
  let next: Tick | null = flows.usesLight ? nextLightChange(state, content, state.tick) : null;
  for (const f of flows.stores) {
    const carry = state.elements[f.element]?.carry?.[f.resource] ?? 0;
    let n: Int | null = null;
    if (f.net < 0 && f.level > 0) {
      // Primer n con nivel_n = nivel + fdiv(neto·n + resto, den) ≤ 0.
      n = fdiv(carry + mul(f.level - 1, den), -f.net) + 1;
    } else if (f.net > 0 && f.switchableIn && f.level < f.cap) {
      // Primer n con nivel_n ≥ capacidad.
      n = ceilDiv(mul(f.cap - f.level, den) - carry, f.net);
    }
    if (n === null) continue;
    const t = state.tick + max(1, n);
    next = next === null ? t : min(next, t);
  }
  return next;
}
