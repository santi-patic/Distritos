import { describe, expect, it } from 'vitest';
import {
  advance,
  assertAllIntegers,
  createScene,
  hashOf,
  nextLightChange,
  quote,
  rateDen,
  replay,
  resolveFlows,
  type Order,
  type SceneParams,
} from '@distritos/sim';
import { ContentError, compile, content, tables, validateTables, type RawTables } from '../src/index.js';

function clone<T>(v: T): T {
  return structuredClone(v);
}

const casa: SceneParams = {
  kind: 'district',
  template: 'f1_casa',
  seed: 'f1f1f1f1f1f1f1f1',
  actors: [{ id: 'a', plot: 'p1' }],
};

describe('tablas del repositorio', () => {
  it('cumplen su esquema y compilan', () => {
    expect(validateTables(tables)).toEqual([]);
    const c = content();
    expect(c.hash).toMatch(/^[0-9a-f]{64}$/);
    assertAllIntegers(c);
  });

  it('convierten unidades: segundos a ticks, tasas a unidades por día y hexágono a retícula entera', () => {
    const c = content();
    expect(c.scenes.district.tickMs).toBe(100);
    expect(c.scenes.district.dayTicks).toBe(864_000);
    expect(c.scenes.district.light[4]).toEqual([270_000, 1000]);
    expect(c.scenes.district.workLight).toBe(200);
    expect(c.scenes.district.dailyAt).toBe(0);
    expect(c.scenes.district.hexW).toBe(86_602);
    expect(c.scenes.district.hexH).toBe(75_000);
    expect(c.scenes.district.maxCatchupTicks).toBe(30 * 864_000);
    expect(c.actions.reveal).toEqual({
      resource: 'energia',
      cost: 360_000,
      ticks: 108_000,
      firstTicks: 3_000,
    });
    // 400 W de placa por el 293 ‰ del cielo gallego, en julios por día.
    expect(c.elements.panel?.produce).toEqual({
      resource: 'energia',
      perDay: 10_126_080,
      to: 'link',
      light: true,
      wear: true,
    });
    expect(c.elements.casa?.consume).toEqual({ resource: 'energia', perDay: 15 * 86_400 });
    expect(c.elements.bomba?.consume).toEqual({ resource: 'energia', perDay: 250 * 86_400 });
    expect(c.elements.bomba?.produce).toEqual({ resource: 'agua', perDay: 400 * 24, to: 'self' });
    expect(c.elements.huerta?.produce).toEqual({ resource: 'comida', perDay: 2, to: 'self' });
    expect(c.tasks?.sacar_agua).toMatchObject({
      ticks: 36_000,
      firstTicks: 1_200,
      gives: { agua: 40 },
      into: 'self',
    });
    expect(c.tasks?.limpiar?.tool).toEqual({ kind: 'taller', ticks: 72_000, cost: { energia: 720_000 } });
    expect(c.links?.cable).toMatchObject({ carries: 'energia', unitMm: 50_000, ticksPerUnit: 18_000 });
    expect(c.links?.camino).toMatchObject({ speedPermille: 2000, costPerUnit: { piedra: 5 } });
    expect(c.board?.encargos[2]).toMatchObject({
      id: 'obra_comun',
      work: true,
      amount: 144_000,
      perTrip: 72_000,
    });
    expect(c.mobiles.obrero_peon).toMatchObject({
      eats: { resource: 'comida', perDay: 1 },
      hungryPermille: 500,
    });
  });

  it('el hash es el del contenido compilado y es estable', () => {
    const c = content();
    const { hash, ...rest } = c;
    expect(hashOf(rest)).toBe(hash);
    expect(compile(tables).hash).toBe(hash);
  });

  it('cumplen el presupuesto de energía del diseño: 2,4 kWh de dos paneles y 0,36 kWh de la casa al día', () => {
    const c = content();
    const s = createScene(casa, c);
    const D = rateDen(s);
    let joules = 0;
    let t = 0;
    while (t < s.scene.dayTicks) {
      const next = Math.min(nextLightChange(s, c, t) ?? s.scene.dayTicks, s.scene.dayTicks);
      const battery = resolveFlows(s, c, t).stores.find(
        (f) => f.element === 'e4' && f.resource === 'energia',
      );
      joules += ((battery?.inflow ?? 0) * (next - t)) / D;
      t = next;
    }
    const kWh = joules / 3_600_000;
    expect(kWh).toBeGreaterThan(2.38);
    expect(kWh).toBeLessThan(2.42);
    expect(((c.elements.casa?.consume?.perDay ?? 0) / 3_600_000).toFixed(2)).toBe('0.36');
  });

  it('el sim arranca con ellas: la casa de F1 cableada, la tierra común y la pizarra', () => {
    const c = content();
    const s = createScene(casa, c);
    expect(Object.keys(s.map.sectors)).toHaveLength(37 + 6);
    expect(Object.keys(s.elements)).toHaveLength(6 + 7);
    expect(Object.keys(s.mobiles)).toHaveLength(2);
    expect(Object.keys(s.links)).toHaveLength(4);
    expect(s.elements.e4?.store).toEqual({ energia: 1_800_000 });
    expect(s.elements.e1?.store).toEqual({ comida: 20, madera: 0, piedra: 0 });
    expect(s.district.board?.encargo).toMatchObject({ id: 1, kind: 'energia_carga', at: 'e7' });
    // A medianoche las aperturas esperan a la luz de trabajo (6:30): la primera dura 5 minutos;
    // la segunda, ya no es la primera vez, 3 horas.
    const log: Order[] = [
      { seq: 1, tick: 0, actor: 'a', kind: 'reveal', args: { mobile: 'm1', hex: '1,0' } },
      { seq: 2, tick: 0, actor: 'a', kind: 'reveal', args: { mobile: 'm2', hex: '0,1' } },
    ];
    const early = replay(casa, log, 236_000, c);
    expect(early.map.sectors['1,0']?.status).toBe('hidden');
    const later = createScene(casa, c);
    advance(later, log, 240_000, c);
    expect(later.map.sectors['1,0']?.status).toBe('revealed');
    expect(later.map.sectors['0,1']?.status).toBe('hidden');
    advance(later, log, 234_000 + 108_000 + 100, c);
    expect(later.map.sectors['0,1']?.status).toBe('revealed');
  });

  it('recados: los sitios del común empiezan con los suyos y una ruta tiene horario conocido', () => {
    const c = content();
    const s = createScene({ ...casa, dayOffset: 10 * 36_000 }, c);
    const errands = Object.values(s.district.errands?.items ?? {});
    // Cocina 2, almacén 2, dispensario 1, punto de carga 1; las casas vecinas empiezan vacías.
    expect(errands).toHaveLength(6);
    expect(c.errands).toMatchObject({ stopTicks: 9_000, firstStopTicks: 600, maxStops: 8 });
    expect(c.places?.cocina_comun).toMatchObject({ capacity: 4, everyTicks: 144_000 });
    expect(c.mobiles.obrero_peon?.carry).toBe(4);
    const route = { actor: 'a', kind: 'route' as const, args: { mobile: 'm1', stops: ['e8', 'e9'] } };
    const first = quote(s, route, c);
    // A las 10:00 y la primera vez: dos paradas de 1 min, más los viajes (segundos).
    expect(first?.work).toBe(2 * 600);
    expect((first?.end ?? 0) - s.tick).toBeLessThan(2 * 600 + 600);
  });

  it('la plantilla de F0 sigue creando escena', () => {
    const s = createScene({ ...casa, template: 'f0_solo' }, content());
    expect(Object.keys(s.map.sectors)).toHaveLength(37);
    expect(s.district.board).toBeUndefined();
  });
});

