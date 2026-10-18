/**
 * Recados y rutas (diseño de la casa §17, opción B). Contenido de prueba F1 con recados: día de
 * 6 000 ticks, luz de trabajo de 1 700 a 4 300, paradas de 60 ticks (la primera ruta, de 10).
 *
 * Sitios: e7 punto de carga, e8 almacén, e9 cocina, e10 y e11 casas vecinas.
 */

import { describe, expect, it } from 'vitest';
import { planRoute } from '../src/rules/errands.js';
import { quote } from '../src/rules/quote.js';
import { validate } from '../src/rules/orders.js';
import { createScene, type SceneParams } from '../src/scene.js';
import { advance } from '../src/step.js';
import type { Event } from '../src/types/events.js';
import type { Order, OrderArgs, OrderKind } from '../src/types/orders.js';
import type { Errand, SimState } from '../src/types/state.js';
import { testContentF1R } from './content.js';

const content = testContentF1R();
const params: SceneParams = {
  kind: 'district',
  template: 'f1_solo',
  seed: '00000000000000aa',
  actors: [{ id: 'santi', plot: 'p1' }],
};
const PUNTO = 'e7';
const ALMACEN = 'e8';
const COCINA = 'e9';
const CASA_A = 'e10';
const CASA_B = 'e11';

function scene(p: SceneParams = params): SimState {
  return createScene(p, content);
}

let seq = 0;
function o<K extends OrderKind>(tick: number, kind: K, args: OrderArgs[K], actor = 'santi'): Order {
  seq += 1;
  return { seq, tick, actor, kind, args };
}

function v(s: SimState, kind: OrderKind, args: unknown, actor = 'santi'): string | null {
  return validate(s, { actor, kind, args } as never, content);
}

function errands(s: SimState): Errand[] {
  return Object.values(s.district.errands?.items ?? {}).sort((a, b) => a.id - b.id);
}

function at(s: SimState, place: string): Errand[] {
  return errands(s).filter((r) => r.at === place);
}

function carried(s: SimState, mobile: string): Errand[] {
  return errands(s).filter((r) => r.carrier === mobile);
}

function load(s: SimState, place: string): number {
  return at(s, place).reduce((n, r) => n + r.size, 0);
}

describe('sitios', () => {
  it('generan sus recados al crear la escena y cada cierto tiempo, hasta su tope', () => {
    const s = scene();
    expect(errands(s).map((r) => [r.kind, r.at, r.to])).toEqual([
      ['bateria_carga', PUNTO, CASA_A],
      ['conservas', ALMACEN, CASA_A],
      ['conservas', ALMACEN, CASA_B],
      ['pan', COCINA, CASA_A],
    ]);
    expect(s.district.errands?.nextAt).toEqual({ e10: 1500, e11: 1500, e7: 900, e8: 600, e9: 500 });
    // Sin nadie que recoja, al cabo de dos días cada sitio está en su tope y no genera más.
    advance(s, [], 12_000, content);
    for (const [place, cap] of [
      [PUNTO, 3],
      [ALMACEN, 4],
      [CASA_A, 2],
      [CASA_B, 2],
    ] as const) {
      expect(load(s, place), place).toBeLessThanOrEqual(cap);
      expect(load(s, place), place).toBeGreaterThanOrEqual(cap - 1);
    }
    // El pan caduca si nadie lo recoge: en la cocina solo queda el de las últimas 3 000.
    for (const r of at(s, COCINA)) expect(r.expires).toBeGreaterThan(12_000);
  });
});

