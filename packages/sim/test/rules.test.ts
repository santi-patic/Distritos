import { describe, expect, it } from 'vitest';
import { light } from '../src/calendar.js';
import { center, keyOf, parse } from '../src/hex.js';
import { arrivalTick, positionOf } from '../src/rules/movement.js';
import { validate } from '../src/rules/orders.js';
import { createScene, type SceneParams } from '../src/scene.js';
import { advance, step } from '../src/step.js';
import type { Event } from '../src/types/events.js';
import type { Order } from '../src/types/orders.js';
import type { SimState } from '../src/types/state.js';
import { testContent } from './content.js';

const content = testContent();

const solo: SceneParams = {
  kind: 'district',
  template: 'f0_solo',
  seed: '0123456789abcdef',
  actors: [{ id: 'santi', plot: 'p1' }],
};

function order(seq: number, tick: number, actor: string, kind: Order['kind'], args: Order['args']): Order {
  return { seq, tick, actor, kind, args };
}

function kinds(events: Event[]): string[] {
  return events.map((e) => e.kind);
}

describe('escena', () => {
  it('crea el terreno con 37 sectores, el central abierto y la dotación inicial', () => {
    const s = createScene(solo, content);
    expect(Object.keys(s.map.sectors)).toHaveLength(37);
    const centre = s.map.sectors['0,0'];
    expect(centre?.status).toBe('revealed');
    expect(centre?.revealedBy).toBe('santi');
    expect(centre?.terrain).toBe('prado');
    expect(Object.keys(s.hidden.sectorContents)).toHaveLength(36);
    expect(Object.keys(s.elements)).toHaveLength(4);
    expect(s.elements.e1?.kind).toBe('casa');
    expect(Object.keys(s.mobiles)).toHaveLength(1);
    expect(s.mobiles.m1?.where).toEqual({ kind: 'at', pos: { x: 0, y: 0 }, element: 'e1' });
    expect(s.mobiles.m1?.name).toBeDefined();
    expect(s.plots.p1?.owner).toBe('santi');
    expect(s.actors.santi?.stocks.energia).toBe(3_600_000);
    expect(s.scene.contentHash).toBe(content.hash);
  });

  it('la misma semilla da la misma escena; otra semilla, otra', () => {
    const a = createScene(solo, content);
    const b = createScene(solo, content);
    const c = createScene({ ...solo, seed: 'fedcba9876543210' }, content);
    expect(a).toEqual(b);
    expect(a.hidden).not.toEqual(c.hidden);
  });

  it('rechaza plantillas, terrenos y semillas inválidos', () => {
    expect(() => createScene({ ...solo, template: 'nada' }, content)).toThrow(/plantilla/);
    expect(() => createScene({ ...solo, actors: [{ id: 'x', plot: 'p9' }] }, content)).toThrow(/terreno/);
    expect(() => createScene({ ...solo, seed: 'XYZ' }, content)).toThrow(/semilla/);
    expect(() =>
      createScene(
        {
          ...solo,
          actors: [
            { id: 'a', plot: 'p1' },
            { id: 'b', plot: 'p1' },
          ],
        },
        content,
      ),
    ).toThrow(/ocupado/);
  });
});

