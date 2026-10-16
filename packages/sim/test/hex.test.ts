import { describe, expect, it } from 'vitest';
import {
  DIRECTIONS,
  center,
  compare,
  distance,
  hex,
  key,
  nearest,
  neighbors,
  parse,
  range,
  ring,
  type Hex,
  type Lattice,
} from '../src/hex.js';

/** Retícula de 50 m de radio: hexW = 2·round(50000·√3/2), hexH = round(50000·3/2). */
const LAT: Lattice = { hexW: 86_602, hexH: 75_000 };

function makeRandom(seedValue: number): () => number {
  let s = seedValue >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('claves', () => {
  it('key y parse son inversas y canónicas', () => {
    for (const h of [hex(0, 0), hex(3, -2), hex(-7, 11)]) {
      expect(parse(key(h))).toEqual(h);
    }
    expect(() => parse('3')).toThrow(TypeError);
    expect(() => parse('03,2')).toThrow(TypeError);
    expect(() => parse('1.5,2')).toThrow();
  });
});

describe('vecinos y distancia', () => {
  it('las seis direcciones son cíclicas y a distancia 1', () => {
    for (let i = 0; i < 6; i++) {
      const d = DIRECTIONS[i] as Hex;
      const next = DIRECTIONS[(i + 1) % 6] as Hex;
      expect(distance(hex(0, 0), d)).toBe(1);
      expect(distance(d, next)).toBe(1);
    }
    expect(neighbors(hex(2, -1))).toHaveLength(6);
  });

  it('la distancia es simétrica y cumple la desigualdad triangular', () => {
    const random = makeRandom(11);
    for (let i = 0; i < 5000; i++) {
      const a = hex(Math.floor(random() * 41) - 20, Math.floor(random() * 41) - 20);
      const b = hex(Math.floor(random() * 41) - 20, Math.floor(random() * 41) - 20);
      const c = hex(Math.floor(random() * 41) - 20, Math.floor(random() * 41) - 20);
      expect(distance(a, b)).toBe(distance(b, a));
      expect(distance(a, c) <= distance(a, b) + distance(b, c)).toBe(true);
    }
  });
});

describe('anillos y rangos', () => {
  it('ring(n) tiene 6n sectores, todos a distancia n y sin repetidos', () => {
    const c = hex(3, -1);
    for (let n = 0; n <= 6; n++) {
      const r = ring(c, n);
      expect(r).toHaveLength(n === 0 ? 1 : 6 * n);
      expect(new Set(r.map(key)).size).toBe(r.length);
      for (const h of r) expect(distance(c, h)).toBe(n);
    }
  });

  it('range(n) tiene 3n²+3n+1 sectores, ordenados por (q, r)', () => {
    const c = hex(-2, 5);
    for (let n = 0; n <= 6; n++) {
      const r = range(c, n);
      expect(r).toHaveLength(3 * n * n + 3 * n + 1);
      for (const h of r) expect(distance(c, h) <= n).toBe(true);
      for (let i = 1; i < r.length; i++) expect(compare(r[i - 1]!, r[i]!) < 0).toBe(true);
    }
  });
});

describe('retícula entera', () => {
  it('el centro del origen es (0,0) y las filas alternan medio paso', () => {
    expect(center(hex(0, 0), LAT)).toEqual({ x: 0, y: 0 });
    expect(center(hex(1, 0), LAT)).toEqual({ x: 86_602, y: 0 });
    expect(center(hex(0, 1), LAT)).toEqual({ x: 43_301, y: 75_000 });
    expect(center(hex(-1, 2), LAT)).toEqual({ x: 0, y: 150_000 });
  });

  it('nearest coincide con la búsqueda por fuerza bruta', () => {
    const random = makeRandom(23);
    const brute = (x: number, y: number): Hex => {
      let best: Hex = hex(0, 0);
      let bd = Infinity;
      for (let r = -12; r <= 12; r++) {
        for (let q = -12; q <= 12; q++) {
          const c = center(hex(q, r), LAT);
          const d = (x - c.x) ** 2 + (y - c.y) ** 2;
          if (d < bd || (d === bd && compare(hex(q, r), best) < 0)) {
            bd = d;
            best = hex(q, r);
          }
        }
      }
      return best;
    };
    for (let i = 0; i < 20_000; i++) {
      const x = Math.floor(random() * (2 * LAT.hexW * 5 + 1)) - LAT.hexW * 5;
      const y = Math.floor(random() * (2 * LAT.hexH * 5 + 1)) - LAT.hexH * 5;
      expect(nearest({ x, y }, LAT)).toEqual(brute(x, y));
    }
    // Centros exactos y puntos sobre fronteras.
    for (const h of range(hex(0, 0), 3)) expect(nearest(center(h, LAT), LAT)).toEqual(h);
    expect(nearest({ x: 43_301, y: 0 }, LAT)).toEqual(brute(43_301, 0));
    expect(nearest({ x: 43_301, y: 37_500 }, LAT)).toEqual(brute(43_301, 37_500));
  });
});
