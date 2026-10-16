/**
 * Generador aleatorio con semilla dentro del estado.
 *
 * sfc32 (Chris Doty-Humphrey; cuatro palabras de 32 bits; suma, xor, desplazamiento y
 * rotación). La API es pura: cada tirada devuelve el valor y el estado nuevo, de modo que
 * cada uso del azar es visible en el código y queda en el estado, nunca fuera. La siembra
 * pasa por SHA-256 para que semillas vecinas den flujos independientes.
 * Único módulo, con hash.ts, donde se permiten operadores de bits y Math.imul.
 * Esquema del paquete sim, §11.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Int } from './arith.js';
import { fmod } from './arith.js';

/** Cuatro palabras de 32 bits, guardadas como enteros 0..2^32−1 (JSON-safe). */
export type RngState = readonly [Int, Int, Int, Int];

const TWO_32 = 4294967296;
const DISCARD = 12;

function word(bytes: Uint8Array, offset: number): Int {
  return (
    ((bytes[offset] ?? 0) * 16777216 +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

/**
 * Estado inicial a partir de una semilla (cadena, normalmente 16 hexadecimales) y un número
 * de flujo. Flujos distintos de la misma semilla son independientes.
 */
export function seed(seedHex: string, stream: Int = 0): RngState {
  const digest = sha256(utf8ToBytes(`${seedHex}:${stream}`));
  let state: RngState = [word(digest, 0), word(digest, 4), word(digest, 8), word(digest, 12)];
  for (let i = 0; i < DISCARD; i++) state = nextU32(state)[1];
  return state;
}

/** Siguiente palabra de 32 bits (0..2^32−1) y estado nuevo. */
export function nextU32(r: RngState): [Int, RngState] {
  let a = r[0] | 0;
  let b = r[1] | 0;
  let c = r[2] | 0;
  let d = r[3] | 0;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  return [t >>> 0, [a >>> 0, b >>> 0, c >>> 0, d >>> 0]];
}

/** Entero uniforme en 0..n−1 sin sesgo (muestreo por rechazo) y estado nuevo. */
export function nextInt(r: RngState, n: Int): [Int, RngState] {
  if (n <= 0 || n > TWO_32) throw new RangeError(`nextInt: n fuera de rango: ${n}`);
  const limit = TWO_32 - fmod(TWO_32, n);
  let state = r;
  for (;;) {
    const [v, next] = nextU32(state);
    state = next;
    if (v < limit) return [fmod(v, n), state];
  }
}

/** Elige un índice de una lista de pesos enteros no negativos; lanza si todos son cero. */
export function pickWeighted(r: RngState, weights: readonly Int[]): [Int, RngState] {
  let total = 0;
  for (const w of weights) {
    if (w < 0) throw new RangeError('pickWeighted: peso negativo');
    total += w;
  }
  if (total === 0) throw new RangeError('pickWeighted: todos los pesos son cero');
  const [v, state] = nextInt(r, total);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] ?? 0;
    if (v < acc) return [i, state];
  }
  return [weights.length - 1, state];
}

/** Subsemilla determinista: los 16 primeros hexadecimales de sha256(semilla ‖ etiqueta). */
export function derive(seedHex: string, label: string): string {
  return bytesToHex(sha256(utf8ToBytes(`${seedHex}|${label}`))).slice(0, 16);
}
