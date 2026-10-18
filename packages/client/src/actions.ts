/**
 * Lo que la hoja de abajo enseña para lo que se ha tocado: un título, unas líneas de estado y
 * las órdenes posibles, cada una con su presupuesto (lo que cuesta, cuánto dura y cuándo
 * termina) o con el motivo por el que ahora no se puede. Todo sale del sim (`validate` y
 * `quote`): aquí no se decide nada, solo se elige qué preguntar y cómo decirlo.
 */

import {
  advance,
  available,
  bedsOf,
  capacityOf,
  carriedBy,
  carryOf,
  errandsAt,
  levelOf,
  linkSpec,
  placeIds,
  planRoute,
  positionOf,
  quote,
  resolveFlows,
  taskVariant,
  validate,
  workable,
  workersOf,
  type CompiledContent,
  type Element,
  type Errand,
  type Event,
  type Flows,
  type HexKey,
  type Job,
  type Mobile,
  type Order,
  type OrderIntent,
  type Quote,
  type Sector,
  type SimState,
  type Vec,
} from '@distritos/sim';
import { amount, duration, has, list, num, qty, rate, rejectText, t, when } from './i18n.js';

export type Selection =
  | { kind: 'element'; id: string }
  | { kind: 'sector'; hex: HexKey; pos: Vec }
  | { kind: 'mobile'; id: string }
  | { kind: 'link'; linkKind: string; from: string; to: string | null }
  /** Ruta de recados que se está preparando: el obrero y las paradas tocadas, en orden. */
  | { kind: 'route'; mobile: string; stops: string[] };

export interface ActionView {
  /** Estable, para las pruebas y para la etiqueta `data-action`. */
  id: string;
  label: string;
  /** Presupuesto en una línea, o el motivo por el que no se puede. */
  meta: string;
  enabled: boolean;
  intent?: OrderIntent;
  /** En vez de una orden, pasar a otra selección (elegir el otro extremo de un nexo). */
  next?: Selection;
  /** Volver a la selección vacía (cancelar). */
  close?: boolean;
}

export interface SheetView {
  title: string;
  /** Líneas de estado, ya traducidas. */
  lines: string[];
  actions: ActionView[];
  /** Obrero que haría las órdenes, si alguna lo necesita. */
  worker: Mobile | null;
  /** Extremos posibles de un nexo, para resaltarlos en el mapa. */
  candidates: string[];
}

export interface Ctx {
  state: SimState;
  content: CompiledContent;
  actor: string;
  /** Época en ms del tick 0. */
  anchorMs: number;
  nowMs: number;
  /** Registro de órdenes: lo sellado en el tick actual aún no está aplicado al estado. */
  log?: readonly Order[];
}

function msOf(ctx: Ctx, tick: number): number {
  return ctx.anchorMs + tick * ctx.state.scene.tickMs;
}

function cap(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

function lower(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toLocaleLowerCase() + text.slice(1);
}

function elementName(kind: string): string {
  return has(`el.${kind}`) ? t(`el.${kind}`) : kind;
}

const DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];

/**
 * Para distinguir sitios del mismo tipo (las casas vecinas): hacia dónde cae cada uno respecto
 * al centro de los de su tipo («del norte»). Si dos caen hacia el mismo lado, un número.
 */
function siteSuffix(ctx: Ctx, e: Element): string | null {
  if (ctx.content.places?.[e.kind] === undefined) return null;
  const same = Object.keys(ctx.state.elements)
    .sort()
    .map((id) => ctx.state.elements[id])
    .filter((x): x is Element => x?.kind === e.kind);
  if (same.length < 2) return null;
  const cx = same.reduce((a, x) => a + x.pos.x, 0) / same.length;
  const cy = same.reduce((a, x) => a + x.pos.y, 0) / same.length;
  const dirOf = (x: Element): string => {
    // La y crece hacia abajo (el sur), como en la pantalla.
    const octant = Math.round(Math.atan2(x.pos.y - cy, x.pos.x - cx) / (Math.PI / 4));
    return DIRS[((octant % 8) + 8) % 8] ?? 'n';
  };
  const dirs = same.map(dirOf);
  if (new Set(dirs).size === dirs.length) return t(`dir.${dirOf(e)}`);
  return String(same.findIndex((x) => x.id === e.id) + 1);
}

