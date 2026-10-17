import { describe, expect, it } from 'vitest';
import { assertAllIntegers, createScene, hashOf, replay, type Order } from '@distritos/sim';
import { ContentError, compile, content, tables, validateTables, type RawTables } from '../src/index.js';

function clone<T>(v: T): T {
  return structuredClone(v);
}

describe('tablas del repositorio', () => {
  it('cumplen su esquema y compilan', () => {
    expect(validateTables(tables)).toEqual([]);
    const c = content();
    expect(c.hash).toMatch(/^[0-9a-f]{64}$/);
    assertAllIntegers(c);
  });

  it('convierten unidades: segundos a ticks y hexágono a retícula entera', () => {
    const c = content();
    expect(c.scenes.district.tickMs).toBe(100);
    expect(c.scenes.district.dayTicks).toBe(864_000);
    expect(c.scenes.district.light[2]).toEqual([270_000, 1000]);
    expect(c.scenes.district.hexW).toBe(86_602);
    expect(c.scenes.district.hexH).toBe(75_000);
    expect(c.scenes.district.maxCatchupTicks).toBe(30 * 864_000);
    expect(c.actions.reveal).toEqual({ resource: 'energia', cost: 360_000, ticks: 50 });
    expect(c.mobiles.obrero_peon?.stats.speed).toBe(20_000);
  });

  it('el hash es el del contenido compilado y es estable', () => {
    const c = content();
    const { hash, ...rest } = c;
    expect(hashOf(rest)).toBe(hash);
    expect(compile(tables).hash).toBe(hash);
  });

  it('el sim arranca con ellas: plantilla f0_solo, 37 sectores, seis elementos y dos obreros', () => {
    const c = content();
    const s = createScene(
      { kind: 'district', template: 'f0_solo', seed: 'abcdef0123456789', actors: [{ id: 'a', plot: 'p1' }] },
      c,
    );
    expect(Object.keys(s.map.sectors)).toHaveLength(37);
    expect(Object.keys(s.elements)).toHaveLength(6);
    expect(Object.keys(s.mobiles)).toHaveLength(2);
    const log: Order[] = [
      { seq: 1, tick: 0, actor: 'a', kind: 'reveal', args: { mobile: 'm1', hex: '1,0' } },
      { seq: 2, tick: 0, actor: 'a', kind: 'reveal', args: { mobile: 'm2', hex: '0,1' } },
    ];
    const end = replay(
      { kind: 'district', template: 'f0_solo', seed: 'abcdef0123456789', actors: [{ id: 'a', plot: 'p1' }] },
      log,
      2_000,
      c,
    );
    expect(end.map.sectors['1,0']?.status).toBe('revealed');
    expect(end.map.sectors['0,1']?.status).toBe('revealed');
    expect(end.actors.a?.stocks.energia).toBe(3_600_000 - 2 * 360_000);
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
});
