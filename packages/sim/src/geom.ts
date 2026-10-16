/**
 * Geometría entera en espacio continuo: posiciones en milímetros.
 * Lo que compara radios compara cuadrados; la raíz solo aparece al fijar una hora de llegada.
 */

import type { Int } from './arith.js';
import { isqrt, lerp, mul } from './arith.js';

export interface Vec {
  readonly x: Int;
  readonly y: Int;
}

export function vec(x: Int, y: Int): Vec {
  return { x, y };
}

export function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function equals(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Distancia al cuadrado; sin raíz. */
export function dist2(a: Vec, b: Vec): Int {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return mul(dx, dx) + mul(dy, dy);
}

/** Distancia entera (al suelo). */
export function dist(a: Vec, b: Vec): Int {
  return isqrt(dist2(a, b));
}

/** Punto a la fracción num/den del segmento a→b, componente a componente. */
export function lerpVec(a: Vec, b: Vec, num: Int, den: Int): Vec {
  return { x: lerp(a.x, b.x, num, den), y: lerp(a.y, b.y, num, den) };
}