/** Nombre de un elemento concreto: el de su tipo y, si hace falta, hacia dónde cae. */
export function elementLabel(ctx: Ctx, e: Element): string {
  const suffix = siteSuffix(ctx, e);
  return suffix === null ? elementName(e.kind) : `${elementName(e.kind)} ${suffix}`;
}

/** «a la cocina común», «a la casa vecina del norte». */
function destText(ctx: Ctx, e: Element): string {
  const base = has(`dest.${e.kind}`) ? t(`dest.${e.kind}`) : lower(elementName(e.kind));
  const suffix = siteSuffix(ctx, e);
  return suffix === null ? base : `${base} ${suffix}`;
}

/** «en la cocina común», «en la casa vecina del norte». */
function inText(ctx: Ctx, e: Element): string {
  const base = has(`in.${e.kind}`) ? t(`in.${e.kind}`) : lower(elementName(e.kind));
  const suffix = siteSuffix(ctx, e);
  return suffix === null ? base : `${base} ${suffix}`;
}

/** Si un elemento es un sitio de recados. */
export function isPlace(ctx: Ctx, id: string): boolean {
  const e = ctx.state.elements[id];
  return e !== undefined && ctx.content.places?.[e.kind] !== undefined;
}

function errandText(kind: string, n: number): string {
  const key = `errand.${kind}`;
  if (!has(key)) return `${n} ${kind}`;
  return t(n === 1 ? key : `${key}.many`, { n });
}

/** Recados agrupados por destino y tipo: «2 panes a la casa vecina del norte». */
function errandLines(ctx: Ctx, errands: readonly Errand[]): string[] {
  const groups: { to: string; kind: string; n: number }[] = [];
  for (const r of errands) {
    const g = groups.find((x) => x.to === r.to && x.kind === r.kind);
    if (g === undefined) groups.push({ to: r.to, kind: r.kind, n: 1 });
    else g.n += 1;
  }
  groups.sort((a, b) => (a.to === b.to ? a.kind.localeCompare(b.kind) : a.to.localeCompare(b.to)));
  return groups.map((g) => {
    const dest = ctx.state.elements[g.to];
    return dest === undefined ? errandText(g.kind, g.n) : `${errandText(g.kind, g.n)} ${destText(ctx, dest)}`;
  });
}

function bultos(errands: readonly Errand[]): number {
  return errands.reduce((n, r) => n + r.size, 0);
}

/** Destinos de los recados que hay en un sitio (para dibujarlos al tocarlo). */
export function errandDestinations(ctx: Ctx, place: string): string[] {
  const out: string[] = [];
  for (const r of errandsAt(ctx.state, place)) {
    if (r.holder !== undefined && r.holder !== ctx.actor) continue;
    if (!out.includes(r.to)) out.push(r.to);
  }
  return out.sort();
}

function costText(cost: Record<string, number>): string {
  const parts = Object.keys(cost)
    .sort()
    .filter((r) => (cost[r] ?? 0) > 0)
    .map((r) => amount(r, cost[r] ?? 0));
  return parts.length === 0 ? t('info.free') : list(parts);
}

/** Obreros propios, por id. */
export function ownMobiles(ctx: Ctx): Mobile[] {
  return Object.keys(ctx.state.mobiles)
    .sort()
    .map((id) => ctx.state.mobiles[id])
    .filter((m): m is Mobile => m?.owner === ctx.actor);
}

/**
 * El obrero que haría una orden: el elegido si está libre; si no, el libre más cercano al
 * sitio; si no hay ninguno libre, el elegido (y las órdenes saldrán «ocupada»).
 */
export function chooseWorker(ctx: Ctx, preferred: string | null, near: Vec | null): Mobile | null {
  const mine = ownMobiles(ctx);
  const pref = mine.find((m) => m.id === preferred);
  if (pref?.job === null) return pref;
  let best: Mobile | null = null;
  let bestD = Infinity;
  for (const m of mine) {
    if (m.job !== null) continue;
    const p = positionOf(m, ctx.state.tick);
    const d = near === null ? 0 : Math.hypot(p.x - near.x, p.y - near.y);
    if (d < bestD) {
      best = m;
      bestD = d;
    }
  }
  return best ?? pref ?? mine[0] ?? null;
}

