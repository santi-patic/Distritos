/**
 * Partida guardada en el navegador (F1: el árbitro es el propio cliente).
 *
 * Se guarda lo mínimo para reconstruirla: los parámetros de la escena, el ancla (el instante
 * del tick 0 en milisegundos de época) y el registro de órdenes. El estado no se guarda: al
 * abrir se repite el registro hasta la hora actual, que es la puesta al día. `seenTick` es el
 * último tick al que llegó la partida en este aparato: sirve para aplicar el tope de puesta al
 * día. Las sesiones (cuándo se abrió y hasta cuándo se jugó) van en la exportación para la
 * hoja de observación de la prueba de fuego.
 */

import { compareOrders, type Order, type SceneKind, type SceneParams } from '@distritos/sim';

export const SAVE_KEY = 'distritos.partida.v1';
export const LANG_KEY = 'distritos.idioma';
export const SAVE_FORMAT = 'distritos-partida';

export interface Session {
  start: number;
  end: number;
}

export interface SaveData {
  format: typeof SAVE_FORMAT;
  v: 1;
  params: SceneParams;
  /** Época en ms del tick 0; múltiplo del tick. */
  anchorMs: number;
  log: Order[];
  seenTick: number;
  /** Tablas y reglas con las que nació la partida. Al abrir se repite con las actuales. */
  createdWith: { contentHash: string; rules: string };
  /** Tablas y reglas de la última vez que se abrió («hash/versión»): si cambian, se avisa. */
  ranWith?: string;
  sessions: Session[];
}

export interface ExportData extends SaveData {
  exportedAt: number;
  /** Tick y hash del estado al exportar: quien la cargue comprueba que su repetición da lo mismo. */
  check: { tick: number; hash: string; contentHash: string; rules: string };
  client: { userAgent: string; timeZone: string; lang: string; build: string };
}

/** Lo que usamos de `localStorage`; inyectable para las pruebas. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const MS_PER_DAY = 86_400_000;
const SCENE_KINDS: readonly SceneKind[] = ['district', 'incursion', 'charge', 'dispute'];

/**
 * Fase del día local en ticks para un instante: lo que el sim llama `dayOffset`. El día del
 * juego es el del jugador en su zona horaria (A9); el cambio de hora no se sigue (T15).
 */