describe('movimiento', () => {
  it('la llegada es ceil(dist·1000 / (velocidad·tickMs)), al menos un tick', () => {
    // 20 m/s a 100 ms son 2 m por tick: 100 m son 50 ticks.
    expect(arrivalTick({ x: 0, y: 0 }, { x: 100_000, y: 0 }, 20_000, 100, 10)).toBe(60);
    expect(arrivalTick({ x: 0, y: 0 }, { x: 100_001, y: 0 }, 20_000, 100, 10)).toBe(61);
    expect(arrivalTick({ x: 0, y: 0 }, { x: 0, y: 0 }, 20_000, 100, 10)).toBe(11);
  });

  it('move lanza un viaje, la posición se deriva y la llegada deja al móvil en el elemento', () => {
    const s = createScene(solo, content);
    const panel = s.elements.e2!;
    const events = step(s, [order(1, 0, 'santi', 'move', { mobile: 'm1', to: 'e2' })], content);
    expect(kinds(events)).toEqual(['trip_started']);
    const m = s.mobiles.m1!;
    expect(m.where.kind).toBe('trip');
    if (m.where.kind !== 'trip') return;
    const { arriveTick } = m.where.trip;
    // 14 422 mm a 2 000 mm/tick: 8 ticks.
    expect(arriveTick).toBe(8);
    expect(positionOf(m, 0)).toEqual({ x: 0, y: 0 });
    expect(positionOf(m, 4)).toEqual({ x: 6_000, y: -4_000 });
    expect(positionOf(m, 8)).toEqual(panel.pos);
    let arrived: Event[] = [];
    while (s.tick < 20 && arrived.length === 0)
      arrived = step(s, [], content).filter((e) => e.kind === 'arrived');
    expect(s.tick).toBe(9);
    expect(m.where).toEqual({ kind: 'at', pos: panel.pos, element: 'e2' });
  });

  it('un móvil en viaje sin tarea se puede redirigir desde donde está', () => {
    const s = createScene(solo, content);
    step(s, [order(1, 0, 'santi', 'move', { mobile: 'm1', to: 'e2' })], content);
    step(s, [], content);
    step(s, [], content);
    const before = positionOf(s.mobiles.m1!, s.tick);
    const events = step(s, [order(2, 3, 'santi', 'move', { mobile: 'm1', to: 'e3' })], content);
    expect(kinds(events)).toEqual(['trip_started']);
    const m = s.mobiles.m1!;
    if (m.where.kind !== 'trip') throw new Error('debería viajar');
    expect(m.where.trip.from).toEqual(before);
    expect(m.where.trip.toElement).toBe('e3');
  });

  it('rechazos de move', () => {
    const s = createScene(solo, content);
    const v = (actor: string, mobile: string, to: string) =>
      validate(s, { actor, kind: 'move', args: { mobile, to } }, content);
    expect(v('santi', 'm9', 'e2')).toBe('unknown_mobile');
    expect(v('otro', 'm1', 'e2')).toBe('unknown_actor');
    expect(v('santi', 'm1', 'e9')).toBe('unknown_element');
    expect(v('santi', 'm1', 'e1')).toBe('already_there');
    expect(v('santi', 'm1', 'e2')).toBeNull();
    expect(
      validate(s, { actor: 'santi', kind: 'move', args: { mobile: 'm1', to: 'e2' }, tick: -1 }, content),
    ).toBe('too_late');
    expect(validate(s, { actor: 'santi', kind: 'skip', args: { ticks: 5 } }, content)).toBe('not_system');
    expect(validate(s, { actor: 'santi', kind: 'volar' as Order['kind'], args: {} as never }, content)).toBe(
      'unknown_kind',
    );
  });
});

describe('niebla', () => {
  function revealAt(s: SimState, hex: string, seq = 1): Event[] {
    return step(s, [order(seq, s.tick, 'santi', 'reveal', { mobile: 'm1', hex })], content);
  }

  it('reveal cobra energía, manda al obrero al centro del sector y lo abre al terminar la tarea', () => {
    const s = createScene(solo, content);
    const events = revealAt(s, '1,0');
    expect(kinds(events)).toEqual(['stock', 'trip_started']);
    expect(s.actors.santi?.stocks.energia).toBe(3_600_000 - 360_000);
    const m = s.mobiles.m1!;
    if (m.where.kind !== 'trip') throw new Error('debería viajar');
    expect(m.where.trip.to).toEqual(center(parse('1,0'), { hexW: 86_602, hexH: 75_000 }));
    expect(m.where.trip.toElement).toBeNull();
    // 86 602 mm a 2 000 mm/tick: 44 ticks de viaje y 50 de tarea.
    expect(m.where.trip.arriveTick).toBe(44);
    expect(m.job).toEqual({ kind: 'reveal', hex: '1,0', startTick: 44, endTick: 94 });
    expect(validate(s, { actor: 'santi', kind: 'move', args: { mobile: 'm1', to: 'e2' } }, content)).toBe(
      'busy',
    );

    const all: Event[] = [];
    while (s.tick <= 94) all.push(...step(s, [], content));
    expect(kinds(all)).toEqual(['arrived', 'job_started', 'sector_revealed', 'job_done']);
    const sector = s.map.sectors['1,0']!;
    expect(sector.status).toBe('revealed');
    expect(sector.revealedBy).toBe('santi');
    expect(sector.revealedTick).toBe(94);
    expect(sector.terrain).toBeDefined();
    expect(s.hidden.sectorContents['1,0']).toBeUndefined();
    expect(m.job).toBeNull();
    const revealed = all.find((e) => e.kind === 'sector_revealed');
    if (revealed?.kind !== 'sector_revealed') throw new Error('falta el evento');
    for (const id of revealed.found) {
      expect(s.elements[id]?.sector).toBe('1,0');
      expect(s.elements[id]?.owner).toBe('santi');
    }
  });

  it('rechazos de reveal', () => {
    const s = createScene(solo, content);
    const v = (hex: string) =>
      validate(s, { actor: 'santi', kind: 'reveal', args: { mobile: 'm1', hex } }, content);
    expect(v('0,0')).toBe('not_hidden');
    expect(v('3,0')).toBe('not_adjacent');
    expect(v('9,9')).toBe('off_map');
    expect(v('1,0')).toBeNull();
    s.actors.santi!.stocks.energia = 1;
    expect(v('1,0')).toBe('insufficient:energia');
  });

  it('una orden que deja de ser válida en su tick queda rechazada con evento', () => {
    const s = createScene(solo, content);
    const events = step(
      s,
      [
        order(1, 0, 'santi', 'reveal', { mobile: 'm1', hex: '1,0' }),
        order(2, 0, 'santi', 'reveal', { mobile: 'm1', hex: '0,1' }),
      ],
      content,
    );
    expect(kinds(events)).toEqual(['stock', 'trip_started', 'rejected']);
    const rejected = events[2];
    if (rejected?.kind !== 'rejected') throw new Error('falta el rechazo');
    expect(rejected.seq).toBe(2);
    expect(rejected.reason).toBe('busy');
  });
});