function quoteMeta(ctx: Ctx, intent: OrderIntent, q: Quote): string {
  const parts: string[] = [];
  if (intent.kind === 'deliver') {
    const res = Object.keys(q.cost)[0];
    if (res === undefined) parts.push(t('meta.work', { d: duration(q.amount ?? 0) }));
    else parts.push(t('meta.carry', { what: amount(res, q.cost[res] ?? 0) }));
    if (q.pay !== undefined) parts.push(t('meta.pay', { pay: amount('eagles', q.pay) }));
  } else if (Object.keys(q.cost).length > 0) {
    parts.push(costText(q.cost));
  }
  if ((intent.kind === 'hire' || intent.kind === 'move') && q.arrive !== null) {
    parts.push(t('meta.arrives', { when: when(msOf(ctx, q.arrive), ctx.nowMs) }));
  } else if (q.end !== null) {
    if (q.work > 0 && intent.kind !== 'deliver') parts.push(duration(q.work));
    parts.push(t('meta.ends', { when: when(msOf(ctx, q.end), ctx.nowMs) }));
  }
  return parts.join(', ');
}

/** Lo que costaría una orden según las tablas, para enseñarlo aunque ahora no se pueda pagar. */
function listedCost(ctx: Ctx, intent: OrderIntent): Record<string, number> | null {
  const { content, state } = ctx;
  switch (intent.kind) {
    case 'reveal': {
      const r = content.actions.reveal;
      return { [r.resource]: r.cost };
    }
    case 'build':
      return content.builds?.[(intent.args as { kind: string }).kind]?.cost ?? null;
    case 'hire':
      return content.hires?.[(intent.args as { kind: string }).kind]?.cost ?? null;
    case 'job': {
      const tk = content.tasks?.[(intent.args as { task: string }).task];
      return tk === undefined ? null : (taskVariant(state, intent.actor, tk).cost ?? null);
    }
    case 'link': {
      const a = intent.args as { kind: string; from: string; to: string };
      const lk = content.links?.[a.kind];
      const from = state.elements[a.from];
      const to = state.elements[a.to];
      return lk === undefined || from === undefined || to === undefined ? null : linkSpec(lk, from, to).cost;
    }
    default:
      return null;
  }
}

function orderAction(ctx: Ctx, id: string, label: string, intent: OrderIntent): ActionView {
  const q = quoteOf(ctx, intent);
  if (q.quote === null) {
    const reason = rejectText(q.reason ?? 'bad_args');
    const cost = q.reason?.startsWith('insufficient:') === true ? listedCost(ctx, intent) : null;
    const meta = cost !== null && Object.keys(cost).length > 0 ? `${cap(costText(cost))}. ${reason}` : reason;
    return { id, label, meta, enabled: false, intent };
  }
  return { id, label, meta: quoteMeta(ctx, intent, q.quote), enabled: true, intent };
}

function validateIntent(ctx: Ctx, intent: OrderIntent): string | null {
  return validate(ctx.state, intent, ctx.content);
}

function quoteOf(ctx: Ctx, intent: OrderIntent): { quote: Quote | null; reason: string | null } {
  const reason = validateIntent(ctx, intent);
  if (reason !== null) return { quote: null, reason };
  return { quote: quote(ctx.state, intent, ctx.content), reason: null };
}

let simulated: { key: string; events: Event[] } | null = null;

/**
 * Lo que pasaría si la orden se diera ahora: una copia del estado avanzada con lo sellado y con
 * la orden, hasta `until`. Es el mismo sim, así que es exacto mientras no se den otras órdenes.
 */
function simulate(ctx: Ctx, intent: OrderIntent, until: number): Event[] {
  const key = `${ctx.state.tick}|${until}|${ctx.content.hash}|${JSON.stringify(intent)}|${ctx.log?.length ?? 0}`;
  if (simulated?.key === key) return simulated.events;
  const copy = structuredClone(ctx.state);
  const log = ctx.log ?? [];
  const seq = log.reduce((m, o) => Math.max(m, o.seq), 0) + 1;
  const order: Order = { seq, tick: copy.tick, actor: intent.actor, kind: intent.kind, args: intent.args };
  const events = advance(copy, [...log.filter((o) => o.tick >= copy.tick), order], until, ctx.content);
  simulated = { key, events };
  return events;
}

