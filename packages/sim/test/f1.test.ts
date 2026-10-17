/**
 * Reglas de F1 (diseño de la casa): calendario con ventanas de trabajo, flujos por almacén,
 * órdenes build/link/job/toggle/hire/deliver, comida y pizarra. Contenido de prueba F1: un día
 * de 6 000 ticks (10 min), luz de trabajo de 1 700 a 4 300, paso diario en 1 200.
 */

import { describe, expect, it } from 'vitest';
import {
  isDailyTick,
  light,
  nextDailyTick,
  nextLightChange,
  nextWorkStart,
  workEnd,
} from '../src/calendar.js';
import { hashState } from '../src/index.js';
import { removeKey } from '../src/iter.js';
import { addElement, capacityOf } from '../src/rules/elements.js';
import { resolveFlows } from '../src/rules/flows.js';
import { available } from '../src/rules/inventory.js';
import { addLink } from '../src/rules/links.js';
import { positionOf } from '../src/rules/movement.js';
import { validate } from '../src/rules/orders.js';
import { createScene, type SceneParams } from '../src/scene.js';
import { advance, nextEventTick, step } from '../src/step.js';
import type { Event } from '../src/types/events.js';
import type { Order, OrderArgs, OrderKind } from '../src/types/orders.js';
import type { SimState } from '../src/types/state.js';
import { testContentF1 } from './content.js';

const content = testContentF1();
const SEED = '00000000000000aa';
const params: SceneParams = {
  kind: 'district',
  template: 'f1_solo',
  seed: SEED,
  actors: [{ id: 'santi', plot: 'p1' }],
};

// Dotación: e1 casa, e2 y e3 paneles, e4 batería, e5 pozo, e6 huerta; e7 punto de carga y e8
// almacén del común; l1 y l2 paneles→batería, l3 batería→casa, l4 pozo→huerta.
const CASA = 'e1';
const PANEL = 'e2';
const BATERIA = 'e4';
const POZO = 'e5';
const HUERTA = 'e6';
const PUNTO = 'e7';

function scene(): SimState {
  return createScene(params, content);
}

let seq = 0;
function o<K extends OrderKind>(tick: number, kind: K, args: OrderArgs[K], actor = 'santi'): Order {
  seq += 1;
  return { seq, tick, actor, kind, args };
}

/** Avanza aplicando el registro y devuelve los eventos. */
function run(s: SimState, log: Order[], until: number): Event[] {
  return advance(s, log, until, content);
}

function kinds(events: Event[]): string[] {
  return events.map((e) => e.kind);
}

function v(s: SimState, kind: OrderKind, args: unknown, actor = 'santi'): string | null {
  return validate(s, { actor, kind, args } as never, content);
}

function energy(s: SimState): number {
  return s.elements[BATERIA]!.store!.energia!;
}

describe('calendario de F1', () => {
  it('la luz va por tramos y las tareas solo avanzan con luz de trabajo', () => {
    const s = scene();
    expect(light(s, content, 0)).toBe(0);
    expect(light(s, content, 1600)).toBe(200);
    expect(light(s, content, 2000)).toBe(1000);
    expect(nextLightChange(s, content, 0)).toBe(1500);
    expect(nextLightChange(s, content, 4600)).toBe(6000 + 1500);
    // Ordenada de noche, empieza al amanecer de trabajo (1 700).
    expect(workEnd(s, content, 0, 20)).toBe(1720);
    // Lo que no cabe hoy sigue mañana: 10 ticks hoy y 10 desde las 7 700.
    expect(workEnd(s, content, 4290, 20)).toBe(7710);
    expect(workEnd(s, content, 1800, 2500)).toBe(4300);
    expect(workEnd(s, content, 1800, 2501)).toBe(7701);
  });

  it('el próximo amanecer de trabajo es estrictamente posterior y el paso diario es diario', () => {
    const s = scene();
    expect(nextWorkStart(s, content, 0)).toBe(1700);
    expect(nextWorkStart(s, content, 1700)).toBe(7700);
    expect(nextWorkStart(s, content, 5000)).toBe(7700);
    expect(nextDailyTick(s, content, 0)).toBe(1200);
    expect(nextDailyTick(s, content, 1200)).toBe(1200);
    expect(nextDailyTick(s, content, 1201)).toBe(7200);
    // Creada justo a la hora del paso diario, el primer paso es al día siguiente.
    const atDaily = createScene({ ...params, dayOffset: 1200 }, content);
    expect(isDailyTick(atDaily, content, 0)).toBe(false);
    expect(nextDailyTick(atDaily, content, 0)).toBe(6000);
  });
});

