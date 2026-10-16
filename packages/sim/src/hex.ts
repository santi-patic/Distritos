/**
 * Hexágonos: solo niebla y pertenencia. Coordenadas axiales (q, r), punta arriba.
 *
 * Un hexágono regular tiene centros a √3·tamaño en horizontal, que no es entero; la retícula
 * se aproxima con dos enteros precomputados fuera del sim (`hexW` par y `hexH`), con error
 * del orden de 10^-6 que no toca ninguna regla. Esquema del paquete sim, §13.
 */

import type { Int } from './arith.js';
import { abs, assertInt, fdiv, fmod } from './arith.js';
import type { Vec } from './geom.js';
import { dist2 } from './geom.js';

export interface Hex {
  readonly q: Int;
  readonly r: Int;
}

/** Clave de sector: `${q},${r}`. */
export type HexKey = string;

export interface Lattice {
  /** Distancia horizontal entre centros de la misma fila; par. */
  readonly hexW: Int;
  /** Distancia vertical entre filas. */
  readonly hexH: Int;
}

export function hex(q: Int, r: Int): Hex {
  return { q, r };
}

export function key(h: Hex): HexKey {
  return `${h.q},${h.r}`;
}

export function keyOf(q: Int, r: Int): HexKey {
  return `${q},${r}`;
}

export function parse(k: HexKey): Hex {
  const i = k.indexOf(',');
  if (i < 0) throw new TypeError(`clave de sector inválida: ${k}`);
  const q = assertInt(Number(k.slice(0, i)), 'q');
  const r = assertInt(Number(k.slice(i + 1)), 'r');
  if (keyOf(q, r) !== k) throw new TypeError(`clave de sector no canónica: ${k}`);
  return { q, r };
}

export function equals(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r;
}

/** Orden total por (q, r): el que usan los recorridos y los desempates. */
export function compare(a: Hex, b: Hex): number {
  return a.q !== b.q ? a.q - b.q : a.r - b.r;
}

/** Las seis direcciones, en el orden fijo del esquema. */
export const DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
] as const satisfies readonly Hex[];

export function addHex(a: Hex, b: Hex): Hex {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function neighbors(h: Hex): Hex[] {
  return DIRECTIONS.map((d) => addHex(h, d));
}

export function distance(a: Hex, b: Hex): Int {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return fdiv(abs(dq) + abs(dr) + abs(dq + dr), 2);
}

export function assertLattice(lat: Lattice): void {
  if (lat.hexW <= 0 || lat.hexH <= 0) throw new RangeError('retícula con medidas no positivas');
  if (fmod(lat.hexW, 2) !== 0) throw new RangeError('hexW debe ser par');
}

/** Centro de un sector en milímetros. */
export function center(h: Hex, lat: Lattice): Vec {
  return { x: h.q * lat.hexW + h.r * fdiv(lat.hexW, 2), y: h.r * lat.hexH };
}

/**
 * Sector al que pertenece un punto: la celda de Voronoi de la retícula, con enteros.
 * Se estima fila y columna por división y se elige, entre las nueve celdas vecinas, la de
 * centro más cercano; en empate, la menor por (q, r). Comprobado contra fuerza bruta.
 */
export function nearest(p: Vec, lat: Lattice): Hex {
  const half = fdiv(lat.hexW, 2);
  const r0 = fdiv(p.y + fdiv(lat.hexH, 2), lat.hexH);
  const q0 = fdiv(p.x - r0 * half + half, lat.hexW);
  let best: Hex = { q: q0, r: r0 };
  let bestD = dist2(p, center(best, lat));
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const h = { q: q0 + i, r: r0 + j };
      const d = dist2(p, center(h, lat));
      if (d < bestD || (d === bestD && compare(h, best) < 0)) {
        best = h;
        bestD = d;
      }
    }
  }
  return best;
}

/** Los 6n sectores a distancia exactamente n (n ≥ 1), en orden fijo; el propio centro si n = 0. */
export function ring(c: Hex, n: Int): Hex[] {
  if (n < 0) throw new RangeError('ring: radio negativo');
  if (n === 0) return [c];
  const out: Hex[] = [];
  const start = DIRECTIONS[4];
  let h: Hex = { q: c.q + start.q * n, r: c.r + start.r * n };
  for (const d of DIRECTIONS) {
    for (let k = 0; k < n; k++) {
      out.push(h);
      h = addHex(h, d);
    }
  }
  return out;
}

/** Los 3n²+3n+1 sectores a distancia ≤ n, ordenados por (q, r). */
export function range(c: Hex, n: Int): Hex[] {
  if (n < 0) throw new RangeError('range: radio negativo');
  const out: Hex[] = [];
  for (let dq = -n; dq <= n; dq++) {
    const lo = -n > -dq - n ? -n : -dq - n;
    const hi = n < -dq + n ? n : -dq + n;
    for (let dr = lo; dr <= hi; dr++) out.push({ q: c.q + dq, r: c.r + dr });
  }
  return out;
}