function storeLines(ctx: Ctx, e: Element): string[] {
  const kind = ctx.content.elements[e.kind];
  const lines: string[] = [];
  for (const r of Object.keys(kind?.stores ?? {}).sort()) {
    const c = capacityOf(ctx.content, e, r);
    // La unidad va al final solo si no la dice ya el nombre del recurso (kWh, L, raciones).
    const total = r === 'madera' || r === 'piedra' ? qty(r, c) : amount(r, c);
    lines.push(`${cap(t(`res.${r}`))}: ${t('info.store', { have: qty(r, levelOf(e, r)), cap: total })}`);
  }
  return lines;
}

function flowLines(ctx: Ctx, e: Element, flows: Flows): string[] {
  const kind = ctx.content.elements[e.kind];
  const lines: string[] = [];
  if (kind?.switchable === true) lines.push(t(e.on === true ? 'info.running' : 'info.stopped'));
  const p = kind?.produce;
  if (p !== undefined && (kind?.switchable !== true || e.on === true)) {
    const produced = flows.produced[e.id] ?? 0;
    lines.push(t('info.produces', { rate: rate(p.resource, produced) }));
  }
  const c = kind?.consume;
  if (c !== undefined && (kind?.switchable !== true || e.on === true)) {
    const supplied = flows.supplied[e.id];
    if (supplied === undefined || supplied === 0)
      lines.push(t('info.unsupplied', { resource: t(`res.${c.resource}`) }));
    else lines.push(t('info.consumes', { rate: rate(c.resource, c.perDay) }));
  }
  if (kind?.soil !== undefined) lines.push(t('info.dirt', { pct: Math.round((e.wear ?? 0) / 10) }));
  if (kind?.cycles !== undefined) {
    lines.push(t('info.capacity', { pct: num((1000 - (e.wear ?? 0)) / 10, 1, 0) }));
  }
  return lines;
}

function canCarry(ctx: Ctx, e: Element, resource: string): boolean {
  const k = ctx.content.elements[e.kind];
  if (k === undefined) return false;
  return (
    k.stores?.[resource] !== undefined ||
    (k.produce?.resource === resource && k.produce.to === 'link') ||
    k.consume?.resource === resource
  );
}

function elementSheet(ctx: Ctx, e: Element, worker: Mobile | null): SheetView {
  const { state, content, actor } = ctx;
  const kind = content.elements[e.kind];
  const flows = resolveFlows(state, content);
  const mine = e.owner === actor;
  const lines = [...storeLines(ctx, e), ...flowLines(ctx, e, flows)];
  if ((kind?.beds ?? 0) > 0 && mine) {
    lines.push(t('info.beds', { used: workersOf(state, actor), beds: bedsOf(state, content, actor) }));
  }
  if (e.builtBy?.includes(actor) === true) lines.push(t('info.builtByYou'));
  if (e.owner === undefined)
    lines.push(has(`info.about.${e.kind}`) ? t(`info.about.${e.kind}`) : t('info.common'));
  const encargo = state.district.board?.encargo ?? null;
  const actions: ActionView[] = [];
  const w = worker?.id ?? '';

  if (encargo !== null && encargo.at === e.id) {
    lines.push(
      t('info.encargo', {
        what: encargo.work ? duration(encargo.amount) : amount(encargo.resource, encargo.amount),
        done: encargo.work ? duration(encargo.delivered) : qty(encargo.resource, encargo.delivered),
      }),
    );
    actions.push(
      orderAction(
        ctx,
        'deliver',
        encargo.work ? t('act.deliver.work') : t('act.deliver', { what: t(`res.${encargo.resource}`) }),
        {
          actor,
          kind: 'deliver',
          args: { mobile: w, encargo: encargo.id },
        },
      ),
    );
  }

  if (mine) {
    for (const task of Object.keys(content.tasks ?? {}).sort()) {
      const tk = content.tasks?.[task];
      if (!tk?.at.includes(e.kind)) continue;
      actions.push(
        orderAction(ctx, `task:${task}`, t(`act.task.${task}`), {
          actor,
          kind: 'job',
          args: { mobile: w, element: e.id, task },
        }),
      );
    }
    if (kind?.switchable === true) {
      const on = e.on !== true;
      actions.push(
        orderAction(ctx, on ? 'on' : 'off', t(on ? 'act.on' : 'act.off'), {
          actor,
          kind: 'toggle',
          args: { element: e.id, on },
        }),
      );
    }
    if ((kind?.beds ?? 0) > 0) {
      for (const h of Object.keys(content.hires ?? {}).sort()) {
        actions.push(
          orderAction(ctx, `hire:${h}`, t(`act.hire.${h}`), { actor, kind: 'hire', args: { kind: h } }),
        );
      }
    }
    for (const lk of Object.keys(content.links ?? {}).sort()) {
      const spec = content.links?.[lk];
      if (spec === undefined) continue;
      if (spec.carries !== undefined && !canCarry(ctx, e, spec.carries)) continue;
      const some = linkCandidates(ctx, e.id, lk, w).length > 0;
      actions.push({
        id: `link:${lk}`,
        label: t(`act.link.${lk}`),
        meta: t(some ? 'meta.pickOther' : 'act.link.none'),
        enabled: some,
        next: { kind: 'link', linkKind: lk, from: e.id, to: null },
      });
    }
  }
  const place = content.places?.[e.kind];
  const table = content.errands;
  if (place !== undefined && table !== undefined && state.district.errands !== undefined) {
    const here = errandsAt(state, e.id);
    const open = here.filter((r) => r.holder === undefined);
    const kept = here.filter((r) => r.holder === actor);
    const pay = [...open, ...kept].reduce((n, r) => n + r.pay, 0);
    const load = bultos(here);
    lines.push(
      load === 0
        ? t('info.errandsNone')
        : t('info.errands', { n: load, cap: place.capacity, pay: amount(table.currency, pay) }),
    );
    lines.push(...errandLines(ctx, open).map(cap));
    for (const l of errandLines(ctx, kept)) lines.push(t('info.errandsYours', { what: l }));
    actions.push({
      id: 'route',
      label: t('act.route'),
      meta: t('meta.pickStops'),
      enabled: worker !== null,
      next: { kind: 'route', mobile: w, stops: [e.id] },
    });
  }
  const here = worker?.where.kind === 'at' && worker.where.element === e.id;
  if (!here && (kind?.category ?? 'fixed') !== 'site') {
    actions.push(
      orderAction(ctx, 'move', t('act.move'), { actor, kind: 'move', args: { mobile: w, to: e.id } }),
    );
  }
  return { title: elementLabel(ctx, e), lines, actions, worker, candidates: [] };
}

