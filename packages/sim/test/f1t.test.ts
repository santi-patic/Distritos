/**
 * Tanda 6 de F1 (decisiones del autor del 18 oct por la tarde): aperturas con curva y en
 * paralelo (P14), tareas de jornada (P9), nombres editables (P16) y recados por tipo con los de
 * hacer y los que salen de la casa (P15). Contenido de prueba `content-f1t.json`: el de recados
 * con día de 6 000 ticks y luz de trabajo de 1 700 a 4 300, curva de apertura de 30, 60, 120…
 * ticks, la casa como sitio de recados y sin encargos en la pizarra.
 *
 * f1_solo: e1 casa, e4 batería, e5 pozo, e7 punto de carga, e8 almacén, e9 cocina, e10 y e11
 * casas vecinas; m1 peón (20 m/s), m2 técnica (15 m/s).
 */

import { describe, expect, it } from 'vitest';
import { quote } from '../src/rules/quote.js';
import { validate } from '../src/rules/orders.js';
import { createScene, type SceneParams } from '../src/scene.js';
import { advance } from '../src/step.js';
import type { Event } from '../src/types/events.js';
import type { Order, OrderArgs, OrderKind } from '../src/types/orders.js';
import type { Errand, SimState } from '../src/types/state.js';
import { testContentNamed } from './content.js';

const content = testContentNamed('content-f1t.json');
const CASA = 'e1';
const BATERIA = 'e4';
const POZO = 'e5';
const PUNTO = 'e7';
const ALMACEN = 'e8';
const COCINA = 'e9';

function params(seed: string): SceneParams {
  return { kind: 'district', template: 'f1_solo', seed, actors: [{ id: 'santi', plot: 'p1' }] };
}

function scene(seed = '00000000000000aa'): SimState {
  return createScene(params(seed), content);
}

let seq = 0;
function o<K extends OrderKind>(tick: number, kind: K, args: OrderArgs[K], actor = 'santi'): Order {
  seq += 1;
  return { seq, tick, actor, kind, args };
}

function v(s: SimState, kind: OrderKind, args: unknown, actor = 'santi'): string | null {
  return validate(s, { actor, kind, args } as never, content);
}

function errand(s: SimState, id: number): Errand | undefined {
  return s.district.errands?.items[String(id)];
}

function credit(tick: number, amount: number): Order {
  return o(tick, 'credit', { actor: 'santi', resource: 'energia', amount, ref: 'prueba' }, 'sys');
}

describe('aperturas con curva (P14)', () => {
  it('el obrero va a empezarla y queda libre; se abre al pasar su tiempo, de noche también', () => {
    const s = scene();
    // Tick 0: de noche. La batería tiene 30 000 J y cada apertura cuesta 20 000.
    const log = [o(0, 'reveal', { mobile: 'm1', hex: '1,0' }), o(0, 'reveal', { mobile: 'm2', hex: '-1,0' })];
    const events = advance(s, log, 1, content);
    expect(events.filter((e) => e.kind === 'rejected').map((e) => e.kind === 'rejected' && e.reason)).toEqual(
      ['insufficient:energia'],
    );
    // La primera apertura del actor dura curve[0] = 30 ticks desde que llega (tick 44).
    expect(s.mobiles.m1!.job).toEqual({ kind: 'reveal', hex: '1,0', startTick: 44, endTick: 44, opens: 74 });
    advance(s, [], 45, content);
    expect(s.mobiles.m1!.job).toBeNull();
    expect(s.map.sectors['1,0']).toMatchObject({
      status: 'hidden',
      opening: { by: 'santi', startTick: 44, endTick: 74 },
    });
    // Una apertura por sector: la que está en marcha.
    expect(v(s, 'reveal', { mobile: 'm1', hex: '1,0' })).toBe('opening');
    advance(s, [], 74, content);
    expect(s.map.sectors['1,0']!.status).toBe('hidden');
    advance(s, [], 75, content);
    expect(s.map.sectors['1,0']).toMatchObject({ status: 'revealed', revealedBy: 'santi', revealedTick: 74 });
    expect(s.map.sectors['1,0']!.opening).toBeUndefined();
  });

  it('varias a la vez, cada una con su lugar en la curva; el freno es la energía', () => {
    const s = scene();
    const log = [
      credit(0, 200_000),
      o(1, 'reveal', { mobile: 'm1', hex: '1,0' }),
      o(1, 'reveal', { mobile: 'm2', hex: '-1,0' }),
    ];
    advance(s, log, 2, content);
    // Segunda apertura: curve[1] = 60 ticks desde que llega la técnica (tick 1 + 58).
    expect(s.mobiles.m1!.job).toMatchObject({ opens: 45 + 30 });
    expect(s.mobiles.m2!.job).toMatchObject({ startTick: 59, opens: 59 + 60 });
    // Nadie más va a un sector al que ya va alguien: el peón, libre en 45, no puede ir al de la técnica.
    advance(s, [], 50, content);
    expect(s.mobiles.m1!.job).toBeNull();
    expect(v(s, 'reveal', { mobile: 'm1', hex: '-1,0' })).toBe('opening');
    advance(s, [], 120, content);
    expect(s.map.sectors['1,0']!.status).toBe('revealed');
    expect(s.map.sectors['-1,0']!.status).toBe('revealed');
    expect(s.actors.santi!.started?.reveal).toBe(2);
    // La tercera, curve[2] = 120; pasado el final de la curva se repite el último valor.
    const q3 = quote(s, { actor: 'santi', kind: 'reveal', args: { mobile: 'm1', hex: '2,0' } }, content)!;
    expect(q3.opens! - q3.arrive!).toBe(120);
    s.actors.santi!.started!.reveal = 50;
    const qn = quote(s, { actor: 'santi', kind: 'reveal', args: { mobile: 'm1', hex: '2,0' } }, content)!;
    expect(qn.opens! - qn.arrive!).toBe(6000);
    expect(qn.cost).toEqual({ energia: 20_000 });
  });

  it('el presupuesto es lo que pasa', () => {
    const s = scene();
    const q = quote(s, { actor: 'santi', kind: 'reveal', args: { mobile: 'm1', hex: '0,1' } }, content)!;
    advance(s, [o(0, 'reveal', { mobile: 'm1', hex: '0,1' })], q.opens! + 1, content);
    expect(s.map.sectors['0,1']).toMatchObject({ status: 'revealed', revealedTick: q.opens });
  });
});