describe('el compilador rechaza', () => {
  it('un decimal en una tabla', () => {
    const t = clone<RawTables>(tables);
    t.actions.reveal.seconds = 2.5;
    expect(() => compile(t)).toThrow(ContentError);
    expect(() => compile(t)).toThrow(/actions\/reveal\/seconds/);
  });

  it('una clave desconocida', () => {
    const t = clone(tables) as unknown as Record<string, Record<string, unknown>>;
    t.actions!.reveal = { ...(t.actions!.reveal as object), bonus: 1 };
    expect(() => compile(t as unknown as RawTables)).toThrow(/additional properties/);
  });

  it('una referencia rota', () => {
    const t = clone<RawTables>(tables);
    t.templates.f0_solo!.plots[0]!.archetype = 'inexistente';
    expect(() => compile(t)).toThrow(/arquetipo desconocido/);
    const u = clone<RawTables>(tables);
    u.archetypes.finca_prado!.finds.prado!.push({ kind: 'dragon', weight: 1 });
    expect(() => compile(u)).toThrow(/elemento desconocido dragon/);
  });

  it('una duración que no es múltiplo del tick', () => {
    const t = clone<RawTables>(tables);
    t.scenes.district.tickMs = 300;
    expect(() => compile(t)).toThrow(/múltiplo|comparten el tick/);
  });

  it('ticks distintos entre escenas', () => {
    const t = clone<RawTables>(tables);
    t.scenes.charge.tickMs = 50;
    expect(() => compile(t)).toThrow(/comparten el tick/);
  });

  it('una curva de luz desordenada o fuera del ciclo', () => {
    const t = clone<RawTables>(tables);
    t.scenes.charge.light = [
      [0, 1000],
      [400, 0],
    ];
    expect(() => compile(t)).toThrow(/se sale del ciclo/);
    const u = clone<RawTables>(tables);
    u.scenes.charge.light = [
      [200, 1000],
      [100, 0],
    ];
    expect(() => compile(u)).toThrow(/orden creciente/);
  });

  it('una tasa con un periodo que no existe', () => {
    const t = clone(tables) as unknown as { elements: Record<string, { produce: { per: string } }> };
    t.elements.panel!.produce.per = 'min';
    expect(() => compile(t as unknown as RawTables)).toThrow(/produce\/per/);
  });

  it('un recurso, un elemento o un nexo que no existen', () => {
    const t = clone<RawTables>(tables);
    t.tasks.talar!.gives = { oro: 1 };
    expect(() => compile(t)).toThrow(/recurso desconocido oro/);
    const u = clone<RawTables>(tables);
    u.board.encargos[0]!.at = 'castillo';
    expect(() => compile(u)).toThrow(/elemento desconocido castillo/);
    const w = clone<RawTables>(tables);
    w.archetypes.finca_prado!.start.links![0]!.b = 99;
    expect(() => compile(w)).toThrow(/fuera de la dotación/);
  });

  it('recados con destinos que no son sitios, o sitios que generan sin decir cada cuánto', () => {
    const t = clone<RawTables>(tables);
    t.recados.kinds.pan!.to = ['casa'];
    expect(() => compile(t)).toThrow(/no es un sitio de recados/);
    const u = clone<RawTables>(tables);
    u.places.cocina_comun!.makes = [{ kind: 'tarta', weight: 1 }];
    expect(() => compile(u)).toThrow(/recado desconocido tarta/);
    const w = clone<RawTables>(tables);
    delete w.places.cocina_comun!.every;
    expect(() => compile(w)).toThrow(/cada cuánto/);
  });

  it('flujos que no se pueden resolver', () => {
    const t = clone<RawTables>(tables);
    t.resources.energia!.order = 9;
    expect(() => compile(t)).toThrow(/tiene que ir antes/);
    const u = clone<RawTables>(tables);
    u.elements.huerta!.stores = { agua: 10 };
    expect(() => compile(u)).toThrow(/no almacena comida/);
  });
});
