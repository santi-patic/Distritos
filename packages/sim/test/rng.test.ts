import { describe, expect, it } from 'vitest';
import { derive, nextInt, nextU32, pickWeighted, seed, type RngState } from '../src/rng.js';

/** Implementación de referencia de sfc32 (bryc, dominio público), como cierre con estado mutable. */
function referenceSfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
}

describe('sfc32', () => {
  it('coincide con la implementación de referencia', () => {
    const s0: RngState = [1, 2, 3, 4];
    const ref = referenceSfc32(1, 2, 3, 4);
    let s = s0;
    for (let i = 0; i < 10_000; i++) {
      const [v, next] = nextU32(s);
      expect(v).toBe(ref());
      s = next;
    }
  });

  it('vectores fijos: cambiarlos es cambiar el generador', () => {
    expect(seed('0123456789abcdef', 0)).toEqual([1553732927, 2031215328, 3373670388, 2472036705]);
    let s = seed('0123456789abcdef', 0);
    const out: number[] = [];
    for (let i = 0; i < 8; i++) {
      const [v, next] = nextU32(s);
      out.push(v);
      s = next;
    }
    expect(out).toEqual([
      1762017664, 508351239, 1237502937, 346624775, 3661021810, 710374653, 2807250411, 2999539067,
    ]);

    let s1 = seed('0123456789abcdef', 1);
    const ints: number[] = [];
    for (let i = 0; i < 8; i++) {
      const [v, next] = nextInt(s1, 6);
      ints.push(v);
      s1 = next;
    }
    expect(ints).toEqual([4, 2, 2, 2, 5, 0, 3, 2]);
    expect(derive('0123456789abcdef', 'district:1')).toBe('67b535a5285c4b06');
  });

  it('el estado es puro: la misma entrada da la misma salida y no muta', () => {
    const s = seed('ff', 3);
    const frozen = Object.freeze([...s]) as unknown as RngState;
    const [v1, n1] = nextU32(frozen);
    const [v2, n2] = nextU32(frozen);
    expect(v1).toBe(v2);
    expect(n1).toEqual(n2);
    expect(frozen).toEqual(s);
  });

  it('las palabras del estado son enteros 0..2^32−1 (JSON-safe)', () => {
    let s = seed('abc', 0);
    for (let i = 0; i < 1000; i++) {
      for (const w of s) {
        expect(Number.isSafeInteger(w)).toBe(true);
        expect(w >= 0 && w < 4294967296).toBe(true);
      }
      s = nextU32(s)[1];
    }
  });

  it('semillas y flujos distintos dan secuencias distintas', () => {
    const a = seed('0123456789abcdef', 0);
    const b = seed('0123456789abcdef', 1);
    const c = seed('0123456789abcdee', 0);
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('nextInt está en rango y es aproximadamente uniforme', () => {
    let s = seed('uniforme', 0);
    const n = 7;
    const counts = new Array<number>(n).fill(0);
    const draws = 70_000;
    for (let i = 0; i < draws; i++) {
      const [v, next] = nextInt(s, n);
      expect(v >= 0 && v < n).toBe(true);
      counts[v] = (counts[v] ?? 0) + 1;
      s = next;
    }
    for (const c of counts) expect(Math.abs(c - draws / n) < draws / n / 10).toBe(true);
  });

  it('pickWeighted respeta pesos nulos', () => {
    let s = seed('pesos', 0);
    for (let i = 0; i < 1000; i++) {
      const [idx, next] = pickWeighted(s, [0, 5, 0, 1]);
      expect(idx === 1 || idx === 3).toBe(true);
      s = next;
    }
    expect(() => pickWeighted(s, [0, 0])).toThrow(RangeError);
  });
});
