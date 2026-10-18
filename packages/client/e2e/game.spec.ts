/**
 * La página de juego en un Chromium de móvil, con el reloj del navegador bajo control: arranca
 * con la casa encuadrada, abre un sector con un obrero, guarda el registro en el navegador y lo
 * repite al volver, hace una ruta de recados por el común, cambia de idioma, exporta la partida
 * y la vuelve a cargar comprobando el hash.
 */

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  timezoneId: 'Europe/Madrid',
  locale: 'es-ES',
});

interface Hook {
  state: {
    tick: number;
    map: { sectors: Record<string, { status: string }> };
    elements: Record<string, { kind: string }>;
  };
  save: { log: { kind: string; args: unknown }[]; params: { dayOffset?: number } };
  hash: () => { tick: number; hash: string };
  screenOf: (what: { element?: string; mobile?: string; sector?: string }) => { x: number; y: number } | null;
  focus: (element: string) => void;
}

async function boot(page: Page, time = '2026-10-19T10:00:00+02:00'): Promise<void> {
  await page.clock.install({ time: new Date(time) });
  await page.goto('/');
  await page.clock.runFor(500);
  await page.waitForFunction(() => (window as unknown as { distritos?: unknown }).distritos !== undefined);
  await page.clock.runFor(500);
}

async function tapOn(page: Page, what: { element?: string; sector?: string }): Promise<void> {
  const p = await page.evaluate(
    (w) => (window as unknown as { distritos: Hook }).distritos.screenOf(w),
    what,
  );
  if (p === null) throw new Error(`no está en pantalla: ${JSON.stringify(what)}`);
  await page.mouse.click(p.x, p.y);
  await page.clock.runFor(400);
}

function hook<T>(page: Page, f: (h: Hook) => T): Promise<T> {
  return page.evaluate<T>(`(${f.toString()})(window.distritos)`);
}

test('arranca con la casa, la hora del jugador y la etiqueta del hash con su tick', async ({ page }) => {
  await boot(page);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#hash')).toContainText(/^t=\d+ [0-9a-f]{16}$/);
  // Creada a las 10:00 de Madrid (y lo que tarde en arrancar): la fase del día del tick 0 son
  // las 10:00 en ticks de 100 ms.
  const offset = await hook(page, (h) => h.save.params.dayOffset ?? -1);
  expect(offset).toBeGreaterThanOrEqual(10 * 36_000);
  expect(offset).toBeLessThan(10 * 36_000 + 100);
  await expect(page.locator('.worker')).toHaveCount(2);
  await expect(page.locator('#stocks')).toContainText('0,50 kWh');
});

test('abrir un sector: presupuesto, orden, apertura y puesta al día al volver', async ({ page }) => {
  await boot(page);
  await tapOn(page, { sector: '1,0' });
  const reveal = page.locator('[data-action="reveal"]');
  await expect(reveal).toContainText('Abrir el sector');
  await expect(reveal).toContainText('0,10 kWh, 5 min, termina a las 10:05');
  await reveal.click();
  await page.clock.runFor(300);
  await expect(page.locator('#toast')).toContainText('Orden dada');
  expect(await hook(page, (h) => h.save.log.length)).toBe(1);

  await page.clock.fastForward(6 * 60_000);
  await page.clock.runFor(500);
  expect(await hook(page, (h) => h.state.map.sectors['1,0']?.status)).toBe('revealed');
  const before = await hook(page, (h) => h.hash());

  // Al volver, el registro guardado se repite: mismo estado en el mismo tick.
  await page.reload();
  await page.clock.runFor(500);
  await page.waitForFunction(() => (window as unknown as { distritos?: unknown }).distritos !== undefined);
  expect(await hook(page, (h) => h.save.log.length)).toBe(1);
  expect(await hook(page, (h) => h.state.map.sectors['1,0']?.status)).toBe('revealed');
  const after = await hook(page, (h) => h.hash());
  expect(after.tick).toBeGreaterThanOrEqual(before.tick);
});

test('la pizarra del común enseña el encargo y manda a alguien', async ({ page }) => {
  await boot(page);
  await page.click('#btn-board');
  await page.clock.runFor(300);
  const board = page.locator('#board');
  await expect(board).toContainText('Pizarra del común');
  await expect(board).toContainText('2,00 kWh en el punto de carga');
  const send = board.locator('[data-action="deliver"]');
  await expect(send).toContainText('lleva 0,50 kWh, cobra 2 Águilas');
  await send.click();
  await page.clock.runFor(300);
  await expect(page.locator('#toast')).toContainText('Orden dada');
  await page.clock.runFor(10_000);
  await expect(page.locator('#stocks')).toContainText('2');
});