describe('rutas', () => {
  it('el horario se sabe al dar la orden y se cumple; en cada parada entrega y recoge lo más cercano primero', () => {
    const s = scene();
    const intent = {
      actor: 'santi',
      kind: 'route' as const,
      args: { mobile: 'm1', stops: [ALMACEN, COCINA, CASA_A, CASA_B] },
    };
    const q = quote(s, intent, content);
    // De noche: el trabajo son las cuatro paradas cortas de la primera ruta; la espera la dice el fin.
    expect(q).toMatchObject({ cost: {}, work: 4 * 10, arrive: 138, end: 1871 });
    const events: Event[] = advance(s, [o(0, 'route', intent.args)], 2_200, content);
    expect(events.find((e) => e.kind === 'job_done' && e.mobile === 'm1')?.tick).toBe(q!.end);
    // En el almacén (de noche espera la luz): leña para la cocina (la parada más cercana) y
    // conservas para las dos casas, hasta los 4 bultos del peón.
    const picked = events.filter((e) => e.kind === 'errand_picked');
    expect(
      picked.filter((e) => e.tick === 1710).map((e) => (e.kind === 'errand_picked' ? e.errand : 0)),
    ).toEqual([6, 2, 3]);
    // En la cocina entrega la leña y solo le caben dos panes, los de la casa más cercana.
    expect(
      picked.filter((e) => e.tick === 1768).map((e) => (e.kind === 'errand_picked' ? e.errand : 0)),
    ).toEqual([4, 7]);
    const delivered = events.filter((e) => e.kind === 'errand_delivered');
    expect(delivered.map((e) => (e.kind === 'errand_delivered' ? [e.errand, e.tick, e.pay] : []))).toEqual([
      [6, 1768, 2],
      [2, 1790, 1],
      [4, 1790, 1],
      [7, 1790, 1],
      [3, 1871, 1],
    ]);
    expect(s.district.errands?.delivered).toEqual({ santi: 5 });
    expect(carried(s, 'm1')).toEqual([]);
    expect(s.mobiles.m1!.where).toMatchObject({ kind: 'at', element: CASA_B });
  });

  it('lo que no cabe se queda; con la carga llena no recoge nada; la segunda ruta tiene paradas largas', () => {
    // La técnica lleva 3: en el almacén, la leña (2) y unas conservas (1); las otras no caben.
    const s = scene();
    const a = advance(
      s,
      [o(0, 'route', { mobile: 'm2', stops: [ALMACEN, COCINA, CASA_A, CASA_B] })],
      1_750,
      content,
    );
    const pickedA = a
      .filter((e) => e.kind === 'errand_picked')
      .map((e) => (e.kind === 'errand_picked' ? e.errand : 0));
    expect(pickedA).toEqual([6, 2]);
    expect(at(s, ALMACEN).map((r) => r.id)).toContain(3);
    // El peón llena los 4 en la cocina y ya no recoge nada en el almacén.
    const full = scene();
    advance(full, [], 1_800, content);
    const stops = [COCINA, ALMACEN, CASA_A, CASA_B];
    const plan = planRoute(full, content, full.mobiles.m1!, 'santi', stops)!;
    const events = advance(full, [o(1_800, 'route', { mobile: 'm1', stops })], 2_200, content);
    const picked = events.filter((e) => e.kind === 'errand_picked');
    expect(picked.map((e) => (e.kind === 'errand_picked' ? [e.errand, e.tick] : []))).toEqual([
      [4, plan[0]!.leave],
      [7, plan[0]!.leave],
      [5, plan[0]!.leave],
      [10, plan[0]!.leave],
    ]);
    expect(picked.some((e) => e.tick === plan[1]!.leave)).toBe(false);
    // Segunda ruta del mismo actor: paradas de 60 ticks.
    const second = scene();
    advance(second, [o(0, 'route', { mobile: 'm1', stops: [ALMACEN] })], 1_800, content);
    const q = quote(
      second,
      { actor: 'santi', kind: 'route', args: { mobile: 'm1', stops: [COCINA, CASA_A] } },
      content,
    );
    expect(q!.work).toBe(2 * 60);
  });

  it('cancelar acaba la ruta en la parada a la que va: entrega allí y no recoge', () => {
    const s = scene();
    const log = [o(1_800, 'route', { mobile: 'm1', stops: [ALMACEN, COCINA, CASA_A, CASA_B] })];
    advance(s, log, 1_801, content);
    expect(v(s, 'cancel', { mobile: 'm2' })).toBe('no_route');
    const events = advance(s, [...log, o(1_801, 'cancel', { mobile: 'm1' })], 3_000, content);
    expect(events.find((e) => e.kind === 'route_cancelled')).toBeDefined();
    expect(s.mobiles.m1!.job).toBeNull();
    expect(s.mobiles.m1!.where).toMatchObject({ kind: 'at', element: ALMACEN });
    expect(events.filter((e) => e.kind === 'errand_picked')).toHaveLength(0);
    expect(v(s, 'cancel', { mobile: 'm1' })).toBe('no_route');
  });

  it('dejar la carga en un sitio: hasta su tope, no caduca y solo la recoge quien la dejó', () => {
    const two: SceneParams = {
      kind: 'district',
      template: 'f1_dos',
      seed: '00000000000000aa',
      actors: [
        { id: 'a', plot: 'p1' },
        { id: 'b', plot: 'p2' },
      ],
    };
    // Con dos fincas, los sitios son e13 punto de carga, e14 almacén, e15 cocina, e16 y e17 casas.
    const s = scene(two);
    const log: Order[] = [
      o(1_800, 'route', { mobile: 'm1', stops: ['e15', 'e17', 'e16'] }, 'a'),
      o(1_930, 'cancel', { mobile: 'm1' }, 'a'),
    ];
    advance(s, log, 2_100, content);
    // En la cocina llenó los 4 (el pan de la casa B primero); la ruta acabó en la casa B.
    expect(s.mobiles.m1!.where).toMatchObject({ kind: 'at', element: 'e17' });
    expect(carried(s, 'm1').map((r) => r.id)).toEqual([5, 6, 8]);
    expect(v(s, 'unload', { mobile: 'm2' }, 'a')).toBe('not_a_place');
    log.push(o(2_100, 'unload', { mobile: 'm1' }, 'a'));
    const dropped = advance(s, log, 3_600, content);
    // La casa B tenía una cesta (1 de 2): cabe un pan, el más antiguo.
    expect(
      dropped
        .filter((e) => e.kind === 'errand_dropped')
        .map((e) => (e.kind === 'errand_dropped' ? e.errand : 0)),
    ).toEqual([5]);
    expect(carried(s, 'm1').map((r) => r.id)).toEqual([6, 8]);
    // El pan dejado tenía que caducar en 3 500, pero ya es de alguien: sigue ahí.
    expect(at(s, 'e17').find((r) => r.id === 5)).toMatchObject({ holder: 'a', expires: 3_500 });
    // Otro actor pasa por allí y no lo coge; un obrero del mismo actor, sí, y cobra quien lo recogió.
    log.push(o(3_600, 'route', { mobile: 'm3', stops: ['e17', 'e16'] }, 'b'));
    const b = advance(s, log, 3_900, content);
    expect(b.filter((e) => e.kind === 'errand_picked')).toEqual([]);
    log.push(o(3_900, 'route', { mobile: 'm2', stops: ['e17', 'e16'] }, 'a'));
    const a = advance(s, log, 4_300, content);
    expect(a.find((e) => e.kind === 'errand_delivered')).toMatchObject({ errand: 5, actor: 'a', pay: 1 });
    expect(s.district.errands?.delivered).toEqual({ a: 2 });
  });
});

