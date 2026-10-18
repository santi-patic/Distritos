/**
 * La interfaz fuera del mapa: la barra de existencias, la hoja de abajo con lo tocado y sus
 * órdenes, la fila de obreros, los avisos, la etiqueta del hash, la pizarra del común y el
 * menú. Solo pinta modelos ya calculados y devuelve los toques a quien la usa; no conoce el sim.
 */

import type { ActionView, SheetLine, SheetView } from './actions.js';
import { t } from './i18n.js';
import { PICTO, hexColor, isErrandType, typeColor } from './pictos.js';

export interface BarModel {
  energy: string;
  /** Fracción de la batería, 0..1, para el anillo del icono. */
  energyFraction: number;
  day: boolean;
  food: string;
  eagles: string;
  wood: string | null;
  stone: string | null;
  boardOpen: boolean;
}

export interface WorkerChip {
  id: string;
  name: string;
  line: string;
  active: boolean;
  busy: boolean;
  hungry: boolean;
}

export interface BoardModel {
  title: string;
  today: string;
  /** Fracción entregada, 0..1. */
  progress: number;
  progressText: string;
  reward: string;
  who: string[];
  always: string[];
  send: ActionView | null;
  canShow: boolean;
  /** Sitios del común con recados, en una línea cada uno. */
  errands: string[];
  /** Recados entregados por cada finca. */
  errandsDone: string[];
}

export interface MenuModel {
  lang: 'es' | 'gl';
  version: string;
  seed: string;
}

export interface UiHandlers {
  action(a: ActionView): void;
  closeSheet(): void;
  worker(id: string): void;
  home(): void;
  light(): void;
  openBoard(): void;
  boardShow(): void;
  lang(l: 'es' | 'gl'): void;
  exportGame(): void;
  copyGame(): void;
  importGame(text: string): void;
  reset(): void;
}

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c);
  }
  return el;
}

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`falta #${id}`);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(viewBox: string, inner: string, cls = 'ico'): SVGSVGElement {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', viewBox);
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = inner;
  return s;
}

