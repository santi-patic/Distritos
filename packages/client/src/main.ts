/**
 * Cliente de F1: la casa jugable en el móvil.
 *
 * Aquí solo hay reloj, dibujo y toques. Lo que decide pasa por el sim (validar, presupuestar,
 * avanzar); lo que se guarda es el registro de órdenes y el ancla de tiempo.
 */

import '@fontsource/barlow-semi-condensed/400.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/caveat/500.css';
import '@fontsource/caveat/700.css';
import './style.css';

import { Capacitor } from '@capacitor/core';
import { content as loadContent } from '@distritos/content';
import {
  RULES_VERSION,
  hashState,
  hex as H,
  light,
  nextLightChange,
  replay,
  resolveFlows,
  shortHash,
  workable,
  type Event,
  type Mobile,
} from '@distritos/sim';
import {
  energyCapacity,
  errandBoard,
  errandDestinations,
  isPlace,
  jobEnd,
  ownMobiles,
  sheetFor,
  stocks,
  type ActionView,
  type Ctx,
  type Selection,
} from './actions.js';
import { LocalGame } from './game.js';
import { amount, detectLang, duration, lang, qty, rejectText, setLang, t, when, type Lang } from './i18n.js';
import { Renderer, type Highlight } from './render.js';
import {
  LANG_KEY,
  clearSave,
  exportName,
  loadSave,
  newSave,
  parseExport,
  parseSave,
  touchSession,
  writeSave,
  type KeyValueStore,
  type SaveData,
} from './save.js';
import { Ui, type BoardModel, type WorkerChip } from './ui.js';

const ACTOR = 'local';
const TEMPLATE = 'f1_casa';
const PLOT = 'p1';
/** Semilla por defecto: el mismo mapa para todos los probadores. `?seed=` la cambia al crear. */
const DEFAULT_SEED = 'f1f1f1f1f1f1f1f1';
/** Dos aperturas separadas por menos de esto cuentan como una sesión. */
const SESSION_GAP_MS = 5 * 60_000;

function memoryStore(): KeyValueStore {
  const data: Record<string, string> = {};
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete data[k];
    },
  };
}

function browserStore(): KeyValueStore {
  try {
    const probe = 'distritos.probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return memoryStore();
  }
}

function seedFromUrl(): string {
  const s = new URLSearchParams(location.search).get('seed');
  return s !== null && /^[0-9a-f]{1,64}$/.test(s) ? s : DEFAULT_SEED;
}