function sectorSheet(ctx: Ctx, hex: HexKey, pos: Vec, worker: Mobile | null): SheetView | null {
  const { state, content, actor } = ctx;
  const s = state.map.sectors[hex];
  if (s === undefined) return null;
  const w = worker?.id ?? '';
  if (s.status === 'hidden') {
    return {
      title: t('sector.hidden'),
      lines: [],
      actions: [
        orderAction(ctx, 'reveal', t('act.reveal'), { actor, kind: 'reveal', args: { mobile: w, hex } }),
      ],
      worker,
      candidates: [],
    };
  }
  const sector: Sector = s;
  const title = has(`terrain.${sector.terrain ?? ''}`)
    ? t(`terrain.${sector.terrain ?? ''}`)
    : t('sector.open');
  const lines: string[] = [];
  if (sector.revealedBy === actor && (sector.revealedTick ?? 0) > 0) lines.push(t('sector.byYou'));
  else if (sector.plot === null) lines.push(t('info.common'));
  const actions: ActionView[] = [];
  const own = sector.plot !== null && state.plots[sector.plot]?.owner === actor;
  if (own) {
    for (const b of Object.keys(content.builds ?? {}).sort()) {
      actions.push(
        orderAction(ctx, `build:${b}`, t(`act.build.${b}`), {
          actor,
          kind: 'build',
          args: { mobile: w, kind: b, pos: { x: Math.round(pos.x), y: Math.round(pos.y) } },
        }),
      );
    }
  }
  return { title, lines, actions, worker, candidates: [] };
}

/** Tick en que el obrero queda libre: el fin de la tarea o el de la última parada de la ruta. */
export function jobEnd(job: Job): number {
  return job.kind === 'route' ? (job.stops[job.stops.length - 1]?.leave ?? job.endTick) : job.endTick;
}