const ICONS = {
  sun: () =>
    svg(
      '0 0 24 24',
      '<circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></g>',
    ),
  moon: () =>
    svg(
      '0 0 24 24',
      '<path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.2A9.5 9.5 0 0 1 15.5 3.5z" fill="currentColor"/>',
    ),
  menu: () =>
    svg(
      '0 0 24 24',
      '<g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></g>',
    ),
  slate: () =>
    svg(
      '0 0 24 24',
      '<rect x="2.5" y="4.5" width="19" height="15" rx="1.5" fill="#2b3533" stroke="#a07c52" stroke-width="2"/><path d="M6 10h8M6 14h11" stroke="#f1efe6" stroke-width="1.6" stroke-linecap="round"/>',
    ),
  home: () =>
    svg(
      '0 0 24 24',
      '<path d="M4 11.2 12 4.5l8 6.7V20h-5.5v-5.2h-5V20H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    ),
  close: () =>
    svg(
      '0 0 24 24',
      '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    ),
};

/** Pictograma de un tipo de recado en su cuadrado del color de su función (P15). */
export function pictoSquare(type: string, title: string): HTMLElement {
  const box = h('span', { class: 'picto', role: 'img', 'aria-label': title, title });
  box.style.setProperty('--picto-bg', hexColor(typeColor(type)));
  if (isErrandType(type)) box.append(svg('0 0 24 24', PICTO[type], 'picto-svg'));
  return box;
}

function sheetLine(l: SheetLine): HTMLElement {
  if (typeof l === 'string') return h('li', {}, l);
  return h('li', { class: 'errand' }, pictoSquare(l.picto, l.title), h('span', {}, l.text));
}

/** Firma de un modelo para no rehacer el DOM si no ha cambiado. */
function sig(v: unknown): string {
  return JSON.stringify(v);
}

/** Acciones secundarias (cancelar, deshacer): sin presupuesto ni orden; van juntas en una fila. */
function isQuiet(a: ActionView): boolean {
  return a.close === true || (a.next !== undefined && a.intent === undefined && a.meta === '');
}

export class Ui {
  private readonly bar = byId('bar');
  private readonly stocksEl = byId('stocks');
  private readonly sheet = byId('sheet');
  private readonly dock = byId('dock');
  private readonly toastEl = byId('toast');
  private readonly hashEl = byId('hash');
  private readonly board = byId('board') as HTMLDialogElement;
  private readonly menu = byId('menu') as HTMLDialogElement;
  private readonly fileInput = byId('import-file') as HTMLInputElement;
  private readonly lightBtn = byId('btn-light') as HTMLButtonElement;
  private readonly boardBtn = byId('btn-board') as HTMLButtonElement;
  private readonly menuBtn = byId('btn-menu') as HTMLButtonElement;
  private readonly homeBtn = byId('btn-home') as HTMLButtonElement;
  private barSig = '';
  private sheetSig = '';
  private dockSig = '';
  private boardSig = '';
  private toasts: string[] = [];
  private toastTimer: number | null = null;
  private menuModel: MenuModel | null = null;
  private confirming: 'import' | 'reset' | null = null;
  private pendingImport: string | null = null;

  constructor(private readonly on: UiHandlers) {
    this.lightBtn.addEventListener('click', () => {
      on.light();
    });
    this.boardBtn.addEventListener('click', () => {
      on.openBoard();
    });
    this.menuBtn.addEventListener('click', () => {
      this.openMenu();
    });
    this.homeBtn.addEventListener('click', () => {
      on.home();
    });
    this.boardBtn.append(ICONS.slate());
    this.menuBtn.append(ICONS.menu());
    this.homeBtn.append(ICONS.home());
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file === undefined) return;
      void file.text().then((text) => {
        this.pendingImport = text;
        this.confirming = 'import';
        this.renderMenu();
      });
    });
    for (const d of [this.board, this.menu]) {
      d.addEventListener('click', (ev) => {
        // Tocar fuera del contenido cierra.
        if (ev.target === d) d.close();
      });
    }
    this.retitle();
  }

  /** Alto de la barra de arriba y de la fila de abajo, para encuadrar el mapa. */
  insets(): { top: number; bottom: number } {
    return {
      top: this.bar.getBoundingClientRect().bottom,
      bottom: window.innerHeight - this.dock.getBoundingClientRect().top,
    };
  }

  /** Textos fijos de los botones (cambian con el idioma). */
  retitle(): void {
    this.boardBtn.setAttribute('aria-label', t('board.title'));
    this.menuBtn.setAttribute('aria-label', t('menu.title'));
    this.homeBtn.setAttribute('aria-label', t('act.frameHome'));
    this.barSig = '';
    this.sheetSig = '';
    this.dockSig = '';
    this.boardSig = '';
    if (this.menu.open) this.renderMenu();
  }

  setBar(m: BarModel): void {
    const s = sig(m);
    if (s === this.barSig) return;
    this.barSig = s;
    const item = (cls: string, label: string, value: string, icon: Node): HTMLElement =>
      h(
        'span',
        { class: `stock ${cls}`, 'aria-label': `${label}: ${value}` },
        icon,
        h('span', { class: 'v' }, value),
      );
    const ring = h('span', { class: 'ring' });
    ring.style.setProperty('--f', String(Math.max(0, Math.min(1, m.energyFraction))));
    const nodes: Node[] = [
      item('energia', t('res.energia'), m.energy, ring),
      item('comida', t('res.comida'), m.food, h('span', { class: 'rhomb' })),
      item('eagles', t('res.eagles'), m.eagles, h('span', { class: 'chip-ico' })),
    ];
    if (m.wood !== null)
      nodes.push(item('madera', t('res.madera'), m.wood, h('span', { class: 'rhomb hollow' })));
    if (m.stone !== null) nodes.push(item('piedra', t('res.piedra'), m.stone, h('span', { class: 'rhomb' })));
    this.stocksEl.replaceChildren(...nodes);
    this.lightBtn.replaceChildren(m.day ? ICONS.sun() : ICONS.moon());
    this.lightBtn.classList.toggle('day', m.day);
    this.lightBtn.setAttribute('aria-label', t(m.day ? 'clock.day' : 'clock.night'));
    this.boardBtn.classList.toggle('badge', m.boardOpen);
  }

  setDock(chips: WorkerChip[]): void {
    const s = sig(chips);
    if (s === this.dockSig) return;
    this.dockSig = s;
    const list = byId('workers');
    list.replaceChildren(
      ...chips.map((c) => {
        const b = h(
          'button',
          {
            type: 'button',
            class: `worker${c.busy ? ' busy' : ''}${c.hungry ? ' hungry' : ''}`,
            'aria-pressed': c.active ? 'true' : 'false',
            'data-mobile': c.id,
          },
          h('span', { class: 'tri', 'aria-hidden': 'true' }),
          h(
            'span',
            { class: 'who' },
            h('span', { class: 'name' }, c.name),
            h('span', { class: 'line' }, c.line),
          ),
        );
        b.addEventListener('click', () => {
          this.on.worker(c.id);
        });
        return b;
      }),
    );
  }

  setHash(text: string): void {
    if (this.hashEl.textContent !== text) this.hashEl.textContent = text;
  }

  private actionButton(a: ActionView): HTMLButtonElement {
    const b = h(
      'button',
      {
        type: 'button',
        class: `act${isQuiet(a) ? ' quiet' : ''}`,
        'data-action': a.id,
        disabled: !a.enabled,
      },
      h('span', { class: 'label' }, a.label),
      a.meta.length > 0 ? h('span', { class: 'meta' }, a.meta) : null,
    );
    b.addEventListener('click', () => {
      this.on.action(this.withInput(a));
    });
    return b;
  }

  /** Si la orden lleva lo escrito en el campo de la hoja, se lo pone (sin espacios en los bordes). */
  private withInput(a: ActionView): ActionView {
    if (a.takesInput !== true || a.intent === undefined) return a;
    const input = this.sheet.querySelector<HTMLInputElement>('input.name-input');
    const name = (input?.value ?? '').trim().replace(/\s+/g, ' ');
    return { ...a, intent: { ...a.intent, args: { ...(a.intent.args as object), name } } };
  }

  showSheet(view: SheetView | null): void {
    const s = sig(view === null ? null : { ...view, worker: view.worker?.name ?? view.worker?.id ?? null });
    if (s === this.sheetSig) return;
    this.sheetSig = s;
    if (view === null) {
      this.sheet.hidden = true;
      this.sheet.replaceChildren();
      return;
    }
    const close = h(
      'button',
      { type: 'button', class: 'icon-btn close', 'aria-label': t('act.close') },
      ICONS.close(),
    );
    close.addEventListener('click', () => {
      this.on.closeSheet();
    });
    // Quién haría las órdenes, salvo en la hoja del propio obrero.
    const name = view.worker === null ? null : (view.worker.name ?? view.worker.id);
    const workerLine =
      name !== null &&
      name !== view.title &&
      view.actions.some((a) => a.intent !== undefined && 'mobile' in (a.intent.args as object))
        ? h('p', { class: 'by' }, t('sheet.worker', { name }))
        : null;
    const main = view.actions.filter((a) => !isQuiet(a));
    const quiet = view.actions.filter(isQuiet);
    let input: HTMLInputElement | null = null;
    if (view.input !== undefined) {
      input = h('input', {
        type: 'text',
        class: 'name-input',
        maxlength: String(view.input.max),
        placeholder: view.input.placeholder,
        autocomplete: 'off',
        enterkeyhint: 'done',
        'aria-label': view.title,
      });
      input.value = view.input.value;
      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        const save = view.actions.find((a) => a.takesInput === true);
        if (save !== undefined) this.on.action(this.withInput(save));
      });
    }
    const parts: Child[] = [
      h('header', { class: 'sheet-head' }, h('h2', {}, view.title), close),
      workerLine,
      view.lines.length > 0 ? h('ul', { class: 'lines' }, ...view.lines.map(sheetLine)) : null,
      input,
      main.length > 0 ? h('div', { class: 'acts' }, ...main.map((a) => this.actionButton(a))) : null,
      quiet.length > 0 ? h('div', { class: 'acts side' }, ...quiet.map((a) => this.actionButton(a))) : null,
    ];
    this.sheet.replaceChildren(
      ...parts.filter((p): p is Node | string => p !== null && p !== undefined && p !== false),
    );
    this.sheet.hidden = false;
    input?.focus();
  }

  toast(text: string): void {
    if (text.length === 0 || this.toasts[this.toasts.length - 1] === text) return;
    this.toasts.push(text);
    if (this.toastTimer === null) this.nextToast();
  }

  private nextToast(): void {
    const text = this.toasts.shift();
    if (text === undefined) {
      this.toastEl.classList.remove('show');
      this.toastTimer = null;
      return;
    }
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('show');
      this.toastTimer = window.setTimeout(() => {
        this.nextToast();
      }, 180);
    }, 2600);
  }

  isBoardOpen(): boolean {
    return this.board.open;
  }

  showBoard(m: BoardModel | null): void {
    if (m === null) {
      if (this.board.open) this.board.close();
      return;
    }
    const s = sig(m);
    if (s !== this.boardSig) {
      this.boardSig = s;
      const close = h(
        'button',
        { type: 'button', class: 'icon-btn close chalk', 'aria-label': t('act.close') },
        ICONS.close(),
      );
      close.addEventListener('click', () => {
        this.board.close();
      });
      const bar = h('div', { class: 'chalk-bar', role: 'img', 'aria-label': m.progressText });
      bar.style.setProperty('--p', String(Math.max(0, Math.min(1, m.progress))));
      const buttons: Node[] = [];
      if (m.send !== null) {
        const b = this.actionButton(m.send);
        b.classList.add('chalk');
        buttons.push(b);
      }
      if (m.canShow) {
        const show = h(
          'button',
          { type: 'button', class: 'act chalk quiet', 'data-action': 'board-show' },
          h('span', { class: 'label' }, t('board.show')),
        );
        show.addEventListener('click', () => {
          this.board.close();
          this.on.boardShow();
        });
        buttons.push(show);
      }
      this.board.replaceChildren(
        h(
          'div',
          { class: 'slate-in' },
          h('header', { class: 'sheet-head' }, h('h2', {}, m.title), close),
          h('p', { class: 'chalk-today' }, m.today),
          bar,
          h('p', { class: 'chalk-small' }, m.progressText),
          m.reward.length > 0 ? h('p', { class: 'chalk-small' }, m.reward) : null,
          m.who.length > 0
            ? h(
                'div',
                { class: 'chalk-list' },
                h('h3', {}, t('board.who')),
                h('ul', {}, ...m.who.map((w) => h('li', {}, w))),
              )
            : null,
          m.always.length > 0
            ? h(
                'div',
                { class: 'chalk-list' },
                h('h3', {}, t('board.always')),
                h('ul', {}, ...m.always.map((w) => h('li', {}, w))),
              )
            : null,
          m.errands.length > 0
            ? h(
                'div',
                { class: 'chalk-list' },
                h('h3', {}, t('board.errands')),
                h('ul', {}, ...m.errands.map((w) => h('li', {}, w))),
              )
            : null,
          m.errandsDone.length > 0
            ? h(
                'div',
                { class: 'chalk-list' },
                h('h3', {}, t('board.errandsDone')),
                h('ul', {}, ...m.errandsDone.map((w) => h('li', {}, w))),
              )
            : null,
          buttons.length > 0 ? h('div', { class: 'acts' }, ...buttons) : null,
        ),
      );
    }
    if (!this.board.open) this.board.showModal();
  }

  setMenu(m: MenuModel): void {
    this.menuModel = m;
    if (this.menu.open) this.renderMenu();
  }

  private openMenu(): void {
    this.confirming = null;
    this.pendingImport = null;
    this.renderMenu();
    if (!this.menu.open) this.menu.showModal();
  }

  closeMenu(): void {
    if (this.menu.open) this.menu.close();
  }

  private renderMenu(): void {
    const m = this.menuModel;
    if (m === null) return;
    const close = h(
      'button',
      { type: 'button', class: 'icon-btn close', 'aria-label': t('act.close') },
      ICONS.close(),
    );
    close.addEventListener('click', () => {
      this.menu.close();
    });
    const langBtn = (l: 'es' | 'gl', label: string): HTMLButtonElement => {
      const b = h(
        'button',
        { type: 'button', class: 'seg', 'aria-pressed': m.lang === l ? 'true' : 'false', lang: l },
        label,
      );
      b.addEventListener('click', () => {
        this.on.lang(l);
      });
      return b;
    };
    const item = (id: string, label: string, run: () => void, cls = ''): HTMLButtonElement => {
      const b = h(
        'button',
        { type: 'button', class: `act ${cls}`, 'data-action': id },
        h('span', { class: 'label' }, label),
      );
      b.addEventListener('click', run);
      return b;
    };
    let body: Node[];
    if (this.confirming !== null) {
      const what = this.confirming;
      body = [
        h('p', { class: 'confirm' }, t(what === 'import' ? 'menu.importConfirm' : 'menu.resetConfirm')),
        h(
          'div',
          { class: 'acts row' },
          item(
            `${what}-yes`,
            t(what === 'import' ? 'menu.importYes' : 'menu.resetYes'),
            () => {
              const text = this.pendingImport;
              this.confirming = null;
              this.pendingImport = null;
              this.menu.close();
              if (what === 'import' && text !== null) this.on.importGame(text);
              else if (what === 'reset') this.on.reset();
            },
            'danger',
          ),
          item(
            `${what}-no`,
            t('act.cancel'),
            () => {
              this.confirming = null;
              this.pendingImport = null;
              this.renderMenu();
            },
            'quiet',
          ),
        ),
      ];
    } else {
      body = [
        h(
          'div',
          { class: 'seg-group', role: 'group', 'aria-label': t('menu.lang') },
          langBtn('es', 'Castellano'),
          langBtn('gl', 'Galego'),
        ),
        h(
          'div',
          { class: 'acts' },
          item('export', t('menu.export'), () => {
            this.on.exportGame();
          }),
          item('copy', t('menu.copy'), () => {
            this.on.copyGame();
          }),
          item('import', t('menu.import'), () => {
            this.fileInput.click();
          }),
          item(
            'reset',
            t('menu.reset'),
            () => {
              this.confirming = 'reset';
              this.renderMenu();
            },
            'quiet',
          ),
        ),
        h('p', { class: 'version' }, m.version),
        h('p', { class: 'version' }, t('menu.seed', { seed: m.seed })),
      ];
    }
    this.menu.replaceChildren(
      h(
        'div',
        { class: 'menu-in' },
        h('header', { class: 'sheet-head' }, h('h2', {}, t('menu.title')), close),
        ...body,
      ),
    );
  }
}