function cap(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

async function main(): Promise<void> {
  const content = loadContent();
  const store = browserStore();
  const savedLang = store.getItem(LANG_KEY);
  setLang(savedLang === 'es' || savedLang === 'gl' ? savedLang : detectLang());

  const district = content.scenes.district;
  const freshSave = (): SaveData =>
    newSave({
      template: TEMPLATE,
      seed: seedFromUrl(),
      actor: ACTOR,
      plot: PLOT,
      nowMs: Date.now(),
      tickMs: district.tickMs,
      dayTicks: district.dayTicks,
      tzOffsetMin: new Date().getTimezoneOffset(),
      contentHash: content.hash,
      rules: RULES_VERSION,
    });

  let save = loadSave(store) ?? freshSave();
  let game = new LocalGame(content, save, ACTOR);
  game.catchUp();
  const ranWith = `${content.hash}/${RULES_VERSION}`;
  const replayedWithNewRules = save.log.length > 0 && save.ranWith !== undefined && save.ranWith !== ranWith;
  save.ranWith = ranWith;
  touchSession(save, Date.now(), SESSION_GAP_MS);
  writeSave(store, save);

  const renderer = new Renderer();
  await renderer.init(document.getElementById('map') ?? document.body);

  let selection: Selection | null = null;
  let active: string | null = ownMobiles(ctx()).find((m) => m.job === null)?.id ?? null;
  let hashLabel = '';
  let lastHashAt = -Infinity;
  let lastUiAt = -Infinity;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function ctx(): Ctx {
    return {
      state: game.state,
      content,
      actor: ACTOR,
      anchorMs: save.anchorMs,
      nowMs: Date.now(),
      log: save.log,
    };
  }

  function persist(): void {
    writeSave(store, save);
  }

  const ui = new Ui({
    action: (a) => {
      runAction(a);
    },
    closeSheet: () => {
      selection = null;
      refreshUi(true);
    },
    worker: (id) => {
      if (selection?.kind === 'route') {
        // Con una ruta a medias, elegir un obrero es cambiar quién la hace.
        routeWorker(id);
        return;
      }
      active = id;
      selection = { kind: 'mobile', id };
      const m = game.state.mobiles[id];
      if (m !== undefined) renderer.focus(positionOfNow(m));
      refreshUi(true);
      keepVisible();
    },
    home: () => {
      renderer.frameHome(game.view());
    },
    light: () => {
      ui.toast(lightText());
    },
    openBoard: () => {
      ui.showBoard(boardModel());
    },
    boardShow: () => {
      const e = game.state.district.board?.encargo;
      const dest = e === null || e === undefined ? undefined : game.state.elements[e.at];
      if (dest === undefined) return;
      renderer.focus(dest.pos);
      selection = { kind: 'element', id: dest.id };
      refreshUi(true);
    },
    lang: (l: Lang) => {
      setLang(l);
      try {
        store.setItem(LANG_KEY, l);
      } catch {
        // Sin almacenamiento, el idioma dura lo que la sesión.
      }
      ui.retitle();
      ui.setMenu(menuModel());
      refreshUi(true);
    },
    exportGame: () => {
      void exportGame(false);
    },
    copyGame: () => {
      void exportGame(true);
    },
    importGame: (text) => {
      importGame(text);
    },
    reset: () => {
      clearSave(store);
      startOver(freshSave());
    },
  });

  /** Cambia el obrero de la ruta que se está preparando, si está libre. */
  function routeWorker(id: string): void {
    if (selection?.kind !== 'route') return;
    const m = game.state.mobiles[id];
    if (m?.owner !== ACTOR) return;
    if (m.job !== null) {
      ui.toast(t('route.busy', { name: m.name ?? m.id }));
      return;
    }
    active = id;
    selection = { ...selection, mobile: id };
    refreshUi(true);
  }

  function positionOfNow(m: Mobile): { x: number; y: number } {
    if (m.where.kind === 'at') return m.where.pos;
    return m.where.trip.to;
  }

  function startOver(next: SaveData): void {
    save = next;
    game = new LocalGame(content, save, ACTOR);
    game.catchUp();
    save.ranWith = ranWith;
    touchSession(save, Date.now(), SESSION_GAP_MS);
    persist();
    selection = null;
    active = ownMobiles(ctx()).find((m) => m.job === null)?.id ?? null;
    lastHashAt = -Infinity;
    renderer.frameHome(game.view());
    ui.setMenu(menuModel());
    refreshUi(true);
  }

  function menuModel(): { lang: Lang; version: string; seed: string } {
    return {
      lang: lang(),
      version: t('menu.version', {
        rules: RULES_VERSION,
        content: content.hash.slice(0, 8),
        build: __BUILD__,
      }),
      seed: save.params.seed,
    };
  }

  function lightText(): string {
    const s = game.state;
    const now = workable(s, content, s.tick);
    // Próximo cambio entre luz de trabajo y noche.
    let tick: number | null = s.tick;
    for (let i = 0; i < 64 && tick !== null; i++) {
      tick = nextLightChange(s, content, tick);
      if (tick !== null && workable(s, content, tick) !== now) {
        return t(now ? 'clock.dayUntil' : 'clock.nightUntil', { when: when(game.msOf(tick), Date.now()) });
      }
    }
    return t(now ? 'clock.day' : 'clock.night');
  }

  async function exportGame(copy: boolean): Promise<void> {
    const now = Date.now();
    const data = game.exportData(now, {
      userAgent: navigator.userAgent,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      lang: lang(),
      build: __BUILD__,
    });
    const text = JSON.stringify(data);
    const name = exportName(now);
    // En la aplicación de Android no hay descargas: se copia al portapapeles.
    if (copy || Capacitor.isNativePlatform()) {
      try {
        await navigator.clipboard.writeText(text);
        ui.toast(t('menu.copied'));
      } catch {
        ui.toast(t('menu.copyFailed'));
      }
      return;
    }
    const file = new File([text], name, { type: 'application/json' });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        ui.toast(t('menu.exported'));
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10_000);
    ui.toast(t('menu.exported'));
  }

  function importGame(text: string): void {
    const next = parseExport(text);
    if (next === null) {
      ui.toast(t('menu.importBad'));
      return;
    }
    // Si es una exportación, se comprueba que la repetición aquí da el mismo hash en su tick.
    let checkText = t('menu.imported');
    if ('check' in next) {
      const { tick, hash } = next.check;
      const same = hashState(replay(next.params, next.log, tick, content)) === hash;
      checkText = t(same ? 'menu.importSame' : 'menu.importDiffers', { tick });
    }
    startOver(parseSave(text) ?? next);
    ui.toast(checkText);
  }

  function runAction(a: ActionView): void {
    if (a.close === true) {
      selection = null;
      refreshUi(true);
      return;
    }
    if (a.next !== undefined) {
      selection = a.next;
      refreshUi(true);
      keepVisible();
      return;
    }
    if (a.intent === undefined) return;
    const reason = game.submit(a.intent);
    if (reason !== null) {
      ui.toast(rejectText(reason));
      return;
    }
    persist();
    const args = a.intent.args as { mobile?: string };
    if (args.mobile !== undefined) active = args.mobile;
    ui.toast(t('toast.sent'));
    if (a.intent.kind !== 'toggle') {
      selection = null;
      if (ui.isBoardOpen()) ui.showBoard(null);
    }
    refreshUi(true);
  }

  function boardModel(): BoardModel | null {
    const board = game.state.district.board;
    if (board === undefined) return null;
    const e = board.encargo;
    const title = t('board.title');
    const always = Object.keys(board.totals[ACTOR] ?? {})
      .sort()
      .map((r) => {
        const v = board.totals[ACTOR]?.[r] ?? 0;
        return r === 'trabajo' ? t('board.totalWork', { d: duration(v) }) : cap(amount(r, v));
      });
    const errands = errandBoard(ctx());
    const errandPlaces = errands?.places ?? [];
    const errandsDone = Object.keys(errands?.delivered ?? {})
      .sort()
      .map((actor) => `${actor === ACTOR ? t('board.you') : actor}: ${errands?.delivered[actor] ?? 0}`);
    if (e === null) {
      return {
        title,
        today: t('board.none'),
        progress: 0,
        progressText: '',
        reward: '',
        who: [],
        always,
        send: null,
        canShow: false,
        errands: errandPlaces,
        errandsDone,
      };
    }
    const dest = game.state.elements[e.at];
    const place = dest === undefined ? '' : t(`place.${dest.kind}`);
    const today = e.work
      ? t('board.work', { d: duration(e.amount), place })
      : t('board.need', { what: amount(e.resource, e.amount), place });
    const fmt = (v: number): string => (e.work ? duration(v) : qty(e.resource, v));
    const progressText = t('board.progress', {
      done: fmt(e.delivered),
      total: e.work ? duration(e.amount) : amount(e.resource, e.amount),
    });
    const who = Object.keys(e.by)
      .sort()
      .map((actor) => {
        const v = e.by[actor] ?? 0;
        const name = actor === ACTOR ? t('board.you') : actor;
        return `${name}: ${e.work ? duration(v) : amount(e.resource, v)}`;
      });
    let send: ActionView | null = null;
    if (dest !== undefined) {
      const sheet = sheetFor(ctx(), { kind: 'element', id: dest.id }, active);
      const deliver = sheet?.actions.find((x) => x.id === 'deliver');
      if (deliver !== undefined) {
        const name = sheet?.worker?.name ?? sheet?.worker?.id;
        send = { ...deliver, label: name === undefined ? t('board.send') : t('board.sendWho', { name }) };
      }
    }
    if (e.reserved >= e.amount && send !== null) send = { ...send, enabled: false, meta: t('board.done') };
    return {
      title,
      today: cap(today),
      progress: e.amount > 0 ? e.delivered / e.amount : 0,
      progressText,
      reward: t('board.reward', { reward: amount('eagles', e.reward) }),
      who,
      always,
      send,
      canShow: dest !== undefined,
      errands: errandPlaces,
      errandsDone,
    };
  }

  function workerChips(): WorkerChip[] {
    const c = ctx();
    return ownMobiles(c).map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      line:
        m.job === null
          ? t('worker.idle')
          : t('worker.freeAt', { when: when(game.msOf(jobEnd(m.job)), c.nowMs) }),
      active: m.id === active,
      busy: m.job !== null,
      hungry: m.hungry === true,
    }));
  }

  function barModel(): Parameters<Ui['setBar']>[0] {
    const c = ctx();
    const s = stocks(c);
    const capE = energyCapacity(c);
    const board = game.state.district.board;
    const e = board?.encargo ?? null;
    return {
      energy: amount('energia', s.energia ?? 0),
      energyFraction: capE > 0 ? (s.energia ?? 0) / capE : 0,
      day: workable(game.state, content, game.state.tick),
      food: qty('comida', s.comida ?? 0),
      eagles: qty('eagles', s.eagles ?? 0),
      wood: (s.madera ?? 0) > 0 ? qty('madera', s.madera ?? 0) : null,
      stone: (s.piedra ?? 0) > 0 ? qty('piedra', s.piedra ?? 0) : null,
      boardOpen: e !== null && e.reserved < e.amount,
    };
  }

  function refreshUi(force = false): void {
    const now = performance.now();
    if (!force && now - lastUiAt < 250) return;
    lastUiAt = now;
    ui.setBar(barModel());
    ui.setDock(workerChips());
    const c = ctx();
    if (selection !== null) {
      const view = sheetFor(c, selection, active);
      if (view === null) selection = null;
      ui.showSheet(view);
    } else {
      ui.showSheet(null);
    }
    if (ui.isBoardOpen()) ui.showBoard(boardModel());
  }

  function highlight(): Highlight {
    const h: Highlight = {};
    if (selection?.kind === 'element') h.element = selection.id;
    if (selection?.kind === 'mobile') h.mobile = selection.id;
    if (selection?.kind === 'sector') {
      h.sector = selection.hex;
      const s = game.state.map.sectors[selection.hex];
      if (s?.status === 'revealed') h.point = selection.pos;
    }
    if (selection?.kind === 'link') {
      h.element = selection.from;
      if (selection.to === null) {
        const view = sheetFor(ctx(), selection, active);
        h.candidates = view?.candidates ?? [];
      } else {
        h.candidates = [selection.to];
      }
    }
    if (selection?.kind === 'element' && isPlace(ctx(), selection.id)) {
      h.destinations = errandDestinations(ctx(), selection.id);
    }
    if (selection?.kind === 'route') {
      h.route = { mobile: selection.mobile, stops: selection.stops };
      h.mobile = selection.mobile;
      h.candidates = sheetFor(ctx(), selection, active)?.candidates ?? [];
    }
    const e = game.state.district.board?.encargo;
    if (e !== null && e !== undefined && e.reserved < e.amount) h.encargo = e.at;
    return h;
  }

  let cachedHighlight: Highlight = {};

  function eventToasts(events: Event[]): void {
    // Los recados entregados en una parada se avisan juntos.
    let errandPay = 0;
    let errandCount = 0;
    for (const ev of events) {
      if (ev.kind === 'errand_delivered' && ev.actor === ACTOR) {
        errandPay += ev.pay;
        errandCount += 1;
      }
    }
    if (errandCount > 0) ui.toast(t('toast.errands', { pay: amount('eagles', errandPay) }));
    for (const ev of events) {
      switch (ev.kind) {
        case 'sector_revealed':
          if (ev.by === ACTOR) ui.toast(t('toast.revealed'));
          break;
        case 'built': {
          const e = game.state.elements[ev.element];
          if (ev.by === ACTOR && e !== undefined) ui.toast(t('toast.built', { what: t(`el.${e.kind}`) }));
          break;
        }
        case 'linked':
          ui.toast(t('toast.linked'));
          break;
        case 'hired': {
          const m = game.state.mobiles[ev.mobile];
          if (m?.owner === ACTOR) ui.toast(t('toast.hired', { name: m.name ?? m.id }));
          break;
        }
        case 'switched': {
          const e = game.state.elements[ev.element];
          if (ev.reason !== 'order' && e?.owner === ACTOR)
            ui.toast(t('toast.switchedOff', { what: t(`el.${e.kind}`) }));
          break;
        }
        case 'delivered':
          if (ev.actor === ACTOR) ui.toast(t('toast.delivered', { pay: amount('eagles', ev.pay) }));
          break;
        case 'encargo':
          ui.toast(t('toast.encargo'));
          break;
        case 'hungry': {
          const m = game.state.mobiles[ev.mobile];
          if (m?.owner === ACTOR) ui.toast(t('toast.hungry', { name: m.name ?? m.id }));
          break;
        }
        case 'job_done': {
          const m = game.state.mobiles[ev.mobile];
          if (m?.owner === ACTOR && ev.job.kind === 'task')
            ui.toast(t('toast.free', { name: m.name ?? m.id }));
          if (m?.owner === ACTOR && ev.job.kind === 'route')
            ui.toast(t('toast.routeDone', { name: m.name ?? m.id }));
          break;
        }
        case 'rejected':
          ui.toast(rejectText(ev.reason));
          break;
        default:
          break;
      }
    }
  }

  /** Que lo elegido no quede debajo de la hoja ni de la barra. */
  function keepVisible(): void {
    if (selection === null) return;
    const v = game.view();
    let p: { x: number; y: number } | null;
    if (selection.kind === 'element') p = renderer.screenOf(v, { element: selection.id });
    else if (selection.kind === 'mobile') p = renderer.screenOf(v, { mobile: selection.id });
    else if (selection.kind === 'sector') p = renderer.screenOf(v, { sector: selection.hex });
    else if (selection.kind === 'route') {
      const last = selection.stops[selection.stops.length - 1];
      p =
        last === undefined
          ? renderer.screenOf(v, { mobile: selection.mobile })
          : renderer.screenOf(v, { element: last });
    } else p = renderer.screenOf(v, { element: selection.to ?? selection.from });
    if (p === null) return;
    const sheet = document.getElementById('sheet');
    const insets = ui.insets();
    const bottom =
      sheet !== null && !sheet.hidden
        ? sheet.getBoundingClientRect().top
        : window.innerHeight - insets.bottom;
    const top = insets.top;
    const margin = 56;
    if (p.y > bottom - margin) renderer.glide(0, bottom - margin - p.y, !reduceMotion.matches);
    else if (p.y < top + margin) renderer.glide(0, top + margin - p.y, !reduceMotion.matches);
  }

  // ---- toques sobre el mapa ----
  function tap(p: { x: number; y: number }): void {
    game.sync();
    const v = game.view();
    const hit = renderer.hit(p, v);
    if (selection?.kind === 'route') {
      routeTap(hit);
      return;
    }
    if (selection?.kind === 'link' && selection.to === null) {
      const view = sheetFor(ctx(), selection, active);
      if (hit?.kind === 'element' && view?.candidates.includes(hit.id) === true) {
        selection = { ...selection, to: hit.id };
      } else if (hit === null || hit.kind === 'sector') {
        selection = null;
      } else {
        ui.toast(t('act.link.pick'));
        return;
      }
      refreshUi(true);
      keepVisible();
      return;
    }
    if (hit === null) {
      selection = null;
    } else if (hit.kind === 'mobile') {
      const m = game.state.mobiles[hit.id];
      if (m?.owner === ACTOR) active = hit.id;
      selection = { kind: 'mobile', id: hit.id };
    } else if (hit.kind === 'element') {
      selection = { kind: 'element', id: hit.id };
    } else {
      const s = v.map.sectors[hit.hex];
      const own =
        s !== undefined &&
        s.status !== 'unknown' &&
        s.plot !== null &&
        game.state.plots[s.plot]?.owner === ACTOR;
      // Un sector abierto ajeno o común sin nada que hacer no abre hoja.
      selection = s?.status === 'hidden' || own ? { kind: 'sector', hex: hit.hex, pos: hit.pos } : null;
    }
    refreshUi(true);
    keepVisible();
  }

  /** Con una ruta abierta, tocar un sitio añade una parada; tocar un obrero propio cambia quién va. */
  function routeTap(hit: ReturnType<Renderer['hit']>): void {
    if (selection?.kind !== 'route') return;
    if (hit?.kind === 'mobile') {
      routeWorker(hit.id);
      return;
    }
    if (hit?.kind !== 'element' || !isPlace(ctx(), hit.id)) {
      ui.toast(t('route.notPlace'));
      return;
    }
    const max = content.errands?.maxStops ?? 0;
    if (selection.stops[selection.stops.length - 1] === hit.id) {
      ui.toast(t('route.same'));
      return;
    }
    if (selection.stops.length >= max) {
      ui.toast(t('route.max', { n: max }));
      return;
    }
    selection = { ...selection, stops: [...selection.stops, hit.id] };
    refreshUi(true);
    keepVisible();
  }

  const canvas = renderer.app.canvas;
  const pointers: Record<number, { x: number; y: number }> = {};
  let dragged = false;
  let pinch = 0;
  const pointerList = (): { x: number; y: number }[] => Object.values(pointers);
  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    const list = pointerList();
    if (list.length === 1) dragged = false;
    if (list.length === 2) {
      const [a, b] = list;
      pinch = a !== undefined && b !== undefined ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    const prev = pointers[ev.pointerId];
    if (prev === undefined) return;
    const cur = { x: ev.clientX, y: ev.clientY };
    pointers[ev.pointerId] = cur;
    const list = pointerList();
    if (list.length === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      if (dragged || Math.hypot(dx, dy) > 6) {
        dragged = true;
        renderer.pan(dx, dy);
      }
    } else if (list.length === 2) {
      const [a, b] = list;
      if (a === undefined || b === undefined) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) renderer.zoom(d / pinch, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, game.view().scene);
      pinch = d;
      dragged = true;
    }
  });
  const release = (ev: PointerEvent): void => {
    const had = pointers[ev.pointerId] !== undefined;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete pointers[ev.pointerId];
    if (had && pointerList().length === 0 && !dragged) tap({ x: ev.clientX, y: ev.clientY });
    if (pointerList().length < 2) pinch = 0;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      renderer.zoom(ev.deltaY < 0 ? 1.15 : 1 / 1.15, { x: ev.clientX, y: ev.clientY }, game.view().scene);
    },
    { passive: false },
  );

  // ---- guardado y sesiones ----
  window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    touchSession(save, Date.now(), SESSION_GAP_MS);
    persist();
  }, 15_000);
  document.addEventListener('visibilitychange', () => {
    touchSession(save, Date.now(), SESSION_GAP_MS);
    if (document.visibilityState === 'visible') {
      // Vuelta tras un rato: puesta al día con el tope de la escena, sin avisos por lo pasado.
      game.catchUp();
      refreshUi(true);
    }
    persist();
  });
  window.addEventListener('pagehide', () => {
    touchSession(save, Date.now(), SESSION_GAP_MS);
    persist();
  });

  // ---- encuadre y bucle ----
  const layout = (): void => {
    renderer.insets = ui.insets();
  };
  layout();
  renderer.frameHome(game.view());
  window.addEventListener('resize', () => {
    layout();
  });
  ui.setMenu(menuModel());
  refreshUi(true);
  if (replayedWithNewRules) ui.toast(t('menu.replayed'));

  renderer.app.ticker.add(() => {
    eventToasts(game.sync());
    const s = game.state;
    const v = game.view();
    const animMs = performance.now();
    if (animMs - lastUiAt >= 250) cachedHighlight = highlight();
    renderer.draw({
      view: v,
      content,
      clock: game.clock(),
      animMs,
      light: light(s, content, s.tick),
      workable: workable(s, content, s.tick),
      flows: resolveFlows(s, content),
      active,
      highlight: cachedHighlight,
      reduceMotion: reduceMotion.matches,
    });
    if (animMs - lastHashAt > 1000) {
      const { tick, hash } = game.hash();
      hashLabel = t('hud.hash', { tick, hash: shortHash(hash) });
      lastHashAt = animMs;
      ui.setHash(hashLabel);
    }
    refreshUi();
  });

  // Gancho de lectura para las pruebas y para quien depure en la consola.
  (window as unknown as { distritos: unknown }).distritos = {
    get state() {
      return game.state;
    },
    get save() {
      return save;
    },
    hash: () => game.hash(),
    screenOf: (what: { element?: string; mobile?: string; sector?: string }) =>
      renderer.screenOf(game.view(), what),
    /** Centra la cámara en un elemento (pruebas: los sitios del común quedan fuera del encuadre). */
    focus: (element: string) => {
      const e = game.state.elements[element];
      if (e !== undefined) renderer.focus(e.pos);
    },
    sectorKey: (q: number, r: number) => H.keyOf(q, r),
  };
}

void main();
