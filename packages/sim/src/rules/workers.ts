/**
 * Obreros: contratar, camas y comida. Diseño de la casa §4, §5 y §7.
 *
 * Contratar exige cama libre (la casa y el cobertizo dan camas), cuesta lo de la tabla al
 * dar la orden y el obrero llega al amanecer siguiente. Cada día, en el paso diario, cada
 * obrero come de las existencias de su dueño; si no hay, no come y rinde menos en las tareas
 * que se le manden mientras tanto (decisión del autor, 17 oct 2026: trabajan a la mitad, no
 * paran ni mueren). Un obrero sin comer come en cuanto vuelve a haber comida.
 */

import { max } from '../arith.js';
import { nextWorkStart } from '../calendar.js';
import { get, sortedKeys } from '../iter.js';
import { nextInt } from '../rng.js';
import type { CompiledContent } from '../types/content.js';
import type { Event } from '../types/events.js';
import type { ActorId, Int, Tick } from '../types/ids.js';
import type { Order, OrderArgs, Reject } from '../types/orders.js';
import type { Element, Mobile, SimState } from '../types/state.js';
import { isRecord, isStr } from './args.js';
import { available, lacking, pay, take } from './inventory.js';

export function bedsOf(state: SimState, content: CompiledContent, actor: ActorId): Int {
  let beds = 0;
  for (const id of sortedKeys(state.elements)) {
    const e = state.elements[id];
    if (e?.owner === actor) beds += content.elements[e.kind]?.beds ?? 0;
  }
  return beds;
}

/** Obreros del actor, contando los que vienen de camino. */
export function workersOf(state: SimState, actor: ActorId): Int {
  let n = state.actors[actor]?.hires?.length ?? 0;
  for (const id of sortedKeys(state.mobiles)) if (state.mobiles[id]?.owner === actor) n += 1;
  return n;
}

export function validateHire(
  state: SimState,
  content: CompiledContent,
  actor: ActorId,
  args: unknown,
): Reject | null {
  if (!isRecord(args) || !isStr(args.kind)) return 'bad_args';
  const h = content.hires?.[args.kind];
  if (h === undefined || content.mobiles[args.kind] === undefined) return 'not_hireable';
  if (workersOf(state, actor) >= bedsOf(state, content, actor)) return 'no_bed';
  const lack = lacking(state, content, actor, h.cost);
  if (lack !== null) return `insufficient:${lack}`;
  if (nextWorkStart(state, content, state.tick) === null) return 'dark';
  return null;
}

export function startHire(state: SimState, content: CompiledContent, order: Order, events: Event[]): void {
  const args = order.args as OrderArgs['hire'];
  const h = get(content.hires ?? {}, args.kind, 'contratación');
  const tick = nextWorkStart(state, content, state.tick);
  if (tick === null) throw new Error('contratar: sin amanecer (debió rechazarse)');
  pay(state, content, order.actor, h.cost, events, 'hire');
  const actor = get(state.actors, order.actor, 'actor');
  actor.hires = [...(actor.hires ?? []), { kind: args.kind, tick, seq: order.seq }];
}

/** La casa del actor: su primer elemento con camas. */
function homeOf(state: SimState, content: CompiledContent, actor: ActorId): Element | null {
  let any: Element | null = null;
  for (const id of sortedKeys(state.elements)) {
    const e = state.elements[id];
    if (e?.owner !== actor) continue;
    if ((content.elements[e.kind]?.beds ?? 0) > 0) return e;
    any ??= e;
  }
  return any;
}

/** Nombre de la tabla que no lleve ya otro obrero del actor (si quedan), elegido con el generador. */
function pickName(state: SimState, actor: ActorId, names: readonly string[]): string | undefined {
  if (names.length === 0) return undefined;
  const used: Record<string, true> = {};
  for (const id of sortedKeys(state.mobiles)) {
    const m = state.mobiles[id];
    if (m?.owner === actor && m.name !== undefined) used[m.name] = true;
  }
  const free = names.filter((n) => used[n] !== true);
  const pool = free.length > 0 ? free : names;
  const [i, rng] = nextInt(state.rng, pool.length);
  state.rng = rng;
  return pool[i];
}

/** Llegan los contratados cuyo tick ha llegado, por actor y en orden de contratación. */
export function processHires(state: SimState, content: CompiledContent, events: Event[]): void {
  for (const actorId of sortedKeys(state.actors)) {
    const actor = state.actors[actorId];
    if (actor?.hires === undefined) continue;
    const due = actor.hires.filter((h) => h.tick <= state.tick);
    if (due.length === 0) continue;
    const rest = actor.hires.filter((h) => h.tick > state.tick);
    if (rest.length > 0) actor.hires = rest;
    else delete actor.hires;
    const home = homeOf(state, content, actorId);
    if (home === null) continue;
    for (const h of due) {
      const kind = get(content.mobiles, h.kind, 'móvil');
      state.counters.mobile += 1;
      const m: Mobile = {
        id: `m${state.counters.mobile}`,
        kind: h.kind,
        owner: actorId,
        stats: { ...kind.stats },
        where: { kind: 'at', pos: home.pos, element: home.id },
        job: null,
      };
      const name = pickName(state, actorId, kind.names);
      if (name !== undefined) m.name = name;
      state.mobiles[m.id] = m;
      events.push({ tick: state.tick, kind: 'hired', mobile: m.id });
    }
  }
}

/** Próximo tick con una contratación que llega, o null. */
export function nextHire(state: SimState): Tick | null {
  let next: Tick | null = null;
  for (const id of sortedKeys(state.actors)) {
    for (const h of state.actors[id]?.hires ?? []) {
      const t = max(state.tick, h.tick);
      if (next === null || t < next) next = t;
    }
  }
  return next;
}

function eat(state: SimState, content: CompiledContent, m: Mobile, events: Event[]): boolean {
  const eats = content.mobiles[m.kind]?.eats;
  if (eats === undefined) return true;
  if (available(state, content, m.owner, eats.resource) < eats.perDay) return false;
  take(state, content, m.owner, eats.resource, eats.perDay, events, 'meal');
  return true;
}

/** Comida del día: cada obrero come o se queda sin comer. */
export function meals(state: SimState, content: CompiledContent, events: Event[]): void {
  for (const id of sortedKeys(state.mobiles)) {
    const m = state.mobiles[id];
    if (m === undefined || content.mobiles[m.kind]?.eats === undefined) continue;
    if (eat(state, content, m, events)) {
      if (m.hungry === true) {
        delete m.hungry;
        events.push({ tick: state.tick, kind: 'fed', mobile: m.id });
      }
    } else if (m.hungry !== true) {
      m.hungry = true;
      events.push({ tick: state.tick, kind: 'hungry', mobile: m.id });
    }
  }
}

/** Los que no han comido comen en cuanto hay comida. */
export function feedHungry(state: SimState, content: CompiledContent, events: Event[]): void {
  for (const id of sortedKeys(state.mobiles)) {
    const m = state.mobiles[id];
    if (m?.hungry !== true) continue;
    if (!eat(state, content, m, events)) continue;
    delete m.hungry;
    events.push({ tick: state.tick, kind: 'fed', mobile: m.id });
  }
}