export function localDayOffset(
  anchorMs: number,
  tickMs: number,
  dayTicks: number,
  tzOffsetMin: number,
): number {
  const local = anchorMs - tzOffsetMin * 60_000;
  const msOfDay = ((local % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
  return Math.floor(msOfDay / tickMs) % dayTicks;
}

export interface NewGame {
  template: string;
  seed: string;
  actor: string;
  plot: string;
  nowMs: number;
  tickMs: number;
  dayTicks: number;
  tzOffsetMin: number;
  contentHash: string;
  rules: string;
}

export function newSave(g: NewGame): SaveData {
  const anchorMs = g.nowMs - (g.nowMs % g.tickMs);
  return {
    format: SAVE_FORMAT,
    v: 1,
    params: {
      kind: 'district',
      template: g.template,
      seed: g.seed,
      actors: [{ id: g.actor, plot: g.plot }],
      dayOffset: localDayOffset(anchorMs, g.tickMs, g.dayTicks, g.tzOffsetMin),
    },
    anchorMs,
    log: [],
    seenTick: 0,
    createdWith: { contentHash: g.contentHash, rules: g.rules },
    sessions: [],
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v);
}

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

function parseParams(v: unknown): SceneParams | null {
  if (!isObj(v) || !isStr(v.kind) || !isStr(v.template) || !isStr(v.seed)) return null;
  const kind = SCENE_KINDS.find((k) => k === v.kind);
  if (kind === undefined || !/^[0-9a-f]{1,64}$/.test(v.seed) || !Array.isArray(v.actors)) return null;
  const actors: SceneParams['actors'] = [];
  for (const a of v.actors as unknown[]) {
    if (!isObj(a) || !isStr(a.id) || !isStr(a.plot)) return null;
    actors.push({ id: a.id, plot: a.plot });
  }
  const params: SceneParams = { kind, template: v.template, seed: v.seed, actors };
  if (v.dayOffset !== undefined) {
    if (!isInt(v.dayOffset) || v.dayOffset < 0) return null;
    params.dayOffset = v.dayOffset;
  }
  return params;
}

function parseLog(v: unknown): Order[] | null {
  if (!Array.isArray(v)) return null;
  const log: Order[] = [];
  for (const o of v as unknown[]) {
    if (!isObj(o) || !isInt(o.seq) || !isInt(o.tick) || o.tick < 0 || !isStr(o.actor) || !isStr(o.kind))
      return null;
    if (!isObj(o.args)) return null;
    log.push({ seq: o.seq, tick: o.tick, actor: o.actor, kind: o.kind, args: o.args } as Order);
  }
  for (let i = 1; i < log.length; i++) {
    const a = log[i - 1];
    const b = log[i];
    if (a === undefined || b === undefined || compareOrders(a, b) >= 0 || a.seq >= b.seq) return null;
  }
  return log;
}

/** Lee una partida guardada o exportada. null si no lo es. */
export function parseSave(text: string): SaveData | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || raw.format !== SAVE_FORMAT || raw.v !== 1) return null;
  const params = parseParams(raw.params);
  const log = parseLog(raw.log);
  if (params === null || log === null || !isInt(raw.anchorMs)) return null;
  const sessions: Session[] = [];
  if (Array.isArray(raw.sessions)) {
    for (const s of raw.sessions as unknown[]) {
      if (isObj(s) && isInt(s.start) && isInt(s.end)) sessions.push({ start: s.start, end: s.end });
    }
  }
  const created = isObj(raw.createdWith) ? raw.createdWith : {};
  const save: SaveData = {
    format: SAVE_FORMAT,
    v: 1,
    params,
    anchorMs: raw.anchorMs,
    log,
    seenTick: isInt(raw.seenTick) && raw.seenTick >= 0 ? raw.seenTick : 0,
    createdWith: {
      contentHash: isStr(created.contentHash) ? created.contentHash : '',
      rules: isStr(created.rules) ? created.rules : '',
    },
    sessions,
  };
  if (isStr(raw.ranWith)) save.ranWith = raw.ranWith;
  return save;
}

/** Lee una exportación con su comprobación y los datos del aparato; una partida sin ellos, tal cual. */
export function parseExport(text: string): SaveData | ExportData | null {
  const save = parseSave(text);
  if (save === null) return null;
  const raw = JSON.parse(text) as Record<string, unknown>;
  const check = raw.check;
  if (
    !isObj(check) ||
    !isInt(check.tick) ||
    check.tick < 0 ||
    !isStr(check.hash) ||
    !isStr(check.contentHash) ||
    !isStr(check.rules)
  )
    return save;
  const client = isObj(raw.client) ? raw.client : {};
  const str = (v: unknown): string => (isStr(v) ? v : '');
  return {
    ...save,
    exportedAt: isInt(raw.exportedAt) ? raw.exportedAt : 0,
    check: { tick: check.tick, hash: check.hash, contentHash: check.contentHash, rules: check.rules },
    client: {
      userAgent: str(client.userAgent),
      timeZone: str(client.timeZone),
      lang: str(client.lang),
      build: str(client.build),
    },
  };
}

export function loadSave(store: KeyValueStore): SaveData | null {
  try {
    const text = store.getItem(SAVE_KEY);
    return text === null ? null : parseSave(text);
  } catch {
    return null;
  }
}

/** Guarda; devuelve false si el navegador no deja (modo privado, cuota). */
export function writeSave(store: KeyValueStore, save: SaveData): boolean {
  try {
    store.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(store: KeyValueStore): void {
  try {
    store.removeItem(SAVE_KEY);
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}

/** Apunta una sesión nueva o alarga la última si no ha pasado el hueco. */
export function touchSession(save: SaveData, nowMs: number, gapMs: number): void {
  const last = save.sessions[save.sessions.length - 1];
  if (last !== undefined && nowMs - last.end <= gapMs && nowMs >= last.end) last.end = nowMs;
  else save.sessions.push({ start: nowMs, end: nowMs });
}

/** Nombre de fichero de una exportación, con la fecha local. */
export function exportName(nowMs: number): string {
  const d = new Date(nowMs);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `distritos-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
