import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canon, hashOf, sha256Hex, shortHash } from '../src/hash.js';
import { assertAllIntegers, clone, deserialize, serialize } from '../src/serialize.js';

describe('JSON canónico', () => {
  it('ordena claves, omite undefined y no mete espacios', () => {
    expect(canon({ b: [1, 2, { z: null, a: 'x' }], a: true, c: undefined })).toBe(
      '{"a":true,"b":[1,2,{"a":"x","z":null}]}',
    );
  });

  it('el orden de inserción de las claves no cambia el texto', () => {
    const a = { tick: 1, map: { '1,0': { q: 1, r: 0 }, '0,1': { q: 0, r: 1 } }, rng: [1, 2, 3, 4] };
    const b = { rng: [1, 2, 3, 4], map: { '0,1': { q: 0, r: 1 }, '1,0': { q: 1, r: 0 } }, tick: 1 };
    expect(canon(a)).toBe(canon(b));
    expect(hashOf(a)).toBe(hashOf(b));
  });

  it('ordena por unidades de código, no por locale', () => {
    expect(canon({ b: 1, B: 2, a: 3, '1': 4, _: 5 })).toBe('{"1":4,"B":2,"_":5,"a":3,"b":1}');
  });

  it('escapa cadenas como JSON.stringify', () => {
    expect(canon({ s: 'a"b\\c\né' })).toBe('{"s":"a\\"b\\\\c\\né"}');
  });

  it('el cero negativo no deja rastro', () => {
    expect(canon({ x: -0 })).toBe('{"x":0}');
  });

  it('rechaza decimales, NaN, infinitos, bigint, funciones, Date, Map y Set', () => {
    expect(() => canon({ x: 0.5 })).toThrow(TypeError);
    expect(() => canon({ x: Number.NaN })).toThrow(TypeError);
    expect(() => canon({ x: Number.POSITIVE_INFINITY })).toThrow(TypeError);
    expect(() => canon({ x: 2 ** 53 })).toThrow(TypeError);
    expect(() => canon({ x: 1n })).toThrow(TypeError);
    expect(() => canon({ x: () => 1 })).toThrow(TypeError);
    expect(() => canon({ x: new Date(0) })).toThrow(TypeError);
    expect(() => canon({ x: new Map() })).toThrow(TypeError);
    expect(() => canon({ x: new Set() })).toThrow(TypeError);
    expect(() => canon([1, undefined])).toThrow(TypeError);
    expect(() => canon({ x: 2 ** 53 - 1 })).not.toThrow();
  });

  it('señala la ruta del valor que falla', () => {
    expect(() => canon({ map: { sectors: [{ q: 1.5 }] } })).toThrow(/\$\.map\.sectors\[0\]\.q/);
  });
});

describe('hash', () => {
  it('sha256Hex coincide con node:crypto', () => {
    for (const text of ['', '{}', 'hola', canon({ a: [1, 2, 3], b: 'ñ' })]) {
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
    }
  });

  it('vectores fijos: cambiarlos es cambiar la serialización', () => {
    expect(hashOf({})).toBe('44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a');
    expect(hashOf({ tick: 42, rng: [1, 2, 3, 4], map: { sectors: { '0,0': { q: 0, r: 0 } } } })).toBe(
      '1c6c2b8f2509713310f716280291e737535015845e0b23b6df05bdd2f0f253ec',
    );
    expect(shortHash(hashOf({}))).toBe('44136fa355b3678a');
  });
});

describe('serialización', () => {
  const state = {
    v: 1,
    tick: 7,
    rng: [5, 6, 7, 8],
    map: { sectors: { '0,0': { q: 0, r: 0, status: 'revealed' } } },
  };

  it('ida y vuelta conserva el hash', () => {
    const text = serialize(state);
    const back = deserialize(text);
    expect(hashOf(back)).toBe(hashOf(state));
    expect(serialize(back)).toBe(text);
  });

  it('clone conserva el hash y es independiente', () => {
    const copy = clone(state);
    expect(hashOf(copy)).toBe(hashOf(state));
    copy.tick = 8;
    expect(state.tick).toBe(7);
  });

  it('deserialize rechaza números no enteros', () => {
    expect(() => deserialize('{"x":1.5}')).toThrow(TypeError);
    expect(() => deserialize('{"x":1e400}')).toThrow(TypeError);
    expect(() => deserialize('{"x":9007199254740993}')).toThrow(TypeError);
    expect(deserialize('{"x":1.0}')).toEqual({ x: 1 });
  });

  it('assertAllIntegers recorre el estado', () => {
    expect(() => {
      assertAllIntegers(state);
    }).not.toThrow();
    expect(() => {
      assertAllIntegers({ a: [{ b: { c: 0.1 } }] });
    }).toThrow(/\$\.a\[0\]\.b\.c/);
  });
});

describe('versión de las reglas', () => {
  it('RULES_VERSION es la versión del paquete: entra en el hash de cada estado', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { RULES_VERSION } = await import('../src/version.js');
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(RULES_VERSION).toBe(pkg.version);
  });
});
