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
  it('un sector oculto vecino se puede abrir y dice cuánto cuesta y cuándo se abre', () => {
    const s = createScene(params, content);
    const sheet = sheetFor(ctx(s), { kind: 'sector', hex: '1,0', pos: { x: 0, y: 0 } }, null);
    expect(sheet?.actions.map((a) => a.id)).toEqual(['reveal']);
    expect(sheet?.actions[0]).toMatchObject({ enabled: true });
    // La primera apertura dura 30 s desde que llega el obrero (P14).
    expect(sheet?.actions[0]?.meta).toBe('0,10 kWh, se abre a las 08:00');
    expect(sheet?.worker?.id).toBeDefined();
    // Con alguien yendo, y luego con la apertura en marcha, ya no se ofrece.
    const log: Order[] = [
      { seq: 1, tick: 0, actor: 'local', kind: 'reveal', args: { mobile: 'm1', hex: '1,0' } },
    ];
    advance(s, log, 1, content);
    expect(sheetFor(ctx(s, log), { kind: 'sector', hex: '1,0', pos: { x: 0, y: 0 } }, null)).toMatchObject({
      lines: [expect.stringMatching(/ va a empezar a abrirlo$/)],
      actions: [],
    });
    advance(s, log, 20, content);
    expect(sheetFor(ctx(s, log), { kind: 'sector', hex: '1,0', pos: { x: 0, y: 0 } }, null)).toMatchObject({
      lines: ['Abriéndose: se abre a las 08:00'],
      actions: [],
    });
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
    // La casa es sitio de recados (P15): el encargo del día sale de ella, con lo que se lleva.
    expect(sheet?.lines).toContain('Recados: 1 de 2 bultos; pagan 4 Águilas');
    expect(sheet?.lines).toContainEqual({
      picto: 'comida',
      text: '3 raciones de casa al almacén común',
      title: 'Comida: 1 lote de comida de casa',
    });
    expect(byId.rename?.next).toEqual({ kind: 'rename', element: 'e1' });
  });

  it('renombrar: el campo con el nombre de ahora; guardar lo escrito o volver al de siempre', () => {
    const s = createScene(params, content);
    const sheet = sheetFor(ctx(s), { kind: 'rename', element: 'e11' }, null);
    expect(sheet).toMatchObject({
      title: 'Casa vecina del noroeste',
      lines: ['Hasta 24 letras'],
      input: { value: '', max: 24, placeholder: 'Casa vecina del noroeste' },
    });
    expect(sheet?.actions.map((a) => a.id)).toEqual(['rename-save', 'cancel']);
    expect(sheet?.actions[0]).toMatchObject({
      takesInput: true,
      intent: { kind: 'rename', args: { element: 'e11' } },
    });
    const log: Order[] = [
      { seq: 1, tick: 0, actor: 'local', kind: 'rename', args: { element: 'e11', name: 'Casa da Carmiña' } },
    ];
    advance(s, log, 1, content);
    const named = sheetFor(ctx(s, log), { kind: 'rename', element: 'e11' }, null);
    expect(named?.title).toBe('Casa da Carmiña');
    expect(named?.actions.map((a) => a.id)).toEqual(['rename-save', 'rename-reset', 'cancel']);
    // El nombre se usa en las hojas de los demás sitios: «a Casa da Carmiña».
    expect(sheetFor(ctx(s, log), { kind: 'element', id: 'e10' }, null)?.lines).toContainEqual(
      expect.objectContaining({ text: 'A Casa da Carmiña' }),
    );
    const worker = sheetFor(ctx(s, log), { kind: 'rename', mobile: 'm1' }, null);
    expect(worker?.input?.value).toBe(s.mobiles.m1?.name);
  });

  it('sacar agua: la primera vez, corta; después, de jornada y dice lo que dará', () => {
    const s = createScene(params, content);
    s.elements.e5!.store!.agua = 0;
    const first = sheetFor(ctx(s), { kind: 'element', id: 'e5' }, null);
    expect(first?.actions.find((a) => a.id === 'task:sacar_agua')?.meta).toBe('2 min, termina a las 08:02');
    // Ya no es la primera vez: 40 L por hora hasta llenar el pozo (200 L), dentro de la luz de trabajo.
    s.actors.local!.started = { 'task:sacar_agua': 1 };
    const later = sheetFor(ctx(s), { kind: 'element', id: 'e5' }, null);
    expect(later?.actions.find((a) => a.id === 'task:sacar_agua')?.meta).toBe(
      'da 200 L, 5 h, termina a las 13:00',
    );
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
  it('un sitio dice qué recados tiene, con el pictograma de su tipo y adónde van, y ofrece una ruta', () => {
    const s = createScene(params, content);
    const sheet = sheetFor(ctx(s), { kind: 'element', id: 'e8' }, null);
    expect(sheet?.title).toBe('Almacén común');
    expect(sheet?.lines).toEqual([
      'Comida: 0 de 600 raciones',
      'Del común',
      'Recados: 7 de 12 bultos; pagan 7 Águilas',
      { picto: 'comida', text: 'A la casa vecina del sur', title: 'Comida: 1 lote de conservas' },
      { picto: 'combustible', text: 'A la cocina común ×3', title: 'Combustible: 3 haces de leña' },
    ]);
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
      '1. Almacén común: recoge 2',
      '2. Cocina común: entrega 2',
      'Toca otro sitio para añadir una parada',
    ]);
    expect(sheet?.actions.map((a) => a.id)).toEqual(['route-go', 'route-undo', 'cancel']);
    expect(sheet?.actions[0]?.meta).toBe('2 min, termina a las 08:02, entrega 2, cobra 4 Águilas');
    expect(sheet?.actions[1]?.next).toEqual({ kind: 'route', mobile: 'm1', stops: ['e8'] });
    expect(sheet?.candidates).toEqual(['e1', 'e10', 'e11', 'e12', 'e13', 'e7', 'e8']);
    // Saliendo de casa, el encargo del día va en la ruta: se recoge allí y se entrega en el almacén.
    const home = sheetFor(ctx(s), { kind: 'route', mobile: 'm1', stops: ['e1', 'e8', 'e9'] }, null);
    expect(home?.lines.slice(0, 3)).toEqual([
      '1. Casa: recoge 1',
      '2. Almacén común: entrega 1 y recoge 2',
      '3. Cocina común: entrega 2',
    ]);
    expect(home?.actions[0]?.meta).toBe('3 min, termina a las 08:03, entrega 3, cobra 8 Águilas');
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
    expect(going?.lines.slice(2)).toEqual([
      'Carga: 2 de 4 bultos',
      { picto: 'comida', text: 'A la casa vecina del sur', title: 'Comida: 1 pan' },
      { picto: 'comida', text: 'Al dispensario', title: 'Comida: 1 pan' },
    ]);
    expect(going?.actions.find((a) => a.id === 'route-cancel')?.meta).toMatch(/^Se queda en el dispensario /);
    log.push({ seq: 2, tick: s.tick, actor: 'local', kind: 'cancel', args: { mobile: 'm1' } });
    advance(s, log, plan[1]!.leave + 1, content);
    const stopped = sheetFor(ctx(s, log), { kind: 'mobile', id: 'm1' }, null);
    expect(stopped?.lines).toEqual([
      'Trabajo de peón',
      'Libre',
      'Carga: 1 de 4 bultos',
      { picto: 'comida', text: 'A la casa vecina del sur', title: 'Comida: 1 pan' },
    ]);
    expect(stopped?.actions.map((a) => a.id)).toEqual(['home', 'route', 'unload', 'rename']);
    expect(stopped?.actions[2]).toMatchObject({ enabled: true, meta: 'Deja 1 de 1' });
    // La pizarra: lo que queda en cada sitio del común, lo que espera en casa y lo entregado.
    expect(errandBoard(ctx(s, log))).toEqual({
      places: [
        'Almacén común: 4 recados',
        'Cocina común: 2 recados',
        'Dispensario: 2 recados',
        'Punto de carga: 2 recados',
      ],
      open: 10,
      home: 1,
      delivered: { local: 1 },
    });
  });
});