/** Qué está haciendo un obrero, en una línea. */
export function workerStatus(ctx: Ctx, m: Mobile): string {
  const { state, content, nowMs } = ctx;
  const job = m.job;
  if (job === null) {
    if (m.where.kind === 'trip')
      return t('worker.walking', { when: when(msOf(ctx, m.where.trip.arriveTick), nowMs) });
    return t('worker.idle');
  }
  const ends = when(msOf(ctx, jobEnd(job)), nowMs);
  if (job.kind === 'route') {
    const stop = job.stops[job.index];
    const e = stop === undefined ? undefined : state.elements[stop.at];
    const p = { i: job.index + 1, n: job.stops.length, when: ends };
    if (e === undefined) return t('worker.routeTo', { ...p, dest: '' });
    if (m.where.kind === 'trip' || state.tick < job.startTick)
      return t('worker.routeTo', { ...p, dest: destText(ctx, e) });
    if (!workable(state, content, state.tick)) return t('worker.routeWait', { ...p, in: inText(ctx, e) });
    return t('worker.routeAt', { ...p, in: inText(ctx, e) });
  }
  const what = jobText(ctx, m);
  if (state.tick < job.startTick || m.where.kind === 'trip') return t('worker.goingTo', { what, when: ends });
  const needsLight = !(job.kind === 'deliver' && !job.work);
  if (needsLight && !workable(state, content, state.tick)) return t('worker.waiting', { what, when: ends });
  return t('worker.working', { what, when: ends });
}

function jobText(ctx: Ctx, m: Mobile): string {
  const job = m.job;
  if (job === null) return '';
  switch (job.kind) {
    case 'reveal':
      return t('job.reveal');
    case 'build':
      return t(`job.build.${job.what}`);
    case 'link':
      return t(`job.link.${job.what}`);
    case 'task':
      return t(`job.task.${job.task}`);
    case 'deliver': {
      const dest = ctx.state.elements[job.element];
      const place = dest === undefined ? '' : t(`place.${dest.kind}`);
      return job.work
        ? t('job.deliverWork', { place })
        : t('job.deliver', { what: amount(job.resource, job.amount), place });
    }
    case 'route':
      return t('job.route');
  }
}

function mobileSheet(ctx: Ctx, m: Mobile): SheetView {
  const { state, content, actor } = ctx;
  const lines = [t(`mob.${m.kind}`), workerStatus(ctx, m)];
  if (m.hungry === true) lines.push(t('worker.hungry'));
  for (const r of Object.keys(m.cargo ?? {}).sort()) {
    lines.push(t('info.carrying', { what: amount(r, m.cargo?.[r] ?? 0) }));
  }
  const load = carriedBy(state, m.id);
  if (load.length > 0) {
    lines.push(t('info.load', { n: bultos(load), cap: carryOf(content, m) }));
    lines.push(...errandLines(ctx, load).map(cap));
  }
  const actions: ActionView[] = [];
  const job = m.job;
  if (m.owner === actor && job?.kind === 'route' && job.index < job.stops.length - 1) {
    const cancel = orderAction(ctx, 'route-cancel', t('act.routeCancel'), {
      actor,
      kind: 'cancel',
      args: { mobile: m.id },
    });
    const stop = job.stops[job.index];
    const e = stop === undefined ? undefined : state.elements[stop.at];
    if (cancel.enabled && stop !== undefined && e !== undefined) {
      cancel.meta = cap(
        t('meta.staysAt', { in: inText(ctx, e), when: when(msOf(ctx, stop.leave), ctx.nowMs) }),
      );
    }
    actions.push(cancel);
  }
  if (m.owner === actor && job === null) {
    const home = Object.keys(state.elements)
      .sort()
      .map((id) => state.elements[id])
      .find((e) => e?.owner === actor && (content.elements[e.kind]?.beds ?? 0) > 0);
    const there = m.where.kind === 'at' && m.where.element === home?.id;
    if (home !== undefined && !there) {
      actions.push(
        orderAction(ctx, 'home', t('act.home'), { actor, kind: 'move', args: { mobile: m.id, to: home.id } }),
      );
    }
    if (content.errands !== undefined && state.district.errands !== undefined) {
      actions.push({
        id: 'route',
        label: t('act.routeWorker'),
        meta: t('meta.pickPlaces'),
        enabled: true,
        next: { kind: 'route', mobile: m.id, stops: [] },
      });
    }
    const atPlace = m.where.kind === 'at' && m.where.element !== null && isPlace(ctx, m.where.element);
    if (load.length > 0 && atPlace) {
      const intent: OrderIntent = { actor, kind: 'unload', args: { mobile: m.id } };
      const unload = orderAction(ctx, 'unload', t('act.unload'), intent);
      if (unload.enabled) {
        const dropped = simulate(ctx, intent, state.tick + 1).filter((ev) => ev.kind === 'errand_dropped');
        unload.meta = cap(t('meta.drops', { n: dropped.length, m: load.length }));
      }
      actions.push(unload);
    }
  }
  return { title: m.name ?? m.id, lines, actions, worker: m, candidates: [] };
}