describe('flujos', () => {
  it('de noche la casa gasta la batería; de día los paneles la cargan hasta el tope', () => {
    const s = scene();
    run(s, [], 100);
    expect(energy(s)).toBe(30_000 - 15 * 100);
    // A pleno sol cada panel (suciedad 100 ‰ tras el primer paso diario) da 36 J por tick.
    run(s, [], 2000);
    const f = resolveFlows(s, content).stores.find((x) => x.element === BATERIA)!;
    expect(f.inflow).toBe(2 * 31_104_000);
    expect(f.net).toBe(2 * 31_104_000 - 12_960_000);
    s.elements[BATERIA]!.store!.energia = 600_000 - 100;
    run(s, [], 2010);
    expect(energy(s)).toBe(600_000);
  });

  it('vacía, la batería se queda a cero y la casa no recibe nada hasta que hay entrada', () => {
    const s = scene();
    s.elements[BATERIA]!.store!.energia = 300;
    expect(nextEventTick(s, content)).toBe(20);
    run(s, [], 30);
    expect(energy(s)).toBe(0);
    const f = resolveFlows(s, content);
    expect(f.supplied[CASA]).toBe(0);
    expect(f.stores.find((x) => x.element === BATERIA)!.net).toBe(0);
    // Al amanecer los paneles dan menos de lo que pide la casa: reparto proporcional.
    run(s, [], 1600);
    const dawn = resolveFlows(s, content);
    const inflow = dawn.stores.find((x) => x.element === BATERIA)!.inflow;
    expect(inflow).toBeLessThan(12_960_000);
    expect(dawn.supplied[CASA]).toBe(Math.floor((inflow * 1000) / 12_960_000));
    expect(energy(s)).toBe(0);
  });

  it('la bomba se apaga sola con la batería vacía y con su depósito lleno', () => {
    const s = scene();
    const bomba = addElement(s, content, {
      kind: 'bomba',
      pos: { x: 10_000, y: 30_000 },
      sector: '0,0',
      owner: 'santi',
    });
    addLink(s, content, 'cable', s.elements[BATERIA]!, bomba);
    const events = run(s, [o(0, 'toggle', { element: bomba.id, on: true })], 760);
    // 40 J por tick (casa 15 + bomba 25) sobre 30 000 J: a cero en el tick 750.
    const off = events.find((e) => e.kind === 'switched' && !e.on);
    expect(off).toMatchObject({ tick: 750, element: bomba.id, reason: 'empty' });
    expect(bomba.store!.agua).toBe(2 * 750);
    // De día, con la batería llena, se apaga al llenar su depósito.
    run(s, [], 2000);
    s.elements[BATERIA]!.store!.energia = 600_000;
    bomba.store!.agua = 0;
    const day = run(s, [o(2000, 'toggle', { element: bomba.id, on: true })], 4000);
    expect(day.find((e) => e.kind === 'switched' && !e.on)).toMatchObject({ tick: 3500, reason: 'full' });
    expect(bomba.store!.agua).toBe(3000);
  });

  it('la huerta madura mientras tiene agua y se para cuando el pozo se vacía', () => {
    const s = scene();
    run(s, [], 1500);
    expect(s.elements[POZO]!.store!.agua).toBe(0);
    expect(resolveFlows(s, content).produced[HUERTA]).toBe(0);
    s.elements[POZO]!.store!.agua = 400;
    expect(resolveFlows(s, content).produced[HUERTA]).toBe(432);
  });

  it('los ciclos de descarga gastan la batería y la suciedad baja los paneles hasta su tope', () => {
    const s = scene();
    s.elements[BATERIA]!.drawn = 600_000 + 5;
    const events = run(s, [], 1201);
    expect(events.filter((e) => e.kind === 'cycled')).toHaveLength(1);
    expect(s.elements[BATERIA]!.wear).toBe(50);
    expect(capacityOf(content, s.elements[BATERIA]!, 'energia')).toBe(570_000);
    expect(s.elements[PANEL]!.wear).toBe(100);
    run(s, [], 6 * 6000 + 1201);
    expect(s.elements[PANEL]!.wear).toBe(500);
  });
});