describe('tareas de jornada (P9)', () => {
  it('la primera vez es corta y fija; las siguientes duran lo que queda de luz o hasta llenar', () => {
    const s = scene();
    const first = quote(
      s,
      { actor: 'santi', kind: 'job', args: { mobile: 'm1', element: POZO, task: 'sacar_agua' } },
      content,
    )!;
    // De noche: espera al amanecer (1 700) y trabaja los 20 ticks de la primera vez.
    expect(first).toMatchObject({ arrive: 14, end: 1720, work: 20 });
    expect(first.gives).toBeUndefined();
    advance(s, [o(0, 'job', { mobile: 'm1', element: POZO, task: 'sacar_agua' })], 1800, content);
    const level = s.elements[POZO]!.store!.agua!;
    const space = 400 - level;
    expect(space).toBeGreaterThan(0);
    // De día: rinde 100 cada 200 ticks; llenar lo que falta son 2·space ticks si caben antes de las 4 300.
    const q = quote(
      s,
      { actor: 'santi', kind: 'job', args: { mobile: 'm1', element: POZO, task: 'sacar_agua' } },
      content,
    )!;
    expect(q.arrive).toBe(1801);
    expect(q.work).toBe(Math.min(4300 - 1801, 2 * space));
    expect(q.end).toBe(1801 + q.work);
    expect(q.gives).toEqual({ agua: Math.min(space, Math.floor(q.work / 2)) });
    const events: Event[] = advance(
      s,
      [o(1800, 'job', { mobile: 'm1', element: POZO, task: 'sacar_agua' })],
      q.end! + 1,
      content,
    );
    expect(s.mobiles.m1!.job).toBeNull();
    const done = events.find(
      (e) => e.kind === 'store' && e.element === POZO && e.reason === 'task:sacar_agua',
    );
    expect(done).toMatchObject({ tick: q.end, delta: q.gives!.agua });
  });

  it('dada de noche, la jornada de mañana entera; sin comer rinde la mitad', () => {
    const s = scene();
    advance(s, [o(0, 'job', { mobile: 'm1', element: POZO, task: 'sacar_agua' })], 4400, content);
    // Vaciar el pozo a mano para que quepa una jornada entera (400 cabrían en 800 ticks: no limita).
    s.elements[POZO]!.store!.agua = 0;
    const q = quote(
      s,
      { actor: 'santi', kind: 'job', args: { mobile: 'm1', element: POZO, task: 'sacar_agua' } },
      content,
    )!;
    expect(q.arrive).toBe(4401);
    expect(q.end).toBe(7700 + 800);
    expect(q.gives).toEqual({ agua: 400 });
    s.mobiles.m1!.hungry = true;
    const h = quote(
      s,
      { actor: 'santi', kind: 'job', args: { mobile: 'm1', element: POZO, task: 'sacar_agua' } },
      content,
    )!;
    // A la mitad: llenar 400 son 1 600 ticks; la ventana de mañana tiene 2 600.
    expect(h.end).toBe(7700 + 1600);
    expect(h.gives).toEqual({ agua: 400 });
  });

  it('lo que van a dejar otros obreros cuenta: lo prometido cabe, y lo que no cabría se rechaza', () => {
    const s = scene();
    advance(s, [o(0, 'job', { mobile: 'm1', element: POZO, task: 'sacar_agua' })], 4000, content);
    s.elements[POZO]!.store!.agua = 200;
    const job = (mobile: string) =>
      ({ actor: 'santi', kind: 'job', args: { mobile, element: POZO, task: 'sacar_agua' } }) as const;
    // Lo que queda de luz hoy (hasta 4 300) no da para llenar los 200 que caben.
    const a1 = quote(s, job('m1'), content)?.gives?.agua ?? 0;
    expect(a1).toBeGreaterThan(0);
    expect(a1).toBeLessThan(200);
    advance(s, [o(4000, 'job', { mobile: 'm1', element: POZO, task: 'sacar_agua' })], 4001, content);
    // La técnica, después: solo lo que falta para llenar, no lo que daría su jornada.
    const a2 = quote(s, job('m2'), content)?.gives?.agua ?? 0;
    expect(a2).toBe(200 - a1);
    // Con el pozo comprometido entero, la orden se rechaza en vez de prometer agua que se perdería.
    const full = structuredClone(s);
    full.elements[POZO]!.store!.agua = 400 - a1;
    expect(v(full, 'job', job('m2').args)).toBe('full:agua');
    const events = advance(
      s,
      [o(4001, 'job', { mobile: 'm2', element: POZO, task: 'sacar_agua' })],
      4400,
      content,
    );
    const stored = events.flatMap((e) =>
      e.kind === 'store' && e.element === POZO && e.reason === 'task:sacar_agua' ? [e.delta] : [],
    );
    // La técnica termina antes (trabaja menos): cada una guarda entero lo que se le prometió.
    expect(stored).toEqual([a2, a1]);
  });

  it('si lo que queda de luz hoy no da nada, la jornada es la de mañana', () => {
    const s = scene();
    advance(s, [o(0, 'job', { mobile: 'm1', element: POZO, task: 'sacar_agua' })], 4298, content);
    s.elements[POZO]!.store!.agua = 0;
    // Llega en 4 299, con un tick de luz de trabajo que no da agua: trabaja mañana.
    const q = quote(
      s,
      { actor: 'santi', kind: 'job', args: { mobile: 'm1', element: POZO, task: 'sacar_agua' } },
      content,
    )!;
    expect(q.arrive).toBe(4299);
    expect(q.end).toBe(7700 + 800);
    expect(q.gives).toEqual({ agua: 400 });
  });
});

