import { describe, expect, it } from 'vitest';
import {
  MAX_INT,
  accrue,
  ceilDiv,
  fdiv,
  fmod,
  gcd,
  isqrt,
  lerp,
  mul,
  rate,
  tdiv,
  ticksUntil,
} from '../src/arith.js';

/** Generador sencillo para las pruebas (aquí sí puede haber coma flotante). */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function bigFloorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  const r = a % b;
  return r !== 0n && r < 0n !== b < 0n ? q - 1n : q;
}

describe('división entera contra BigInt', () => {
  const random = makeRandom(1);
  const cases: [number, number][] = [];
  // Cuatro familias: grandes/grandes, grandes/pequeños, junto al límite, pequeños con signo.
  for (let i = 0; i < 250_000; i++) {
    let a: number;
    let b: number;
    switch (i % 4) {
      case 0:
        a = Math.floor(random() * MAX_INT);
        b = 1 + Math.floor(random() * MAX_INT);
        break;
      case 1:
        a = Math.floor(random() * MAX_INT);
        b = 1 + Math.floor(random() * 1_048_576);
        break;
      case 2:
        a = MAX_INT - Math.floor(random() * 65_536);
        b = 1 + Math.floor(random() * 1_073_741_824);
        break;
      default:
        a = Math.floor(random() * 1_073_741_824);
        b = 1 + Math.floor(random() * 1_073_741_824);
    }
    if (random() < 0.5) a = -a;
    if (random() < 0.25) b = -b;
    cases.push([a, b]);
  }
  // Casos de borde fijos.
  cases.push(
    [MAX_INT, 1],
    [MAX_INT, MAX_INT],
    [MAX_INT, 2],
    [-MAX_INT, 3],
    [MAX_INT, 2 ** 27],
    [MAX_INT, 2 ** 26 + 1],
  );

  it('fdiv es la división al suelo exacta', () => {
    for (const [a, b] of cases) {
      expect(BigInt(fdiv(a, b))).toBe(bigFloorDiv(BigInt(a), BigInt(b)));
    }
  });

  it('tdiv es la división truncada exacta', () => {
    for (const [a, b] of cases) {
      expect(BigInt(tdiv(a, b))).toBe(BigInt(a) / BigInt(b));
    }
  });

  it('fmod cumple a = fdiv·b + fmod con signo del divisor', () => {
    for (const [a, b] of cases) {
      const m = fmod(a, b);
      expect(fdiv(a, b) * b + m).toBe(a);
      if (b > 0) expect(m >= 0 && m < b).toBe(true);
      else expect(m <= 0 && m > b).toBe(true);
    }
  });

  it('ceilDiv es el techo', () => {
    for (const [a, b] of cases) {
      const q = ceilDiv(a, b);
      const fl = bigFloorDiv(BigInt(a), BigInt(b));
      const expected = BigInt(a) % BigInt(b) === 0n ? fl : fl + 1n;
      expect(BigInt(q)).toBe(expected);
    }
  });

  it('rechaza dividir entre cero', () => {
    expect(() => fdiv(1, 0)).toThrow(RangeError);
  });
});

describe('isqrt', () => {
  it('cumple isqrt(n)² ≤ n < (isqrt(n)+1)² en bordes y al azar', () => {
    const random = makeRandom(7);
    const ns = [0, 1, 2, 3, 4, 8, 9, 15, 16, 17, 2 ** 52, MAX_INT, MAX_INT - 1];
    for (let i = 0; i < 200_000; i++) ns.push(Math.floor(random() * MAX_INT));
    for (let k = 0; k < 2000; k++) ns.push(k * k, k * k - 1, k * k + 1);
    for (const n of ns) {
      if (n < 0) continue;
      const s = isqrt(n);
      expect(BigInt(s) * BigInt(s) <= BigInt(n)).toBe(true);
      expect(BigInt(s + 1) * BigInt(s + 1) > BigInt(n)).toBe(true);
    }
  });
});

describe('tasas y acumuladores', () => {
  it('rate reduce la fracción', () => {
    expect(rate(1400, 100)).toEqual({ num: 140, den: 1 });
    expect(rate(7, 100)).toEqual({ num: 7, den: 10 });
    expect(rate(400, 200)).toEqual({ num: 80, den: 1 });
    expect(rate(0, 100)).toEqual({ num: 0, den: 1 });
  });

  it('accrue en bloque da lo mismo que tick a tick', () => {
    const random = makeRandom(3);
    for (let i = 0; i < 2000; i++) {
      const r = rate(Math.floor(random() * 100_000), 100);
      const ticks = Math.floor(random() * 5000);
      let carry = Math.floor(random() * r.den);
      const start = carry;
      let total = 0;
      for (let t = 0; t < ticks; t++) {
        const step = accrue(carry, r, 1);
        total += step.amount;
        carry = step.carry;
      }
      expect(accrue(start, r, ticks)).toEqual({ amount: total, carry });
    }
  });

  it('ticksUntil es el primer tick en que se alcanza la cantidad', () => {
    const random = makeRandom(5);
    for (let i = 0; i < 2000; i++) {
      const r = rate(1 + Math.floor(random() * 1000), 100);
      const amount = Math.floor(random() * 500);
      const carry = Math.floor(random() * r.den);
      const n = ticksUntil(carry, r, amount);
      expect(accrue(carry, r, n).amount >= amount).toBe(true);
      if (n > 0) expect(accrue(carry, r, n - 1).amount < amount).toBe(true);
    }
  });
});

describe('varios', () => {
  it('gcd', () => {
    expect(gcd(12, 18)).toBe(6);
    expect(gcd(0, 5)).toBe(5);
    expect(gcd(-12, 18)).toBe(6);
  });

  it('lerp interpola con enteros', () => {
    expect(lerp(0, 100, 0, 4)).toBe(0);
    expect(lerp(0, 100, 1, 4)).toBe(25);
    expect(lerp(0, 100, 4, 4)).toBe(100);
    expect(lerp(0, 10, 1, 3)).toBe(3);
    expect(lerp(10, 0, 1, 3)).toBe(6); // −10/3 al suelo es −4
  });

  it('mul rechaza desbordar los enteros seguros', () => {
    expect(() => mul(2 ** 26, 2 ** 26)).not.toThrow();
    expect(() => mul(2 ** 30, 2 ** 30)).toThrow(RangeError);
  });
});