describe('rechazos', () => {
  it('rutas mal formadas, sitios que no lo son y obreros ocupados', () => {
    const s = scene();
    expect(v(s, 'route', { mobile: 'm1', stops: [] })).toBe('bad_route');
    expect(v(s, 'route', { mobile: 'm1', stops: [ALMACEN, ALMACEN] })).toBe('bad_route');
    expect(
      v(s, 'route', { mobile: 'm1', stops: [ALMACEN, COCINA, ALMACEN, COCINA, ALMACEN, COCINA, ALMACEN] }),
    ).toBe('bad_route');
    expect(v(s, 'route', { mobile: 'm1', stops: ['e1'] })).toBe('not_a_place');
    expect(v(s, 'route', { mobile: 'm1', stops: ['e99'] })).toBe('unknown_element');
    expect(v(s, 'route', { mobile: 'm1', stops: 'e8' })).toBe('bad_args');
    expect(v(s, 'route', { mobile: 'm1', stops: [ALMACEN, COCINA] })).toBeNull();
    advance(s, [o(0, 'route', { mobile: 'm1', stops: [ALMACEN, COCINA] })], 1, content);
    expect(v(s, 'route', { mobile: 'm1', stops: [COCINA] })).toBe('busy');
    expect(v(s, 'unload', { mobile: 'm1' })).toBe('busy');
    expect(v(s, 'unload', { mobile: 'm2' })).toBe('not_a_place');
  });
});
