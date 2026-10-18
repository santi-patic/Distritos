import { describe, expect, it } from 'vitest';
import { content as loadContent } from '@distritos/content';
import { advance, createScene, planRoute, type Order, type SimState } from '@distritos/sim';
import { chooseWorker, errandBoard, sheetFor, type Ctx } from '../src/actions.js';
import { DICTIONARIES } from '../src/i18n.js';

const content = loadContent();
const params = {
  kind: 'district' as const,
  template: 'f1_casa',
  seed: 'f1f1f1f1f1f1f1f1',
  actors: [{ id: 'local', plot: 'p1' }],
  dayOffset: 10 * 36_000,
};

function ctx(state: SimState, log: Order[] = []): Ctx {
  return {
    state,
    content,
    actor: 'local',
    anchorMs: Date.UTC(2026, 9, 19, 8),
    nowMs: Date.UTC(2026, 9, 19, 8),
    log,
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

/**
 * Recados en la plantilla de la casa: e7 punto de carga, e8 almacén, e9 cocina, e10 dispensario,
 * e11–e13 casas vecinas (noroeste, este, sur). Al empezar, el almacén tiene leña para la cocina y
 * conservas para la casa del noroeste; la cocina, pan para el dispensario y para la casa del sur.
 */
describe('recados', () => {
  it('un sitio dice qué recados tiene y adónde van, y ofrece hacer una ruta desde ahí', () => {
    const s = createScene(params, content);
    const sheet = sheetFor(ctx(s), { kind: 'element', id: 'e8' }, null);
    expect(sheet?.title).toBe('Almacén común');
    expect(sheet?.lines).toEqual(
      expect.arrayContaining([
        'Recados: 3 de 6 bultos; pagan 3 Águilas',
        '1 haz de leña a la cocina común',
        '1 lote de conservas a la casa vecina del noroeste',
      ]),
    );
    expect(sheet?.actions.find((a) => a.id === 'route')?.next).toEqual({
      kind: 'route',
      mobile: 'm1',
      stops: ['e8'],
    });
    // Las casas vecinas se distinguen por hacia dónde caen.
    expect(['e11', 'e12', 'e13'].map((id) => sheetFor(ctx(s), { kind: 'element', id }, null)?.title)).toEqual(
      ['Casa vecina del noroeste', 'Casa vecina del este', 'Casa vecina del sur'],
    );
  });

  it('la ruta que se prepara numera las paradas y dice cuándo termina, cuánto entrega y qué cobra', () => {
    const s = createScene(params, content);
    const sheet = sheetFor(ctx(s), { kind: 'route', mobile: 'm1', stops: ['e8', 'e9'] }, null);
    expect(sheet?.lines).toEqual([
      '1. Almacén común: recoge 1',
      '2. Cocina común: entrega 1',
      'Toca otro sitio para añadir una parada',
    ]);
    expect(sheet?.actions.map((a) => a.id)).toEqual(['route-go', 'route-undo', 'cancel']);
    expect(sheet?.actions[0]?.meta).toMatch(/^2 min, termina .+, entrega 1, cobra 2 Águilas$/);
    expect(sheet?.actions[1]?.next).toEqual({ kind: 'route', mobile: 'm1', stops: ['e8'] });
    expect(sheet?.candidates).toEqual(['e10', 'e11', 'e12', 'e13', 'e7', 'e8']);
    const empty = sheetFor(ctx(s), { kind: 'route', mobile: 'm1', stops: [] }, null);
    expect(empty?.lines).toEqual(['Toca los sitios en el orden de la ruta']);
    expect(empty?.actions[0]).toMatchObject({ id: 'route-go', enabled: false });
  });

  it('en ruta se puede cancelar; parado con carga en un sitio, dejarla allí', () => {
    const s = createScene(params, content);
    // Cocina, dispensario y casa del sur: en la cocina recoge los dos panes.
    const stops = ['e9', 'e10', 'e13'];
    const plan = planRoute(s, content, s.mobiles.m1!, 'local', stops)!;
    const log: Order[] = [{ seq: 1, tick: 0, actor: 'local', kind: 'route', args: { mobile: 'm1', stops } }];
    advance(s, log, plan[0]!.leave + 1, content);
    const going = sheetFor(ctx(s, log), { kind: 'mobile', id: 'm1' }, null);
    expect(going?.lines[1]).toMatch(/^En ruta: va al dispensario \(2 de 3\)\. Termina /);
    expect(going?.lines).toEqual(
      expect.arrayContaining([
        'Carga: 2 de 4 bultos',
        '1 pan al dispensario',
        '1 pan a la casa vecina del sur',
      ]),
    );
    expect(going?.actions.find((a) => a.id === 'route-cancel')?.meta).toMatch(/^Se queda en el dispensario /);
    log.push({ seq: 2, tick: s.tick, actor: 'local', kind: 'cancel', args: { mobile: 'm1' } });
    advance(s, log, plan[1]!.leave + 1, content);
    const stopped = sheetFor(ctx(s, log), { kind: 'mobile', id: 'm1' }, null);
    expect(stopped?.lines).toEqual([
      'Trabajo de peón',
      'Libre',
      'Carga: 1 de 4 bultos',
      '1 pan a la casa vecina del sur',
    ]);
    expect(stopped?.actions.map((a) => a.id)).toEqual(['home', 'route', 'unload']);
    expect(stopped?.actions[2]).toMatchObject({ enabled: true, meta: 'Deja 1 de 1' });
    // La pizarra: lo que queda en cada sitio y lo entregado por la finca.
    expect(errandBoard(ctx(s, log))).toEqual({
      places: ['Almacén común: 2 recados', 'Dispensario: 1 recado', 'Punto de carga: 1 recado'],
      delivered: { local: 1 },
    });
  });
});