/** Sitios que se pueden añadir a una ruta: todos menos el de la última parada, hasta el máximo. */
function routeCandidates(ctx: Ctx, stops: readonly string[]): string[] {
  const table = ctx.content.errands;
  if (table === undefined || stops.length >= table.maxStops) return [];
  const last = stops[stops.length - 1];
  return placeIds(ctx.state, ctx.content).filter((id) => id !== last);
}

function routeSheet(ctx: Ctx, sel: Extract<Selection, { kind: 'route' }>): SheetView | null {
  const { state, content, actor } = ctx;
  const table = content.errands;
  if (table === undefined) return null;
  const m = state.mobiles[sel.mobile];
  const intent: OrderIntent = { actor, kind: 'route', args: { mobile: sel.mobile, stops: sel.stops } };
  const lines: string[] = [];
  let go: ActionView;
  if (sel.stops.length === 0) {
    lines.push(t('route.pick'));
    go = { id: 'route-go', label: t('act.routeGo'), meta: '', enabled: false, intent };
  } else {
    go = orderAction(ctx, 'route-go', t('act.routeGo'), intent);
    const plan = go.enabled && m !== undefined ? planRoute(state, content, m, actor, sel.stops) : null;
    const last = plan?.[plan.length - 1];
    const events = plan !== null && last !== undefined ? simulate(ctx, intent, last.leave + 1) : [];
    let delivered = 0;
    let pay = 0;
    sel.stops.forEach((id, i) => {
      const e = state.elements[id];
      const name = e === undefined ? id : elementLabel(ctx, e);
      const leave = plan?.[i]?.leave;
      const here = events.filter((ev) => ev.tick === leave);
      const gives = here.filter((ev) => ev.kind === 'errand_delivered' && ev.mobile === sel.mobile);
      const takes = here.filter((ev) => ev.kind === 'errand_picked' && ev.mobile === sel.mobile);
      for (const ev of gives) if (ev.kind === 'errand_delivered') pay += ev.pay;
      delivered += gives.length;
      const does: string[] = [];
      if (gives.length > 0) does.push(t('route.delivers', { n: gives.length }));
      if (takes.length > 0) does.push(t('route.picks', { n: takes.length }));
      lines.push(
        does.length > 0
          ? t('route.stopDoes', { i: i + 1, place: name, what: list(does) })
          : t('route.stop', { i: i + 1, place: name }),
      );
    });
    if (sel.stops.length < table.maxStops) lines.push(t('route.more'));
    if (go.enabled) {
      const tail =
        delivered > 0
          ? t('meta.delivers', { n: delivered, pay: amount(table.currency, pay) })
          : t('meta.deliversNothing');
      go = { ...go, meta: `${go.meta}, ${tail}` };
    }
  }
  const actions: ActionView[] = [go];
  if (sel.stops.length > 0) {
    actions.push({
      id: 'route-undo',
      label: t('act.routeUndo'),
      meta: '',
      enabled: true,
      next: { ...sel, stops: sel.stops.slice(0, -1) },
    });
  }
  actions.push({ id: 'cancel', label: t('act.cancel'), meta: '', enabled: true, close: true });
  return {
    title: t('route.title'),
    lines,
    actions,
    worker: m ?? null,
    candidates: routeCandidates(ctx, sel.stops),
  };
}

const NOT_A_CANDIDATE = [
  'not_linkable',
  'already_linked',
  'too_long',
  'unknown_element',
  'not_owner',
  'bad_args',
];

/** Elementos con los que se podría tender ese nexo desde `from` (aunque ahora falte algo para pagarlo). */
function linkCandidates(ctx: Ctx, from: string, linkKind: string, mobile: string): string[] {
  const out: string[] = [];
  for (const id of Object.keys(ctx.state.elements).sort()) {
    if (id === from) continue;
    const reason = validateIntent(ctx, {
      actor: ctx.actor,
      kind: 'link',
      args: { mobile, kind: linkKind, from, to: id },
    });
    if (reason === null || !NOT_A_CANDIDATE.includes(reason)) out.push(id);
  }
  return out;
}

