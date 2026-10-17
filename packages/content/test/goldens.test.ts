/**
 * Dorados con las tablas del repositorio: el mismo fixture lo ejecuta Playwright en Chromium
 * (packages/client/e2e) y compara con estos hashes. Regenerar tras un cambio deliberado de
 * tablas o reglas con UPDATE_GOLDENS=1 y anotar la línea en el registro de decisiones.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { advance, createScene, hashState, replay, type OrderLog, type SceneParams } from '@distritos/sim';
import { content } from '../src/index.js';

interface Checkpoint {
  tick: number;
  hash: string;
  view: string;
}

interface Fixture {
  name: string;
  params: SceneParams;
  orders: OrderLog;
  contentHash: string;
  checkpoints: Checkpoint[];
}

const FILE = join(import.meta.dirname, 'fixtures', 'f0-real.json');
const UPDATE = process.env.UPDATE_GOLDENS === '1';

describe('fixture dorado con las tablas reales', () => {
  it('f0-real: advance y replay coinciden con los dorados', () => {
    const fixture = JSON.parse(readFileSync(FILE, 'utf8')) as Fixture;
    const c = content();
    const actor = fixture.params.actors[0]?.id ?? 'sys';
    const state = createScene(fixture.params, c);
    const computed: Checkpoint[] = [];
    for (const cp of fixture.checkpoints) {
      advance(state, fixture.orders, cp.tick, c);
      const hash = hashState(state);
      expect(hashState(replay(fixture.params, fixture.orders, cp.tick, c))).toBe(hash);
      computed.push({ tick: cp.tick, hash, view: hashState(state, { actor }) });
    }
    if (UPDATE) {
      fixture.contentHash = c.hash;
      fixture.checkpoints = computed;
      writeFileSync(FILE, `${JSON.stringify(fixture, null, 2)}\n`);
      return;
    }
    expect(fixture.contentHash, 'hash del contenido (UPDATE_GOLDENS=1 para regenerar)').toBe(c.hash);
    for (let i = 0; i < computed.length; i++) {
      expect(fixture.checkpoints[i]?.hash, `dorado del tick ${computed[i]?.tick}`).toBe(computed[i]?.hash);
      expect(fixture.checkpoints[i]?.view, `vista dorada del tick ${computed[i]?.tick}`).toBe(
        computed[i]?.view,
      );
    }
  });
});