describe('órdenes de F1', () => {
  it('construir: rechazos, coste al ordenar, primera vez corta y obra con nombre', () => {
    const s = scene();
    const pos = { x: 10_000, y: 30_000 };
    expect(v(s, 'build', { mobile: 'm1', kind: 'castillo', pos })).toBe('not_buildable');
    expect(v(s, 'build', { mobile: 'm1', kind: 'cobertizo', pos: { x: 0.5, y: 0 } })).toBe('bad_args');
    expect(v(s, 'build', { mobile: 'm1', kind: 'cobertizo', pos: { x: 3_000, y: 0 } })).toBe('too_close');
    expect(v(s, 'build', { mobile: 'm1', kind: 'cobertizo', pos: { x: 86_602, y: 0 } })).toBe('bad_position');
    expect(v(s, 'build', { mobile: 'm1', kind: 'cobertizo', pos: { x: 259_806, y: 0 } })).toBe('no_access');
    s.actors.santi!.stocks.eagles = 9;
    expect(v(s, 'build', { mobile: 'm1', kind: 'taller', pos })).toBe('insufficient:eagles');
    s.actors.santi!.stocks.eagles = 20;
    expect(v(s, 'build', { mobile: 'm1', kind: 'cobertizo', pos })).toBeNull();
    const events = run(s, [o(0, 'build', { mobile: 'm1', kind: 'cobertizo', pos })], 2000);
    expect(s.elements[CASA]!.store!.madera).toBe(5);
    const built = events.find((e) => e.kind === 'built');
    // Ordenado de noche: llega en 2 ticks y trabaja 100 ticks de luz desde las 1 700.
    expect(built).toMatchObject({ tick: 1800, by: 'santi' });
    const e = built?.kind === 'built' ? s.elements[built.element]! : null;
    expect(e).toMatchObject({ kind: 'cobertizo', builtBy: ['santi'], store: { madera: 0, piedra: 0 } });
    // Segunda vez: duración completa.
    expect(v(s, 'build', { mobile: 'm1', kind: 'cobertizo', pos: { x: -5_000, y: -35_000 } })).toBeNull();
    run(s, [o(2000, 'build', { mobile: 'm1', kind: 'cobertizo', pos: { x: -5_000, y: -35_000 } })], 2001);
    const job = s.mobiles.m1!.job!;
    expect(job.endTick - job.startTick).toBe(600);
  });

  it('nexos: solo unen almacén con quien lo llena o lo vacía, reconectar sustituye, y el camino acelera', () => {
    const s = scene();
    expect(v(s, 'link', { mobile: 'm1', kind: 'cable', from: PANEL, to: HUERTA })).toBe('not_linkable');
    expect(v(s, 'link', { mobile: 'm1', kind: 'cable', from: BATERIA, to: PANEL })).toBe('already_linked');
    expect(v(s, 'link', { mobile: 'm1', kind: 'canal', from: HUERTA, to: PUNTO })).toBe('not_owner');
    const bomba = addElement(s, content, {
      kind: 'bomba',
      pos: { x: 10_000, y: 30_000 },
      sector: '0,0',
      owner: 'santi',
    });
    expect(v(s, 'toggle', { element: bomba.id, on: true })).toBe('no_supply');
    const log = [
      o(1800, 'link', { mobile: 'm1', kind: 'canal', from: HUERTA, to: bomba.id }),
      o(1800, 'link', { mobile: 'm2', kind: 'camino', from: CASA, to: POZO }),
    ];
    const events = run(s, log, 2400);
    const linked = events.filter((e) => e.kind === 'linked');
    expect(linked).toHaveLength(2);
    const canal = linked.find((e) => e.kind === 'linked' && s.links[e.link]?.kind === 'canal');
    expect(canal).toMatchObject({ replaced: 'l4' });
    expect(s.links.l4).toBeUndefined();
    const id = canal?.kind === 'linked' ? canal.link : '';
    expect(s.links[id]).toMatchObject({ kind: 'canal', from: bomba.id, to: HUERTA, builtBy: ['santi'] });
    expect(s.elements[CASA]!.store!.piedra).toBe(4);
    // El obrero 2 está en la casa: hasta el pozo por el camino va al doble.
    const m2 = s.mobiles.m2!;
    run(s, [o(2400, 'move', { mobile: 'm2', to: CASA })], 2500);
    expect(m2.where).toMatchObject({ kind: 'at', element: CASA });
    run(s, [o(2500, 'move', { mobile: 'm2', to: POZO })], 2501);
    if (m2.where.kind !== 'trip') throw new Error('debería viajar');
    const ticks = m2.where.trip.arriveTick - m2.where.trip.departTick;
    // 27 202 mm a 15 m/s son 19 ticks; por el camino, 10.
    expect(ticks).toBe(10);
  });

  it('tareas: sacar agua al pozo, recoger la huerta y limpiar con o sin taller', () => {
    const s = scene();
    s.elements[POZO]!.store!.agua = 400;
    expect(v(s, 'job', { mobile: 'm1', element: POZO, task: 'sacar_agua' })).toBe('full:agua');
    expect(v(s, 'job', { mobile: 'm1', element: HUERTA, task: 'recoger' })).toBe('nothing_to_do');
    expect(v(s, 'job', { mobile: 'm1', element: PANEL, task: 'limpiar' })).toBe('nothing_to_do');
    expect(v(s, 'job', { mobile: 'm1', element: CASA, task: 'recoger' })).toBe('wrong_element');
    expect(v(s, 'job', { mobile: 'm1', element: CASA, task: 'volar' })).toBe('unknown_task');
    s.elements[POZO]!.store!.agua = 0;
    s.elements[HUERTA]!.store!.comida = 4;
    const events = run(
      s,
      [
        o(0, 'job', { mobile: 'm1', element: POZO, task: 'sacar_agua' }),
        o(0, 'job', { mobile: 'm2', element: HUERTA, task: 'recoger' }),
      ],
      1800,
    );
    expect(events.filter((e) => e.kind === 'job_done').map((e) => e.tick)).toEqual([1710, 1720]);
    // La huerta tenía 4 raciones; la casa, 6 menos 2 de las comidas del paso diario.
    expect(s.elements[CASA]!.store!.comida).toBe(4 + 4);
    expect(s.elements[HUERTA]!.store!.comida).toBe(0);
    // Limpiar a mano: 600 ticks; con taller, 200 y 20 000 J.
    expect(s.elements[PANEL]!.wear).toBe(100);
    run(s, [o(1800, 'job', { mobile: 'm1', element: PANEL, task: 'limpiar' })], 1801);
    expect(s.mobiles.m1!.job!.endTick - s.mobiles.m1!.job!.startTick).toBe(600);
    addElement(s, content, { kind: 'taller', pos: { x: -5_000, y: -35_000 }, sector: '0,0', owner: 'santi' });
    s.elements[BATERIA]!.store!.energia = 300_000;
    const before = energy(s);
    run(s, [o(1801, 'job', { mobile: 'm2', element: 'e3', task: 'limpiar' })], 1802);
    expect(s.mobiles.m2!.job!.endTick - s.mobiles.m2!.job!.startTick).toBe(200);
    expect(energy(s)).toBeLessThan(before - 20_000 + 100);
    const done = run(s, [], 4000);
    expect(done.filter((e) => e.kind === 'cleaned')).toHaveLength(2);
    expect(s.elements[PANEL]!.wear).toBe(0);
  });

  it('contratar: hace falta cama, cuesta al ordenar y el obrero llega al amanecer con nombre libre', () => {
    const s = scene();
    expect(v(s, 'hire', { kind: 'obrero_peon' })).toBe('no_bed');
    expect(v(s, 'hire', { kind: 'obrero_jefe' })).toBe('not_hireable');
    addElement(s, content, {
      kind: 'cobertizo',
      pos: { x: 10_000, y: 30_000 },
      sector: '0,0',
      owner: 'santi',
    });
    expect(v(s, 'hire', { kind: 'obrero_peon' })).toBeNull();
    s.elements[CASA]!.store!.comida = 30;
    const events = run(
      s,
      [o(2000, 'hire', { kind: 'obrero_peon' }), o(2000, 'hire', { kind: 'obrero_peon' })],
      7701,
    );
    expect(kinds(events).filter((k) => k === 'hired')).toHaveLength(2);
    expect(events.find((e) => e.kind === 'hired')?.tick).toBe(7700);
    expect(s.actors.santi!.stocks.eagles).toBe(20 - 10);
    const names = Object.values(s.mobiles).map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    expect(s.actors.santi!.hires).toBeUndefined();
    expect(v(s, 'hire', { kind: 'obrero_peon' })).toBe('no_bed');
  });

  it('sin comida los obreros no paran: rinden a la mitad y comen en cuanto hay', () => {
    const s = scene();
    s.elements[CASA]!.store!.comida = 1;
    const events = run(s, [], 1300);
    expect(events.filter((e) => e.kind === 'hungry')).toHaveLength(1);
    const hungry = Object.values(s.mobiles).find((m) => m.hungry === true)!;
    s.elements[POZO]!.store!.agua = 0;
    run(s, [o(1300, 'job', { mobile: hungry.id, element: POZO, task: 'sacar_agua' })], 1301);
    // Primera vez: 20 ticks de trabajo; sin comer, 40, desde la luz de las 1 700.
    expect(hungry.job!.endTick).toBe(1740);
    s.elements[HUERTA]!.store!.comida = 3;
    const other = Object.values(s.mobiles).find((m) => m.id !== hungry.id)!;
    const fed = run(s, [o(1301, 'job', { mobile: other.id, element: HUERTA, task: 'recoger' })], 2000);
    expect(fed.filter((e) => e.kind === 'fed')).toHaveLength(1);
    expect(hungry.hungry).toBeUndefined();
  });

  it('entregar: lo pedido viaja con el obrero, cada entrega paga su parte y nada se pierde al rotar', () => {
    const s = scene();
    const encargo = s.district.board!.encargo!;
    expect(encargo).toMatchObject({ id: 1, kind: 'energia_carga', at: PUNTO, amount: 40_000 });
    expect(v(s, 'deliver', { mobile: 'm1', encargo: 9 })).toBe('no_encargo');
    expect(v(s, 'deliver', { mobile: 'm1', encargo: 1 })).toBeNull();
    const log = [o(0, 'deliver', { mobile: 'm1', encargo: 1 })];
    run(s, log, 1);
    expect(s.mobiles.m1!.cargo).toEqual({ energia: 20_000 });
    expect(energy(s)).toBe(30_000 - 20_000 - 15);
    expect(encargo.reserved).toBe(20_000);
    // La batería ya no da otros 20 000 J: entrega lo que hay.
    expect(v(s, 'deliver', { mobile: 'm2', encargo: 1 })).toBeNull();
    const events = run(s, [...log, o(1, 'deliver', { mobile: 'm2', encargo: 1 })], 1300);
    const delivered = events.filter((e) => e.kind === 'delivered');
    expect(delivered.map((e) => (e.kind === 'delivered' ? e.pay : 0))).toEqual([5, 2]);
    expect(s.actors.santi!.stocks.eagles).toBe(27);
    expect(s.elements[PUNTO]!.store!.energia).toBe(20_000 + delivered[1]!.amount);
    expect(s.district.board!.totals.santi!.energia).toBe(20_000 + delivered[1]!.amount);
    // El paso diario (1 200) rota la pizarra: hoy toca llevar raciones.
    expect(s.district.board!.encargo).toMatchObject({ id: 2, kind: 'raciones_almacen' });
    expect(s.mobiles.m1!.cargo).toBeUndefined();
  });

  it('una entrega en camino cuando rota el encargo se cobra igual', () => {
    const s = scene();
    run(s, [], 1150);
    const events = run(s, [o(1150, 'deliver', { mobile: 'm2', encargo: 1 })], 1400);
    expect(events.find((e) => e.kind === 'encargo')?.tick).toBe(1200);
    // Lleva lo que queda en la batería (12 750 J) y cobra su parte: 10 · 12 750 / 40 000.
    expect(events.find((e) => e.kind === 'delivered')).toMatchObject({ encargo: 1, amount: 12_750, pay: 3 });
  });

  it('las horas de obra se entregan trabajando con luz', () => {
    const s = scene();
    run(s, [], 7300);
    const e = s.district.board!.encargo!;
    expect(e.kind).toBe('obra_comun');
    const events = run(s, [o(7300, 'deliver', { mobile: 'm1', encargo: e.id })], 9000);
    const d = events.find((x) => x.kind === 'delivered');
    expect(d).toMatchObject({ amount: 200, pay: 6, resource: 'trabajo' });
    expect(d!.tick).toBe(6000 + 1700 + 200);
  });

  it('las órdenes de F1 que dejan de valer en su tick quedan rechazadas con evento', () => {
    const s = scene();
    const events = run(
      s,
      [
        o(0, 'job', { mobile: 'm1', element: POZO, task: 'sacar_agua' }),
        o(0, 'link', { mobile: 'm1', kind: 'camino', from: CASA, to: POZO }),
      ],
      1,
    );
    expect(events.find((e) => e.kind === 'rejected')).toMatchObject({ reason: 'busy' });
    expect(available(s, content, 'santi', 'energia')).toBe(30_000 - 15);
    expect(hashState(s)).toMatch(/^[0-9a-f]{64}$/);
    expect(positionOf(s.mobiles.m1!, s.tick)).toBeDefined();
    expect(step).toBeTypeOf('function');
    removeKey(s.links, 'l1');
    expect(s.links.l1).toBeUndefined();
  });
});

describe('tablas de F1', () => {
  it('rechaza unas tablas cuyos flujos no se pueden resolver', () => {
    const sinRecursos = { ...content, resources: undefined };
    expect(() => createScene(params, sinRecursos as never)).toThrow(/tabla de recursos/);
    const alReves = structuredClone(content);
    alReves.resources!.energia!.order = 9;
    expect(() => createScene(params, alReves)).toThrow(/tiene que ir antes/);
  });
});
