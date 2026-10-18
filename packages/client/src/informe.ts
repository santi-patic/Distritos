/**
 * Página del informe de la prueba de fuego (`informe.html`): lee las partidas exportadas por los
 * probadores, las repite con el sim y enseña, por probador y por día, lo que hizo y cómo iba la
 * casa. Herramienta del autor, no parte del juego: sus textos no pasan por las claves de idioma.
 */

import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import './informe.css';

import { content as loadContent } from '@distritos/content';
import { RULES_VERSION } from '@distritos/sim';
import { analyze, type DayStats, type GameReport } from './report.js';
import { parseExport, type ExportData, type SaveData } from './save.js';

const ACTOR = 'local';

const ORDER_NAMES: Record<string, string> = {
  move: 'ir',
  reveal: 'abrir',
  build: 'construir',
  link: 'unir',
  job: 'tarea',
  toggle: 'encender',
  hire: 'contratar',
  deliver: 'encargo',
  route: 'ruta',
  cancel: 'cancelar ruta',
  unload: 'dejar carga',
  skip: 'salto',
};

type Cell = string | number | { text: string; cls: string };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls !== '') e.className = cls;
  if (text !== '') e.textContent = text;
  return e;
}

function table(head: string[], rows: Cell[][], textCols: number[] = []): HTMLElement {
  const wrap = el('div', 'scroll');
  const t = el('table');
  const tr = el('tr');
  head.forEach((h, i) => {
    tr.append(el('th', textCols.includes(i) ? 'text' : '', h));
  });
  t.append(el('thead'));
  t.tHead?.append(tr);
  const body = el('tbody');
  for (const r of rows) {
    const row = el('tr');
    r.forEach((c, i) => {
      const td = el('td', textCols.includes(i) ? 'text' : '');
      if (typeof c === 'object') {
        td.textContent = c.text;
        td.classList.add(c.cls);
      } else {
        td.textContent = String(c);
      }
      row.append(td);
    });
    body.append(row);
  }
  t.append(body);
  wrap.append(t);
  return wrap;
}

/** Minutos de juego: «—» si no entró; «<1» si entró menos de un minuto. */
function minutes(m: number, sessions: number): string {
  if (sessions === 0) return '—';
  return m < 1 ? '<1' : String(Math.round(m));
}

/** «talar 2», «construir cobertizo 1», «camino 1». */
function orderName(key: string): string {
  const [kind = '', detail] = key.split(':');
  const what = detail?.replaceAll('_', ' ');
  if (what === undefined) return ORDER_NAMES[kind] ?? kind;
  if (kind === 'build') return `construir ${what}`;
  return what;
}

function orders(d: DayStats): string {
  const parts = Object.keys(d.orders)
    .sort()
    .map((k) => `${orderName(k)} ${d.orders[k] ?? 0}`);
  return parts.length === 0 ? '—' : parts.join(', ');
}

function kwh(j: number): string {
  return (j / 3_600_000).toFixed(2).replace('.', ',');
}

function checkCell(r: GameReport): Cell {
  if (r.check === 'same') return { text: 'coincide', cls: 'ok' };
  if (r.check === 'differs') return { text: r.sameTables ? 'no coincide' : 'otras tablas', cls: 'bad' };
  return { text: 'sin comprobación', cls: 'none' };
}

interface Loaded {
  name: string;
  save: SaveData;
  report: GameReport;
}

function render(list: Loaded[]): void {
  const summary = document.getElementById('summary');
  const detail = document.getElementById('detail');
  if (summary === null || detail === null) return;
  summary.replaceChildren();
  detail.replaceChildren();
  if (list.length === 0) return;
  summary.append(el('h2', '', 'Resumen'));
  summary.append(
    table(
      [
        'Partida',
        'Hash',
        'Días con entrada',
        'Minutos',
        'Sectores',
        'Edificios',
        'Obreros',
        'Recados',
        'Sin comer',
      ],
      list.map(({ name, report: r }) => {
        const last = r.days[r.days.length - 1];
        const played = r.days.filter((d) => d.sessions > 0).length;
        const total = r.days.reduce((n, d) => n + d.minutes, 0);
        const entries = r.days.reduce((n, d) => n + d.sessions, 0);
        return [
          name,
          checkCell(r),
          `${played} de ${r.days.length}`,
          minutes(total, entries),
          last?.sectors ?? 0,
          last === undefined || last.built.length === 0 ? '—' : last.built.join(', '),
          last?.workers ?? 0,
          last?.errands ?? 0,
          last?.hungry ?? 0,
        ];
      }),
      [0, 5],
    ),
  );
  for (const { name, save, report: r } of list) {
    detail.append(el('h2', '', name));
    const exp = (save as Partial<ExportData>).client;
    const info = [
      exp === undefined ? null : `Zona horaria ${exp.timeZone}, idioma ${exp.lang}, versión ${exp.build}.`,
      `Semilla ${save.params.seed}. Repetida hasta t=${r.until}.`,
      r.sameTables ? null : 'Se exportó con otras tablas: la repetición de aquí puede no ser su partida.',
    ]
      .filter((x) => x !== null)
      .join(' ');
    detail.append(el('p', 'muted', info));
    detail.append(
      table(
        [
          'Día',
          'Fecha',
          'Entradas',
          'Minutos',
          'Órdenes',
          'Rechazadas',
          'Sectores',
          'Edificios',
          'Obreros',
          'Águilas',
          'Comida',
          'Energía (kWh)',
          'Madera / piedra',
          'Recados',
          'Encargos (Águilas)',
          'Sin comer',
        ],
        r.days.map((d) => [
          d.day,
          d.date,
          d.sessions,
          minutes(d.minutes, d.sessions),
          orders(d),
          d.rejected,
          d.sectors,
          d.built.length === 0 ? '—' : d.built.join(', '),
          d.workers,
          d.eagles,
          d.comida,
          kwh(d.energia),
          `${d.madera} / ${d.piedra}`,
          d.errands,
          d.encargos,
          d.hungry,
        ]),
        [4, 7],
      ),
    );
  }
}

function main(): void {
  const content = loadContent();
  const version = document.getElementById('version');
  if (version !== null)
    version.textContent = `Reglas ${RULES_VERSION}, tablas ${content.hash.slice(0, 8)}, versión ${__BUILD__}.`;
  const input = document.getElementById('files') as HTMLInputElement | null;
  input?.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    void Promise.all(
      files.map(async (f): Promise<Loaded | null> => {
        const save = parseExport(await f.text());
        return save === null ? null : { name: f.name, save, report: analyze(save, content, ACTOR) };
      }),
    ).then((loaded) => {
      const ok = loaded.filter((x): x is Loaded => x !== null);
      render(ok.sort((a, b) => a.name.localeCompare(b.name)));
      const bad = files.length - ok.length;
      const summary = document.getElementById('summary');
      if (bad > 0 && summary !== null)
        summary.prepend(el('p', 'bad', `${bad} de los archivos no son partidas de Distritos.`));
    });
  });
}

main();
