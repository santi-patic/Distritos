import { describe, expect, it } from 'vitest';
import { content as loadContent } from '@distritos/content';
import { advance, createScene, type Order, type SimState } from '@distritos/sim';
import { chooseWorker, sheetFor, type Ctx } from '../src/actions.js';
import { DICTIONARIES } from '../src/i18n.js';

const content = loadContent();
const params = {
  kind: 'district' as const,
  template: 'f1_casa',
  seed: 'f1f1f1f1f1f1f1f1',
  actors: [{ id: 'local', plot: 'p1' }],
  dayOffset: 10 * 36_000,
};

function ctx(state: SimState): Ctx {
  return {
    state,
    content,
    actor: 'local',
    anchorMs: Date.UTC(2026, 9, 19, 8),
    nowMs: Date.UTC(2026, 9, 19, 8),
  };
}

describe('hoja de lo tocado', () => {
  it('un sector oculto vecino se puede abrir y dice cuánto cuesta y dura', () => {
    const s = createScene(params, content);
    const sheet = sheetFor(ctx(s), { kind: 'sector', hex: '1,0', pos: { x: 0, y: 0 } }, null);
    expect(sheet?.actions.map((a) => a.id)).toEqual(['reveal']);
    expect(sheet?.actions[0]).toMatchObject({ enabled: true });
    expect(sheet?.actions[0]?.meta).toMatch(/^0,10 kWh, 5 min, termina /);
    expect(sheet?.worker?.id).toBeDefined();
    // Uno lejano no: no tiene vecino abierto.
    const far = sheetFor(ctx(s), { kind: 'sector', hex: '0,3', pos: { x: 0, y: 0 } }, null);
    expect(far?.actions[0]).toMatchObject({
      enabled: false,
      meta: 'Solo se abre junto a un sector abierto.',
    });
  });

  it('la casa: contratar sin cama libre no se puede, y los nexos sin otro extremo tampoco', () => {
    const s = createScene(params, content);
    const sheet = sheetFor(ctx(s), { kind: 'element', id: 'e1' }, null);
    const byId = Object.fromEntries(sheet?.actions.map((a) => [a.id, a]) ?? []);
    expect(byId['hire:obrero_peon']).toMatchObject({ enabled: false });
    expect(byId['hire:obrero_peon']?.meta).toContain('No hay cama libre');
    expect(byId['link:cable']).toMatchObject({ enabled: false });
    expect(byId['link:camino']).toMatchObject({ enabled: true });
    expect(sheet?.lines).toContain('Comida: 20 de 60 raciones');
  });

  it('el obrero elegido si está libre; si no, el libre más cercano', () => {
    const s = createScene(params, content);
    const log: Order[] = [
      { seq: 1, tick: 0, actor: 'local', kind: 'reveal', args: { mobile: 'm1', hex: '1,0' } },
    ];
    advance(s, log, 1, content);
    expect(chooseWorker(ctx(s), 'm1', { x: 0, y: 0 })?.id).toBe('m2');
    expect(chooseWorker(ctx(s), 'm2', null)?.id).toBe('m2');
  });

  it('los dos idiomas tienen las mismas claves', () => {
    expect(Object.keys(DICTIONARIES.gl).sort()).toEqual(Object.keys(DICTIONARIES.es).sort());
  });
});