describe('nombres (P16)', () => {
  it('lo propio y lo del común se renombran; vacío devuelve el nombre por defecto', () => {
    const s = scene();
    const log = [
      o(0, 'rename', { element: CASA, name: 'A Casa Grande' }),
      o(0, 'rename', { element: COCINA, name: 'Cociña do Concello' }),
      o(0, 'rename', { mobile: 'm1', name: 'Pepe' }),
      o(1, 'rename', { element: COCINA, name: '' }),
    ];
    const events = advance(s, log, 2, content);
    expect(events.filter((e) => e.kind === 'rejected')).toEqual([]);
    expect(s.elements[CASA]!.name).toBe('A Casa Grande');
    expect(s.elements[COCINA]!.name).toBeUndefined();
    expect(s.mobiles.m1!.name).toBe('Pepe');
  });

  it('rechazos: largo, espacios, control, vacío en un obrero, sin cambio y ajenos', () => {
    const s = scene();
    expect(v(s, 'rename', { element: CASA, name: 'x'.repeat(25) })).toBe('bad_name');
    expect(v(s, 'rename', { element: CASA, name: 'x'.repeat(24) })).toBeNull();
    expect(v(s, 'rename', { element: CASA, name: ' Casa' })).toBe('bad_name');
    expect(v(s, 'rename', { element: CASA, name: 'Ca\nsa' })).toBe('bad_name');
    expect(v(s, 'rename', { mobile: 'm1', name: '' })).toBe('bad_name');
    expect(v(s, 'rename', { mobile: 'm1', name: s.mobiles.m1!.name })).toBe('unchanged');
    expect(v(s, 'rename', { element: CASA, name: '' })).toBe('unchanged');
    expect(v(s, 'rename', { element: CASA, mobile: 'm1', name: 'x' })).toBe('bad_args');
    expect(v(s, 'rename', { name: 'x' })).toBe('bad_args');
    expect(v(s, 'rename', { element: 'e99', name: 'x' })).toBe('unknown_element');
    const dos = createScene(
      {
        kind: 'district',
        template: 'f1_dos',
        seed: '00000000000000aa',
        actors: [
          { id: 'a', plot: 'p1' },
          { id: 'b', plot: 'p2' },
        ],
      },
      content,
    );
    expect(validate(dos, { actor: 'b', kind: 'rename', args: { element: 'e1', name: 'Mía' } }, content)).toBe(
      'not_owner',
    );
    expect(validate(dos, { actor: 'b', kind: 'rename', args: { mobile: 'm1', name: 'Mía' } }, content)).toBe(
      'not_owner',
    );
  });
});

