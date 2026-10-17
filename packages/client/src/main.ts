/**
 * Cliente mínimo de F0: un terreno con niebla, una casa, sus elementos y dos obreros.
 * Tocar un elemento manda al obrero seleccionado; tocar un sector en niebla junto a uno
 * abierto lo abre. Todo lo que decide pasa por el sim; aquí solo hay reloj, dibujo y toques.
 */

import { content as loadContent } from '@distritos/content';
import { hex as H, shortHash, type Element, type MobileId, type Vec } from '@distritos/sim';
import { LocalGame } from './game.js';
import { rejectText, t } from './i18n.js';
import { Renderer, drawPosition, screenToWorld } from './render.js';

const ACTOR = 'local';

function seedFromUrl(): string {
  const s = new URLSearchParams(location.search).get('seed');
  return s !== null && /^[0-9a-f]{1,64}$/.test(s) ? s : '0123456789abcdef';
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`falta #${id}`);
  return node;
}

async function main(): Promise<void> {
  const content = loadContent();
  const game = new LocalGame(
    content,
    {
      kind: 'district',
      template: 'f0_solo',
      seed: seedFromUrl(),
      actors: [{ id: ACTOR, plot: 'p1' }],
    },
    ACTOR,
  );
  const renderer = new Renderer();
  await renderer.init(document.body);

  const hudWorker = el('hud-worker');
  const hudStocks = el('hud-stocks');
  const hudMessage = el('hud-message');
  const hudTick = el('hud-tick');

  let selected: MobileId | null = Object.keys(game.state.mobiles).sort()[0] ?? null;
  let message = t('hint.start');
  let lastHashAt = 0;
  let hash = shortHash(game.hash());

  renderer.fit(game.view());
  window.addEventListener('resize', () => {
    renderer.fit(game.view());
  });

  const say = (text: string): void => {
    message = text;
  };

  const tap = (screen: { x: number; y: number }): void => {
    game.sync();
    const v = game.view();
    const lat = { hexW: v.scene.hexW, hexH: v.scene.hexH };
    const world: Vec = screenToWorld(renderer.camera, screen);
    const clock = game.clock();
    const hitRadius = 18 / renderer.camera.scale; // mm

    // 1. ¿Un obrero propio? Se selecciona.
    for (const m of Object.values(v.mobiles)) {
      if (m.owner !== ACTOR) continue;
      const p = drawPosition(m, clock);
      if (Math.hypot(p.x - world.x, p.y - world.y) <= hitRadius) {
        selected = m.id;
        say(t('hint.selected', { name: m.name ?? m.id }));
        return;
      }
    }
    if (selected === null) return;

    // 2. ¿Un elemento visible? El obrero va.
    let nearest: Element | null = null;
    let best = hitRadius;
    for (const e of Object.values(v.elements)) {
      const d = Math.hypot(e.pos.x - world.x, e.pos.y - world.y);
      if (d <= best) {
        best = d;
        nearest = e;
      }
    }
    if (nearest !== null) {
      const reason = game.submit({ actor: ACTOR, kind: 'move', args: { mobile: selected, to: nearest.id } });
      say(reason === null ? t('hint.sent') : rejectText(reason));
      return;
    }

    // 3. ¿Un sector en niebla? Se intenta abrir.
    const h = H.nearest(world, lat);
    const sector = v.map.sectors[H.key(h)];
    if (sector === undefined || sector.status === 'unknown') {
      say(t('hint.nothing'));
      return;
    }
    if (sector.status === 'hidden') {
      const reason = game.submit({ actor: ACTOR, kind: 'reveal', args: { mobile: selected, hex: H.key(h) } });
      const name = v.mobiles[selected]?.name ?? selected;
      say(reason === null ? t('hint.revealing', { name }) : rejectText(reason));
      return;
    }
    say(t('hint.nothing'));
  };

  // Toques, arrastre y zoom (rueda o pellizco) sobre el lienzo.
  const canvas = renderer.app.canvas;
  const pointers = new Map<number, { x: number; y: number }>();
  let dragged = false;
  let pinchDistance = 0;
  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 1) dragged = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDistance = a !== undefined && b !== undefined ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    const prev = pointers.get(ev.pointerId);
    if (prev === undefined) return;
    const cur = { x: ev.clientX, y: ev.clientY };
    pointers.set(ev.pointerId, cur);
    if (pointers.size === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      if (dragged || Math.hypot(dx, dy) > 6) {
        dragged = true;
        renderer.pan(dx, dy);
      }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      if (a === undefined || b === undefined) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance > 0) renderer.zoom(d / pinchDistance, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      pinchDistance = d;
      dragged = true;
    }
  });
  const release = (ev: PointerEvent): void => {
    const had = pointers.delete(ev.pointerId);
    if (had && pointers.size === 0 && !dragged) tap({ x: ev.clientX, y: ev.clientY });
    if (pointers.size < 2) pinchDistance = 0;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      renderer.zoom(ev.deltaY < 0 ? 1.15 : 1 / 1.15, { x: ev.clientX, y: ev.clientY });
    },
    { passive: false },
  );

  renderer.app.ticker.add(() => {
    const events = game.sync();
    for (const e of events) {
      if (e.kind === 'rejected') say(rejectText(e.reason));
    }
    const clock = game.clock();
    const v = game.view();
    renderer.draw(v, clock, selected, content);

    const now = performance.now();
    if (now - lastHashAt > 1000) {
      hash = shortHash(game.hash());
      lastHashAt = now;
    }
    const actor = v.actors[ACTOR];
    const stocks = actor !== undefined && 'stocks' in actor ? actor.stocks : {};
    const worker = selected === null ? null : v.mobiles[selected];
    hudWorker.textContent =
      worker === null || worker === undefined ? '' : t('hud.worker', { name: worker.name ?? worker.id });
    hudStocks.textContent = t('hud.stocks', {
      energy: ((stocks.energia ?? 0) / 3_600_000).toFixed(2),
      food: stocks.comida ?? 0,
      eagles: stocks.eagles ?? 0,
    });
    hudMessage.textContent = message;
    hudTick.textContent = t('hud.tick', { tick: game.state.tick, hash });
  });
}

void main();
