/**
 * Página de fixtures: expone el sim en `window.__distritos` para que Playwright ejecute en
 * Chromium la misma lista de órdenes que vitest ejecuta en Node y compare los hashes.
 */

import { content as loadContent } from '@distritos/content';
import {
  advance,
  createScene,
  hashOf,
  hashState,
  type CompiledContent,
  type OrderLog,
  type SceneParams,
} from '@distritos/sim';

export interface Checkpoint {
  tick: number;
  hash: string;
  view: string;
}

export interface RunRequest {
  params: SceneParams;
  orders: OrderLog;
  ticks: number[];
  /** Tablas compiladas sin hash (el hash se calcula aquí, como en el compilador), o null para las del repositorio. */
  tables: Omit<CompiledContent, 'hash'> | null;
}

function run(req: RunRequest): Checkpoint[] {
  const content: CompiledContent =
    req.tables === null ? loadContent() : { hash: hashOf(req.tables), ...req.tables };
  const state = createScene(req.params, content);
  const actor = req.params.actors[0]?.id ?? 'sys';
  const out: Checkpoint[] = [];
  for (const tick of req.ticks) {
    advance(state, req.orders, tick, content);
    out.push({ tick, hash: hashState(state), view: hashState(state, { actor }) });
  }
  return out;
}

declare global {
  interface Window {
    __distritos: { run: (req: RunRequest) => Checkpoint[]; contentHash: string; ready: true };
  }
}

window.__distritos = { run, contentHash: loadContent().hash, ready: true };
const out = document.getElementById('out');
if (out !== null) out.textContent = `listo · contenido ${loadContent().hash.slice(0, 16)}`;