function linkSheet(
  ctx: Ctx,
  sel: Extract<Selection, { kind: 'link' }>,
  worker: Mobile | null,
): SheetView | null {
  const { state, actor } = ctx;
  const from = state.elements[sel.from];
  if (from === undefined) return null;
  const w = worker?.id ?? '';
  const intentTo = (to: string): OrderIntent => ({
    actor,
    kind: 'link',
    args: { mobile: w, kind: sel.linkKind, from: sel.from, to },
  });
  const cancel: ActionView = { id: 'cancel', label: t('act.cancel'), meta: '', enabled: true, close: true };
  if (sel.to === null) {
    const candidates = linkCandidates(ctx, sel.from, sel.linkKind, w);
    return {
      title: t(`act.link.${sel.linkKind}`),
      lines: [
        t('info.from', { what: elementName(from.kind) }),
        candidates.length > 0 ? t('act.link.pick') : t('act.link.none'),
      ],
      actions: [cancel],
      worker,
      candidates,
    };
  }
  const to = state.elements[sel.to];
  if (to === undefined) return null;
  return {
    title: t(`act.link.${sel.linkKind}`),
    lines: [t('info.fromTo', { a: lower(elementName(from.kind)), b: lower(elementName(to.kind)) })],
    actions: [
      orderAction(ctx, `link:${sel.linkKind}`, t(`act.link.${sel.linkKind}`), intentTo(sel.to)),
      cancel,
    ],
    worker,
    candidates: [],
  };
}

function needsWorker(view: SheetView): boolean {
  return view.actions.some((a) => a.intent !== undefined && 'mobile' in (a.intent.args as object));
}

/** La hoja de una selección, con el obrero que haría las órdenes. null si no hay nada que enseñar. */
export function sheetFor(ctx: Ctx, sel: Selection, preferred: string | null): SheetView | null {
  const { state } = ctx;
  let view: SheetView | null = null;
  switch (sel.kind) {
    case 'element': {
      const e = state.elements[sel.id];
      if (e === undefined) return null;
      view = elementSheet(ctx, e, chooseWorker(ctx, preferred, e.pos));
      break;
    }
    case 'sector':
      view = sectorSheet(ctx, sel.hex, sel.pos, chooseWorker(ctx, preferred, sel.pos));
      break;
    case 'mobile': {
      const m = state.mobiles[sel.id];
      if (m === undefined) return null;
      view = mobileSheet(ctx, m);
      break;
    }
    case 'link': {
      const from = state.elements[sel.from];
      view = linkSheet(ctx, sel, chooseWorker(ctx, preferred, from?.pos ?? null));
      break;
    }
    case 'route':
      view = routeSheet(ctx, sel);
      break;
  }
  if (view !== null && sel.kind !== 'mobile' && !needsWorker(view)) view.worker = null;
  return view;
}

/** Lo que la pizarra cuenta de los recados: qué hay en cada sitio y cuántos llevó cada uno. */
export function errandBoard(ctx: Ctx): { places: string[]; delivered: Record<string, number> } | null {
  const es = ctx.state.district.errands;
  if (es === undefined) return null;
  const places: { label: string; n: number }[] = [];
  for (const id of placeIds(ctx.state, ctx.content)) {
    const e = ctx.state.elements[id];
    const here = errandsAt(ctx.state, id).filter((r) => r.holder === undefined);
    if (e === undefined || here.length === 0) continue;
    places.push({ label: elementLabel(ctx, e), n: here.length });
  }
  places.sort((a, b) => a.label.localeCompare(b.label));
  return {
    places: places.map((p) => `${p.label}: ${amount('recados', p.n)}`),
    delivered: { ...es.delivered },
  };
}

/** Existencias del jugador para la barra de arriba. */
export function stocks(ctx: Ctx): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of ['energia', 'comida', 'eagles', 'madera', 'piedra'])
    out[r] = available(ctx.state, ctx.content, ctx.actor, r);
  return out;
}

/** Capacidad de energía del jugador (suma de sus baterías). */
export function energyCapacity(ctx: Ctx): number {
  let c = 0;
  for (const e of Object.values(ctx.state.elements)) {
    if (e.owner === ctx.actor && ctx.content.elements[e.kind]?.inventory === true)
      c += capacityOf(ctx.content, e, 'energia');
  }
  return c;
}
