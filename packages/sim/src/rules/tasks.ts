/**
 * Tareas de un obrero sobre un elemento: sacar agua, recoger, talar, limpiar…
 * Diseño de la casa §4, §6 y §7 (C5: recoger es una tarea).
 *
 * La tabla de tareas dice dónde se hace cada una, cuánto dura, qué cuesta y qué deja al
 * terminar: algo en el almacén del propio elemento (agua en el pozo), algo en las existencias
 * del dueño (madera), lo que el elemento tenía almacenado (la cosecha madura de la huerta) o
 * el desgaste a cero (el panel limpio). Si el actor tiene el elemento de `tool` (el taller),
 * vale la variante de la herramienta.
 */

import { ceilDiv, fdiv, max, min, mul } from '../arith.js';
import { canEnter } from '../access.js';
import { workWindow } from '../calendar.js';
import { get, sortedKeys } from '../iter.js';
import type { CompiledContent, TaskKind, WorkSpec } from '../types/content.js';
import type { Event } from '../types/events.js';
import type { ActorId, Int, KindId, ResourceId, Tick } from '../types/ids.js';
import type { Order, OrderArgs, Reject } from '../types/orders.js';
import type { Element, Mobile, SimState, TaskJob } from '../types/state.js';
import { isRecord, isStr } from './args.js';
import { capacityOf, levelOf, setLevel } from './elements.js';
import { isPhysical, lacking, pay, put, room } from './inventory.js';
import { plannedArrival, startTrip } from './movement.js';
import {
  baseWork,
  effectiveWork,
  isFirstTime,
  markStarted,
  ownFreeMobile,
  performance,
  planWork,
} from './work.js';

function ownsKind(state: SimState, actor: ActorId, kind: KindId): boolean {
  for (const id of sortedKeys(state.elements)) {
    const e = state.elements[id];
    if (e?.owner === actor && e.kind === kind) return true;
  }
  return false;
}

/** La variante que vale para el actor: la de la herramienta si la tiene. */
export function taskVariant(state: SimState, actor: ActorId, t: TaskKind): WorkSpec {
  return t.tool !== undefined && ownsKind(state, actor, t.tool.kind) ? t.tool : t;
}

/** Plan de una tarea que se ordenara ahora. */
export interface TaskPlan {
  arrive: Tick;
  end: Tick;
  /** Ticks de trabajo con el rendimiento del obrero, sin la espera a la luz. */
  work: Int;
  /** Lo que deja al terminar, si es de jornada (fijado ahora). */
  gives?: Record<ResourceId, Int>;
}

/** Cuánto cabe de un recurso donde va lo que produce la tarea. */
function spaceFor(
  state: SimState,
  content: CompiledContent,
  actor: ActorId,
  t: TaskKind,
  e: Element,
  r: ResourceId,
): Int {
  return t.into === 'self' ? capacityOf(content, e, r) - levelOf(e, r) : room(state, content, actor, r);
}

/**
 * Jornada (P9): de la llegada (o del amanecer siguiente) al final de la luz de trabajo, o menos
 * si antes se llena donde va lo producido. Si lo que queda de luz hoy no da ni una unidad, la
 * jornada es la de mañana. undefined si la escena no tiene ventanas de luz (tarea normal).
 */
function jornada(
  state: SimState,
  content: CompiledContent,
  m: Mobile,
  actor: ActorId,
  t: TaskKind,
  variant: WorkSpec,
  e: Element,
  arrive: Tick,
): TaskPlan | null | undefined {
  if (content.scenes[state.scene.kind].workLight === undefined) return undefined;
  const gives = t.gives ?? {};
  const perf = performance(content, m);
  const unit = mul(variant.ticks, 1000);
  let span = workWindow(state, content, arrive);
  for (let attempt = 0; attempt < 2 && span !== null; attempt++) {
    let work = span.end - span.start;
    for (const r of sortedKeys(gives)) {
      const rate = mul(gives[r] ?? 0, perf);
      if (rate <= 0 || !isPhysical(content, r)) continue;
      const space = spaceFor(state, content, actor, t, e, r);
      work = min(work, max(1, ceilDiv(mul(space, unit), rate)));
    }
    const out: Record<ResourceId, Int> = {};
    let any = false;
    for (const r of sortedKeys(gives)) {
      let n = fdiv(mul(mul(gives[r] ?? 0, work), perf), unit);
      if (isPhysical(content, r)) n = min(n, spaceFor(state, content, actor, t, e, r));
      out[r] = n;
      if (n > 0) any = true;
    }
    if (any || attempt === 1) return { arrive, end: span.start + work, work, gives: out };
    span = workWindow(state, content, span.end);
  }
  return null;
}

/**
 * Plan de una tarea: llegada, fin y trabajo; en las de jornada, también lo que dejará. La
 * primera vez de una tarea con variante corta sigue siendo corta y fija. null si nunca habría luz.
 */