describe('recados por tipo (P15)', () => {
  // Semilla con un recado de llevar energía (1) y uno de obra (2) en la casa al empezar.
  const SEED = '00000000000000ac';

  it('la casa genera recados suyos; los de hacer se reservan al dar la ruta y alargan la parada', () => {
    const s = scene(SEED);
    expect(errand(s, 1)).toMatchObject({
      kind: 'energia_casa',
      at: CASA,
      to: PUNTO,
      holder: 'santi',
      size: 2,
    });
    expect(errand(s, 2)).toMatchObject({
      kind: 'obra',
      at: CASA,
      to: ALMACEN,
      holder: 'santi',
      size: 0,
      work: 120,
    });
    const stops = [CASA, ALMACEN, PUNTO];
    const q = quote(s, { actor: 'santi', kind: 'route', args: { mobile: 'm1', stops } }, content)!;
    // Primera ruta: paradas de 10 ticks, más los 120 de la obra en el almacén.
    expect(q.work).toBe(3 * 10 + 120);
    advance(s, [credit(0, 200_000), o(0, 'route', { mobile: 'm1', stops })], 1, content);
    expect(errand(s, 2)!.assigned).toBe('m1');
    const job = s.mobiles.m1!.job;
    expect(job?.kind).toBe('route');
    if (job?.kind !== 'route') return;
    const [casa, almacen, punto] = job.stops;
    expect(casa).toMatchObject({ at: CASA, leave: 1710 });
    expect(almacen!.leave - almacen!.arrive).toBe(130);
    // Otra ruta no se lleva lo reservado.
    const other = quote(
      s,
      { actor: 'santi', kind: 'route', args: { mobile: 'm2', stops: [CASA, ALMACEN] } },
      content,
    )!;
    expect(other.work).toBe(2 * 60);
    const battery = s.elements[BATERIA]!.store!.energia!;
    const events = advance(s, [], punto!.leave + 1, content);
    // Al recoger, la energía sale de la batería; al entregar, entra en el punto de carga.
    const taken = events.find((e) => e.kind === 'store' && e.element === BATERIA && e.reason === 'recado');
    expect(taken).toMatchObject({ tick: 1710, delta: -10_000 });
    expect(battery).toBeGreaterThan(10_000);
    const filled = events.find((e) => e.kind === 'store' && e.element === PUNTO && e.reason === 'recado');
    expect(filled).toMatchObject({ tick: punto!.leave, delta: 10_000 });
    const paid = events
      .filter((e) => e.kind === 'errand_delivered')
      .map((e) => e.kind === 'errand_delivered' && [e.errand, e.tick, e.pay]);
    expect(paid).toEqual([
      [2, almacen!.leave, 4],
      [1, punto!.leave, 3],
    ]);
    expect(s.actors.santi!.stocks.eagles).toBe(20 + 7);
    expect(s.district.errands!.delivered.santi).toBe(2);
    expect(s.mobiles.m1!.job).toBeNull();
  });

  it('lo que se lleva de casa se queda si no hay de qué', () => {
    const s = scene(SEED);
    // Sin crédito: a las 1 710 la batería ya no tiene los 10 000 J (la casa gasta toda la noche).
    advance(s, [o(0, 'route', { mobile: 'm1', stops: [CASA, PUNTO] })], 1711, content);
    expect(s.elements[BATERIA]!.store!.energia!).toBeLessThan(10_000);
    expect(errand(s, 1)).toMatchObject({ at: CASA });
    expect(errand(s, 1)!.taken).toBeUndefined();
  });

  it('cancelar suelta lo reservado que aún no se ha recogido', () => {
    const s = scene(SEED);
    advance(s, [o(0, 'route', { mobile: 'm1', stops: [COCINA, CASA, ALMACEN] })], 5, content);
    expect(errand(s, 2)!.assigned).toBe('m1');
    advance(s, [o(5, 'cancel', { mobile: 'm1' })], 6, content);
    expect(errand(s, 2)!.assigned).toBeUndefined();
    expect(errand(s, 2)!.at).toBe(CASA);
    // Y al acabar una ruta tampoco queda nada reservado.
    const t = scene(SEED);
    advance(t, [o(0, 'route', { mobile: 'm1', stops: [COCINA, CASA] })], 4000, content);
    expect(Object.values(t.district.errands!.items).filter((r) => r.assigned !== undefined)).toEqual([]);
  });
});