describe('acceso entre terrenos', () => {
  const dos: SceneParams = {
    kind: 'district',
    template: 'f0_dos',
    seed: '00ff00ff00ff00ff',
    actors: [
      { id: 'a', plot: 'p1' },
      { id: 'b', plot: 'p2' },
    ],
  };

  it('nadie entra en el terreno ajeno; la tierra común es del distrito', () => {
    const s = createScene(dos, content);
    // e1..e4 son de a; e5..e8 de b. b no puede mandar su obrero a la casa de a.
    expect(validate(s, { actor: 'b', kind: 'move', args: { mobile: 'm2', to: 'e1' } }, content)).toBe(
      'no_access',
    );
    expect(validate(s, { actor: 'b', kind: 'move', args: { mobile: 'm1', to: 'e5' } }, content)).toBe(
      'not_owner',
    );
    expect(
      validate(s, { actor: 'a', kind: 'reveal', args: { mobile: 'm1', hex: keyOf(5, 0) } }, content),
    ).toBe('no_access');
    expect(s.map.sectors['3,0']?.plot).toBeNull();
    expect(s.map.sectors['3,0']?.access).toEqual({ see: 'district', enter: 'district' });
  });
});

describe('órdenes del sistema', () => {
  it('credit y debit mueven stocks; debit sin saldo se rechaza', () => {
    const s = createScene(solo, content);
    const events = step(
      s,
      [
        order(1, 0, 'sys', 'credit', { actor: 'santi', resource: 'eagles', amount: 12, ref: 'libro:1' }),
        order(2, 0, 'sys', 'debit', { actor: 'santi', resource: 'eagles', amount: 5, ref: 'libro:2' }),
        order(3, 0, 'sys', 'debit', { actor: 'santi', resource: 'eagles', amount: 50, ref: 'libro:3' }),
        order(4, 0, 'sys', 'credit', { actor: 'nadie', resource: 'eagles', amount: 1, ref: 'libro:4' }),
      ],
      content,
    );
    expect(kinds(events)).toEqual(['stock', 'stock', 'rejected', 'rejected']);
    expect(s.actors.santi?.stocks.eagles).toBe(7);
  });

  it('skip salta ticks y advance ignora lo que caiga dentro', () => {
    const s = createScene(solo, content);
    const log: Order[] = [
      order(1, 0, 'sys', 'skip', { ticks: 1000 }),
      order(2, 500, 'santi', 'move', { mobile: 'm1', to: 'e2' }),
      order(3, 1200, 'santi', 'move', { mobile: 'm1', to: 'e3' }),
    ];
    const events = advance(s, log, 1300, content);
    expect(s.tick).toBe(1300);
    expect(kinds(events)).toEqual(['skipped', 'trip_started', 'arrived']);
    expect(s.mobiles.m1?.where).toMatchObject({ kind: 'at', element: 'e3' });
  });

  it('content solo acepta el hash de las tablas con las que corre', () => {
    const s = createScene(solo, content);
    expect(validate(s, { actor: 'sys', kind: 'content', args: { hash: 'otro' } }, content)).toBe(
      'content_mismatch',
    );
    expect(validate(s, { actor: 'sys', kind: 'content', args: { hash: content.hash } }, content)).toBeNull();
  });
});

describe('calendario', () => {
  it('la luz sigue la curva de la tabla y envuelve el ciclo', () => {
    const s = createScene(solo, content);
    expect(light(s, content, 0)).toBe(0);
    expect(light(s, content, 216_000)).toBe(0);
    expect(light(s, content, 243_000)).toBe(500);
    expect(light(s, content, 270_000)).toBe(1000);
    expect(light(s, content, 400_000)).toBe(1000);
    expect(light(s, content, 621_000)).toBe(500);
    expect(light(s, content, 648_000)).toBe(0);
    expect(light(s, content, 800_000)).toBe(0);
    expect(light(s, content, 864_000 + 243_000)).toBe(500);
    const shifted = createScene({ ...solo, dayOffset: 243_000 }, content);
    expect(light(shifted, content, 0)).toBe(500);
  });
});