export function planTask(
  state: SimState,
  content: CompiledContent,
  m: Mobile,
  actor: ActorId,
  taskId: KindId,
  t: TaskKind,
  e: Element,
): TaskPlan | null {
  const variant = taskVariant(state, actor, t);
  const key = `task:${taskId}`;
  if (t.jornada === true && !isFirstTime(state, actor, key, variant)) {
    const arrive = plannedArrival(state, content, m, e.pos, e.id);
    const plan = jornada(state, content, m, actor, t, variant, e, arrive);
    if (plan !== undefined) return plan;
  }
  const work = baseWork(state, actor, key, variant);
  const plan = planWork(state, content, m, e.pos, e.id, work);
  return plan === null ? null : { arrive: plan.arrive, end: plan.end, work: effectiveWork(content, m, work) };
}

export function validateJob(
  state: SimState,
  content: CompiledContent,
  actor: ActorId,
  args: unknown,
): Reject | null {
  if (!isRecord(args) || !isStr(args.mobile) || !isStr(args.element) || !isStr(args.task)) return 'bad_args';
  const m = ownFreeMobile(state, actor, args.mobile);
  if (typeof m === 'string') return m;
  const t = content.tasks?.[args.task];
  if (t === undefined) return 'unknown_task';
  const e = state.elements[args.element];
  if (e === undefined) return 'unknown_element';
  const sector = state.map.sectors[e.sector];
  if (sector === undefined) return 'off_map';
  if (!canEnter(state, actor, sector)) return 'no_access';
  if (e.owner !== actor) return 'not_owner';
  if (!t.at.includes(e.kind)) return 'wrong_element';
  if (t.collect !== undefined) {
    if (levelOf(e, t.collect) === 0) return 'nothing_to_do';
    if (room(state, content, actor, t.collect) === 0) return `full:${t.collect}`;
  }
  if (t.gives !== undefined) {
    for (const r of sortedKeys(t.gives)) {
      const free =
        t.into === 'self' ? capacityOf(content, e, r) - levelOf(e, r) : room(state, content, actor, r);
      if (free <= 0) return `full:${r}`;
    }
  }
  if (t.clean === true && (e.wear ?? 0) === 0) return 'nothing_to_do';
  const variant = taskVariant(state, actor, t);
  const lack = lacking(state, content, actor, variant.cost);
  if (lack !== null) return `insufficient:${lack}`;
  if (planTask(state, content, m, actor, args.task, t, e) === null) return 'dark';
  return null;
}

export function startJob(state: SimState, content: CompiledContent, order: Order, events: Event[]): void {
  const args = order.args as OrderArgs['job'];
  const m = get(state.mobiles, args.mobile, 'móvil');
  const t = get(content.tasks ?? {}, args.task, 'tarea');
  const e = get(state.elements, args.element, 'elemento');
  const variant = taskVariant(state, order.actor, t);
  const workKey = `task:${args.task}`;
  const plan = planTask(state, content, m, order.actor, args.task, t, e);
  if (plan === null) throw new Error('tarea: sin luz (debió rechazarse)');
  pay(state, content, order.actor, variant.cost, events, workKey);
  markStarted(state, order.actor, workKey, variant);
  const trip = startTrip(state, content, m, e.pos, e.id, order.seq);
  const job: TaskJob = {
    kind: 'task',
    task: args.task,
    element: e.id,
    startTick: plan.arrive,
    endTick: plan.end,
  };
  if (plan.gives !== undefined) job.gives = plan.gives;
  m.job = job;
  events.push({ tick: state.tick, kind: 'trip_started', mobile: m.id, arriveTick: trip.arriveTick });
}

export function completeTask(
  state: SimState,
  content: CompiledContent,
  m: Mobile,
  job: TaskJob,
  events: Event[],
): void {
  const t = content.tasks?.[job.task];
  const e = state.elements[job.element];
  if (t === undefined || e === undefined) return;
  const reason = `task:${job.task}`;
  if (t.collect !== undefined) {
    const r = t.collect;
    const have = levelOf(e, r);
    const stored = put(state, content, m.owner, r, have, events, reason);
    if (stored > 0) {
      setLevel(e, r, have - stored);
      events.push({ tick: state.tick, kind: 'store', element: e.id, resource: r, delta: -stored, reason });
    }
  }
  // Lo de una tarea de jornada se fijó al dar la orden; lo de las demás es lo de la tabla.
  const gives = job.gives ?? t.gives;
  if (gives !== undefined) {
    for (const r of sortedKeys(gives)) {
      const amount = gives[r] ?? 0;
      if (t.into === 'self') {
        const have = levelOf(e, r);
        const added = min(capacityOf(content, e, r) - have, amount);
        if (added > 0) {
          setLevel(e, r, have + added);
          events.push({ tick: state.tick, kind: 'store', element: e.id, resource: r, delta: added, reason });
        }
      } else {
        put(state, content, m.owner, r, amount, events, reason);
      }
    }
  }
  if (t.clean === true) {
    e.wear = 0;
    events.push({ tick: state.tick, kind: 'cleaned', element: e.id });
  }
}