/** Centra la cámara en un elemento y lo toca (los sitios del común quedan fuera del encuadre de la casa). */
async function tapElement(page: Page, id: string): Promise<void> {
  await page.evaluate((e) => {
    (window as unknown as { distritos: Hook }).distritos.focus(e);
  }, id);
  await page.clock.runFor(100);
  await tapOn(page, { element: id });
}

test('recados: una ruta por el común recoge, entrega y cobra', async ({ page }) => {
  await boot(page);
  const ids = await hook(page, (h) =>
    Object.fromEntries(Object.entries(h.state.elements).map(([id, e]) => [e.kind, id])),
  );
  const almacen = ids.almacen_comun ?? '';
  const cocina = ids.cocina_comun ?? '';
  await tapElement(page, almacen);
  const sheet = page.locator('#sheet');
  await expect(sheet).toContainText('1 haz de leña a la cocina común');
  await page.locator('[data-action="route"]').click();
  await page.clock.runFor(300);
  await expect(sheet).toContainText('Toca otro sitio para añadir una parada');
  await tapElement(page, cocina);
  await expect(sheet).toContainText('1. Almacén común: recoge 1');
  await expect(sheet).toContainText('2. Cocina común: entrega 1');
  const go = page.locator('[data-action="route-go"]');
  await expect(go).toContainText('2 min, termina a las 10:02, entrega 1, cobra 2 Águilas');
  await go.click();
  await page.clock.runFor(300);
  expect(await hook(page, (h) => h.save.log.map((o) => o.kind))).toEqual(['route']);

  await page.clock.fastForward(3 * 60_000);
  await page.clock.runFor(500);
  await expect(page.locator('.stock.eagles .v')).toHaveText('2');
  await page.click('#btn-board');
  await page.clock.runFor(300);
  await expect(page.locator('#board')).toContainText('Recados entregados');
  await expect(page.locator('#board')).toContainText('Tu finca: 1');
});

test('gallego por claves', async ({ page }) => {
  await boot(page);
  await page.click('#btn-menu');
  await page.clock.runFor(200);
  await page.click('button[lang="gl"]');
  await page.clock.runFor(200);
  await expect(page.locator('#menu')).toContainText('Exportar a partida');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('gl');
  await page.keyboard.press('Escape');
  await tapOn(page, { sector: '1,0' });
  await expect(page.locator('[data-action="reveal"]')).toContainText('Abrir o sector');
  await expect(page.locator('[data-action="reveal"]')).toContainText('0,10 kWh, 5 min, remata ás 10:05');
});

test('exportar la partida y cargarla en otro navegador da el mismo hash', async ({ page, browser }) => {
  await boot(page);
  await tapOn(page, { sector: '0,1' });
  await page.locator('[data-action="reveal"]').click();
  await page.clock.runFor(2000);
  await page.click('#btn-menu');
  await page.clock.runFor(200);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export"]')]);
  const path = await download.path();
  const text = readFileSync(path, 'utf8');
  const data = JSON.parse(text) as { format: string; log: unknown[]; check: { tick: number; hash: string } };
  expect(data.format).toBe('distritos-partida');
  expect(data.log).toHaveLength(1);
  expect(data.check.hash).toMatch(/^[0-9a-f]{64}$/);

  const other = await browser.newContext({ timezoneId: 'Europe/Madrid', locale: 'es-ES' });
  const page2 = await other.newPage();
  await boot(page2, '2026-10-20T12:00:00+02:00');
  await page2.click('#btn-menu');
  await page2.clock.runFor(200);
  await page2.setInputFiles('#import-file', {
    name: 'partida.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await page2.clock.runFor(200);
  await page2.click('[data-action="import-yes"]');
  await page2.clock.runFor(300);
  await expect(page2.locator('#toast')).toContainText(`el hash coincide en t=${data.check.tick}`);
  expect(
    await page2.evaluate(() => (window as unknown as { distritos: Hook }).distritos.save.log.length),
  ).toBe(1);
  await other.close();
});

test('el informe de la prueba repite una partida exportada y la resume por día', async ({ page }) => {
  await boot(page);
  await tapOn(page, { sector: '1,0' });
  await page.locator('[data-action="reveal"]').click();
  await page.clock.runFor(2000);
  await page.click('#btn-menu');
  await page.clock.runFor(200);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export"]')]);
  const text = readFileSync(await download.path(), 'utf8');

  await page.goto('/informe.html');
  await page.setInputFiles('#files', {
    name: 'probador-1.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  const summary = page.locator('#summary');
  await expect(summary).toContainText('probador-1.json');
  await expect(summary).toContainText('coincide');
  await expect(summary).toContainText('1 de 1');
  await expect(page.locator('#detail')).toContainText('abrir 1');
  await expect(page.locator('#detail')).toContainText('Europe/Madrid');
});
