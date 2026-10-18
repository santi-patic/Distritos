/**
 * Presupuesto de una orden: lo que cobraría si se diera ahora y cuándo llegaría y terminaría
 * el obrero. Lectura pura para la interfaz, que lo enseña antes de confirmar. Usa las mismas
 * funciones que la ejecución (coste, variante, primera vez, rendimiento sin comer, ventanas de
 * luz), de modo que lo que se promete es lo que pasa si la orden entra en este mismo tick.
 */

import { center, parse } from '../hex.js';
import { nextWorkStart } from '../calendar.js';
import type { CompiledContent } from '../types/content.js';
import type { Int, ResourceId, Tick } from '../types/ids.js';
import type { OrderArgs, OrderIntent } from '../types/orders.js';
import type { Mobile, SimState } from '../types/state.js';
import { deliveryQuote } from './board.js';
import { planRoute, stopWork } from './errands.js';
import { linkSpec } from './links.js';
import { plannedArrival } from './movement.js';
import { validate } from './orders.js';
import { taskVariant } from './tasks.js';
import { baseWork, effectiveWork, planWork } from './work.js';

export interface Quote {
  /** Lo que se cobra al dar la orden (en una entrega, lo que se saca para llevar). */
  cost: Record<ResourceId, Int>;
  /** Ticks de trabajo con el rendimiento del obrero, sin contar la espera a la luz. */
  work: Int;
  /** Llegada del obrero (o del contratado); null si la orden no lleva a nadie. */
  arrive: Tick | null;
  /** Fin de la tarea (en un viaje, la llegada); null si no hay tarea. */
  end: Tick | null;
  /** Entregas: unidades del recurso o ticks de obra. */
  amount?: Int;
  /** Entregas: lo que se cobra al entregar. */
  pay?: Int;
}

const NONE: Quote = { cost: {}, work: 0, arrive: null, end: null };

function mobileOf(state: SimState, id: string): Mobile {
  const m = state.mobiles[id];
  if (m === undefined) throw new Error(`presupuesto: el móvil ${id} no existe (debió rechazarse)`);
  return m;
}

/** Presupuesto de una intención válida en el tick actual, o null si la orden se rechazaría. */
export function quote(state: SimState, intent: OrderIntent, content: CompiledContent): Quote | null {
  if (validate(state, intent, content) !== null) return null;
  const actor = intent.actor;
  switch (intent.kind) {
    case 'move': {
      const args = intent.args as OrderArgs['move'];
      const e = state.elements[args.to];
      if (e === undefined) return null;
      const arrive = plannedArrival(state, content, mobileOf(state, args.mobile), e.pos, e.id);
      return { cost: {}, work: 0, arrive, end: arrive };
    }
    case 'reveal': {
      const args = intent.args as OrderArgs['reveal'];
      const m = mobileOf(state, args.mobile);
      const spec = content.actions.reveal;
      const work = baseWork(state, actor, 'reveal', spec);
      const target = center(parse(args.hex), { hexW: state.scene.hexW, hexH: state.scene.hexH });
      const plan = planWork(state, content, m, target, null, work);
      if (plan === null) return null;
      return {
        cost: { [spec.resource]: spec.cost },
        work: effectiveWork(content, m, work),
        arrive: plan.arrive,
        end: plan.end,
      };
    }
    case 'build': {
      const args = intent.args as OrderArgs['build'];
      const m = mobileOf(state, args.mobile);
      const b = content.builds?.[args.kind];
      if (b === undefined) return null;
      const work = baseWork(state, actor, `build:${args.kind}`, b);
      const plan = planWork(state, content, m, args.pos, null, work);
      if (plan === null) return null;
      return {
        cost: { ...b.cost },
        work: effectiveWork(content, m, work),
        arrive: plan.arrive,
        end: plan.end,
      };
    }
    case 'link': {
      const args = intent.args as OrderArgs['link'];
      const m = mobileOf(state, args.mobile);
      const lk = content.links?.[args.kind];
      const a = state.elements[args.from];
      const b = state.elements[args.to];
      if (lk === undefined || a === undefined || b === undefined) return null;
      const spec = linkSpec(lk, a, b);
      const work = baseWork(state, actor, `link:${args.kind}`, spec.work);
      const plan = planWork(state, content, m, a.pos, a.id, work);
      if (plan === null) return null;
      return { cost: spec.cost, work: effectiveWork(content, m, work), arrive: plan.arrive, end: plan.end };
    }
    case 'job': {
      const args = intent.args as OrderArgs['job'];
      const m = mobileOf(state, args.mobile);
      const t = content.tasks?.[args.task];
      const e = state.elements[args.element];
      if (t === undefined || e === undefined) return null;
      const variant = taskVariant(state, actor, t);
      const work = baseWork(state, actor, `task:${args.task}`, variant);
      const plan = planWork(state, content, m, e.pos, e.id, work);
      if (plan === null) return null;
      return {
        cost: { ...(variant.cost ?? {}) },
        work: effectiveWork(content, m, work),
        arrive: plan.arrive,
        end: plan.end,
      };
    }
    case 'hire': {
      const args = intent.args as OrderArgs['hire'];
      const h = content.hires?.[args.kind];
      const arrive = nextWorkStart(state, content, state.tick);
      if (h === undefined || arrive === null) return null;
      return { cost: { ...h.cost }, work: 0, arrive, end: arrive };
    }
    case 'deliver': {
      const args = intent.args as OrderArgs['deliver'];
      const m = mobileOf(state, args.mobile);
      const e = state.district.board?.encargo;
      const dest = e === undefined || e === null ? undefined : state.elements[e.at];
      if (e === undefined || e === null || dest === undefined) return null;
      const { amount, pay } = deliveryQuote(state, content, actor, e);
      const plan = planWork(state, content, m, dest.pos, dest.id, e.work ? amount : 0);
      if (plan === null) return null;
      return {
        cost: e.work ? {} : { [e.resource]: amount },
        work: e.work ? effectiveWork(content, m, amount) : 0,
        arrive: plan.arrive,
        end: plan.end,
        amount,
        pay,
      };
    }
    case 'route': {
      const args = intent.args as OrderArgs['route'];
      const m = mobileOf(state, args.mobile);
      const plan = planRoute(state, content, m, actor, args.stops);
      const first = plan?.[0];
      const last = plan?.[plan.length - 1];
      const each = stopWork(state, content, m, actor);
      if (plan === null || first === undefined || last === undefined || each === null) return null;
      // Trabajo con luz de todas las paradas; la espera de noche no cuenta (la dice `end`).
      return { cost: {}, work: each * plan.length, arrive: first.arrive, end: last.leave };
    }
    case 'toggle':
    case 'cancel':
    case 'unload':
    case 'skip':
    case 'content':
    case 'credit':
    case 'debit':
      return NONE;
  }
}
