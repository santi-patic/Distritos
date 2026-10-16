/**
 * Aritmética entera del paquete sim.
 *
 * Único módulo donde se permiten `/`, `%` y Math.floor/trunc/abs/min/max (ver eslint.config.js).
 * Toda cantidad del estado es un entero seguro, |n| ≤ 2^53 − 1. El tipo `Int` es un alias
 * documental: lo hacen cumplir el lint, el serializador (que rechaza no enteros) y las pruebas,
 * que recorren el estado tras cada paso. Esquema del paquete sim, §6.
 */

/** Entero seguro: |n| ≤ 2^53 − 1. */
export type Int = number;

export const MAX_INT: Int = Number.MAX_SAFE_INTEGER;
export const MIN_INT: Int = Number.MIN_SAFE_INTEGER;

export function isInt(n: unknown): n is Int {
  return typeof n === 'number' && Number.isSafeInteger(n);
}

export function assertInt(n: number, what = 'valor'): Int {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`${what} no es un entero seguro: ${String(n)}`);
  }
  return n;
}

/**
 * División al suelo (hacia −∞). Para enteros seguros, `Math.floor(a / b)` coincide con la
 * división entera exacta: la división IEEE-754 está correctamente redondeada y la distancia de
 * un cociente no entero al entero siguiente, al menos 1/b, supera medio ulp. Lo comprueba
 * test/arith.test.ts contra BigInt.
 */
export function fdiv(a: Int, b: Int): Int {
  if (b === 0) throw new RangeError('división entre cero');
  return Math.floor(a / b);
}

/** División truncada (hacia cero). */
export function tdiv(a: Int, b: Int): Int {
  if (b === 0) throw new RangeError('división entre cero');
  return Math.trunc(a / b);
}

/** División al techo (hacia +∞). */
export function ceilDiv(a: Int, b: Int): Int {
  return -fdiv(-a, b);
}

/** Resto con el signo del divisor: a = fdiv(a, b)·b + fmod(a, b), 0 ≤ fmod(a, b) < b para b > 0. */
export function fmod(a: Int, b: Int): Int {
  return a - fdiv(a, b) * b;
}

export function abs(a: Int): Int {
  return Math.abs(a);
}

export function min(a: Int, b: Int): Int {
  return Math.min(a, b);
}

export function max(a: Int, b: Int): Int {
  return Math.max(a, b);
}

export function clamp(n: Int, lo: Int, hi: Int): Int {
  return n < lo ? lo : n > hi ? hi : n;
}

/** Producto comprobado: lanza si el resultado se sale de los enteros seguros. */
export function mul(a: Int, b: Int): Int {
  return assertInt(a * b, 'producto');
}

/** Máximo común divisor (Euclides) de dos enteros no negativos. */
export function gcd(a: Int, b: Int): Int {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0) {
    const t = fmod(x, y);
    x = y;
    y = t;
  }
  return x;
}

/**
 * Raíz cuadrada entera: isqrt(n)² ≤ n < (isqrt(n) + 1)². Newton con enteros; la estimación
 * inicial es una potencia de dos, de modo que x·x es exacto aunque supere 2^53.
 */
export function isqrt(n: Int): Int {
  if (n < 0) throw new RangeError('isqrt de un negativo');
  if (n < 2) return n;
  let x = 1;
  while (x * x <= n) x *= 2;
  let y = fdiv(x + fdiv(n, x), 2);
  while (y < x) {
    x = y;
    y = fdiv(x + fdiv(n, x), 2);
  }
  return x;
}

/** Interpolación entera: a + fdiv((b − a)·num, den). Con 0 ≤ num ≤ den devuelve un valor entre a y b. */
export function lerp(a: Int, b: Int, num: Int, den: Int): Int {
  return a + fdiv(mul(b - a, num), den);
}

/** Tasa por tick como fracción reducida. Esquema §6.4. */
export interface Rate {
  readonly num: Int;
  readonly den: Int;
}

/** `perSecond` unidades por segundo expresadas por tick de `tickMs` milisegundos: perSecond·tickMs/1000, reducida. */
export function rate(perSecond: Int, tickMs: Int): Rate {
  if (tickMs <= 0) throw new RangeError('tickMs debe ser positivo');
  const num = mul(perSecond, tickMs);
  const den = 1000;
  const g = gcd(num, den);
  return g === 0 ? { num: 0, den: 1 } : { num: fdiv(num, g), den: fdiv(den, g) };
}

/**
 * Acumulador de resto (Bresenham): la cantidad entera producida en `ticks` ticks a la tasa `r`
 * partiendo del resto `carry`, y el resto nuevo. accrue(carry, r, n) da exactamente lo mismo
 * que n llamadas de un tick; es lo que permite saltar tramos sin eventos sin perder una unidad.
 */
export function accrue(carry: Int, r: Rate, ticks: Int): { amount: Int; carry: Int } {
  const t = mul(r.num, ticks) + carry;
  return { amount: fdiv(t, r.den), carry: fmod(t, r.den) };
}

/** Ticks hasta que una tasa positiva acumula al menos `amount` unidades partiendo de `carry`. */
export function ticksUntil(carry: Int, r: Rate, amount: Int): Int {
  if (r.num <= 0) throw new RangeError('la tasa debe ser positiva');
  if (amount <= 0) return 0;
  return max(0, ceilDiv(mul(amount, r.den) - carry, r.num));
}
