/**
 * Prueba entre runtimes (esquema §17): los fixtures dorados que vitest verifica en Node se
 * ejecutan aquí en Chromium, con el mismo paquete sim empaquetado por Vite, y los hashes
 * tienen que coincidir con los comprometidos en el repositorio.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const ROOT = join(import.meta.dirname, '..', '..');

interface Checkpoint {
  tick: number;
  hash: string;
  view: string;
}

interface Fixture {
  name: string;
  content?: string;
  params: unknown;
  orders: unknown[];
  contentHash?: string;
  checkpoints: Checkpoint[];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/fixtures.html');
  await page.waitForFunction(
    () => (window as unknown as { __distritos?: { ready?: boolean } }).__distritos?.ready === true,
  );
});

for (const name of ['f0-basic', 'f1-basic', 'f1-recados']) {
  test(`${name} (contenido de prueba) da en Chromium los hashes dorados de Node`, async ({ page }) => {
    const fixture = readJson(join(ROOT, 'sim', 'test', 'fixtures', `${name}.json`)) as Fixture;
    const tables = readJson(join(ROOT, 'sim', 'test', fixture.content ?? 'content.json'));
    const got = await page.evaluate(
      (req) =>
        (window as unknown as { __distritos: { run: (r: unknown) => Checkpoint[] } }).__distritos.run(req),
      {
        params: fixture.params,
        orders: fixture.orders,
        ticks: fixture.checkpoints.map((c) => c.tick),
        tables,
      },
    );
    expect(got).toEqual(fixture.checkpoints);
  });
}

test('f1-real (tablas del repositorio) da en Chromium los hashes dorados de Node', async ({ page }) => {
  const fixture = readJson(join(ROOT, 'content', 'test', 'fixtures', 'f1-real.json')) as Fixture;
  const contentHash = await page.evaluate(
    () => (window as unknown as { __distritos: { contentHash: string } }).__distritos.contentHash,
  );
  expect(contentHash).toBe(fixture.contentHash);
  const got = await page.evaluate(
    (req) =>
      (window as unknown as { __distritos: { run: (r: unknown) => Checkpoint[] } }).__distritos.run(req),
    {
      params: fixture.params,
      orders: fixture.orders,
      ticks: fixture.checkpoints.map((c) => c.tick),
      tables: null,
    },
  );
  expect(got).toEqual(fixture.checkpoints);
});
