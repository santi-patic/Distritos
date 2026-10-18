/**
 * Informe de una partida guardada o exportada, para la hoja de observación de la prueba de fuego:
 * por cada día local del jugador, cuántas veces entró y cuánto rato, qué órdenes dio y cómo iba la
 * casa al acabar el día. El registro se repite con el mismo sim; si la exportación trae su
 * comprobación, se dice si la repetición da el mismo hash en su tick.
 */

import {
  advance,
  available,
  createScene,
  hashState,
  type CompiledContent,
  type Event,
  type SimState,
} from '@distritos/sim';
import type { ExportData, SaveData } from './save.js';

export interface DayStats {
  /** 1 es el día local en que se creó la partida. */
  day: number;
  /** Fecha local del jugador (AAAA-MM-DD). */
  date: string;
  /** Veces que abrió el juego ese día y minutos que estuvo. */
  sessions: number;
  minutes: number;
  /**
   * Órdenes del jugador por tipo; las tareas, construcciones y nexos, con lo que eran
   * (`job:talar`, `build:cobertizo`, `link:camino`).
   */
  orders: Record<string, number>;
  /** Órdenes que el sim rechazó en su tick. */
  rejected: number;
  /** Al acabar el día: sectores abiertos de su terreno (con el de la casa). */
  sectors: number;
  /** Edificios y caminos propios. */
  built: string[];
  workers: number;
  eagles: number;
  comida: number;
  /** Energía de sus baterías, en J. */
  energia: number;
  madera: number;
  piedra: number;
  /** Recados entregados en total hasta ese día. */
  errands: number;
  /** Águilas cobradas ese día por recados (y por el encargo de la pizarra, si lo hay). */
  pay: number;
  /** Obreros sin comer al acabar el día. */
  hungry: number;
}

export interface GameReport {
  days: DayStats[];
  /** Tick hasta el que se ha repetido (el de la exportación, o lo último visto). */
  until: number;
  /** Si la exportación traía comprobación: si la repetición da el mismo hash en su tick. */
  check: 'same' | 'differs' | 'none';
  /** Si las tablas con las que se exportó son estas. */
  sameTables: boolean;
}

const MS_PER_DAY = 86_400_000;

/** Clave de una orden para contarla: su tipo y, si lo tiene, qué tarea, edificio o nexo es. */
function orderKey(kind: string, args: unknown): string {
  const a = (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>;
  const detail = kind === 'job' ? a.task : kind === 'build' || kind === 'link' ? a.kind : undefined;
  return typeof detail === 'string' ? `${kind}:${detail}` : kind;
}

function isExport(save: SaveData): save is ExportData {
  return (save as Partial<ExportData>).check !== undefined;
}

/** Elementos propios que se construyen (según las tablas) y caminos propios. */
function builtBy(s: SimState, content: CompiledContent, actor: string): string[] {
  const out: string[] = [];
  for (const id of Object.keys(s.elements).sort()) {
    const e = s.elements[id];
    if (e?.owner === actor && content.builds?.[e.kind] !== undefined) out.push(e.kind);
  }
  for (const id of Object.keys(s.links).sort()) {
    const l = s.links[id];
    if (l === undefined || content.links?.[l.kind]?.carries !== undefined) continue;
    if (s.elements[l.from]?.owner === actor) out.push(l.kind);
  }
  return out;
}

export function analyze(save: SaveData, content: CompiledContent, actor: string): GameReport {
  const scene = content.scenes[save.params.kind];
  const dayTicks = scene.dayTicks;
  const tickMs = scene.tickMs;
  const offset = save.params.dayOffset ?? 0;
  const exp = isExport(save) ? save : null;
  const lastOrder = save.log[save.log.length - 1]?.tick ?? 0;
  const until = exp !== null ? exp.check.tick : Math.max(save.seenTick, lastOrder + 1);
  // Desfase de la zona horaria del jugador al crear la partida: su hora local en el tick 0 es
  // `offset` y la del ancla en UTC, la del reloj. Con eso, la fecha local de cada día.
  const anchorPhase = save.anchorMs % MS_PER_DAY;
  const tzMs = (((offset * tickMs - anchorPhase) % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
  const tzShift = tzMs > MS_PER_DAY / 2 ? tzMs - MS_PER_DAY : tzMs;

  const s = createScene(save.params, content);
  const days: DayStats[] = [];
  const firstDay = Math.floor(offset / dayTicks);
  let next = 0;
  for (let k = 0; ; k += 1) {
    const from = s.tick;
    const end = Math.min(until, (firstDay + k + 1) * dayTicks - offset);
    const events: Event[] = end > s.tick ? advance(s, save.log, end, content) : [];
    const orders: Record<string, number> = {};
    while (next < save.log.length && (save.log[next]?.tick ?? 0) < end) {
      const o = save.log[next];
      next += 1;
      if (o?.actor !== actor) continue;
      const key = orderKey(o.kind, o.args);
      orders[key] = (orders[key] ?? 0) + 1;
    }
    let sessions = 0;
    let minutes = 0;
    for (const ss of save.sessions) {
      const t = Math.floor((ss.start - save.anchorMs) / tickMs);
      if (t < from || t >= end) continue;
      sessions += 1;
      minutes += (ss.end - ss.start) / 60_000;
    }
    const noon = save.anchorMs + ((firstDay + k) * dayTicks - offset + dayTicks / 2) * tickMs;
    const date = new Date(noon + tzShift).toISOString().slice(0, 10);
    const mobiles = Object.values(s.mobiles).filter((m) => m.owner === actor);
    days.push({
      day: k + 1,
      date,
      sessions,
      minutes,
      orders,
      rejected: events.filter((e) => e.kind === 'rejected').length,
      sectors: Object.values(s.map.sectors).filter(
        (x) => x.status === 'revealed' && x.plot !== null && s.plots[x.plot]?.owner === actor,
      ).length,
      built: builtBy(s, content, actor),
      workers: mobiles.length,
      eagles: available(s, content, actor, 'eagles'),
      comida: available(s, content, actor, 'comida'),
      energia: available(s, content, actor, 'energia'),
      madera: available(s, content, actor, 'madera'),
      piedra: available(s, content, actor, 'piedra'),
      errands: s.district.errands?.delivered[actor] ?? 0,
      pay: events.reduce(
        (n, e) =>
          (e.kind === 'delivered' || e.kind === 'errand_delivered') && e.actor === actor ? n + e.pay : n,
        0,
      ),
      hungry: mobiles.filter((m) => m.hungry === true).length,
    });
    if (end >= until) break;
  }
  let check: GameReport['check'] = 'none';
  if (exp !== null) check = hashState(s) === exp.check.hash ? 'same' : 'differs';
  return {
    days,
    until,
    check,
    sameTables:
      exp === null ? save.createdWith.contentHash === content.hash : exp.check.contentHash === content.hash,
  };
}
