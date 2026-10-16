/**
 * @distritos/sim — simulación determinista compartida por cliente y servidor.
 *
 * Primera entrega (F0, tanda 1): los módulos del núcleo que no contienen diseño de juego y
 * que hacen que dos máquinas coincidan bit a bit: aritmética entera, azar sembrado,
 * hexágonos, serialización canónica y hash. Los tipos de estado, las órdenes y el paso de
 * tick llegan en la tanda siguiente. Ver «Esquema del paquete sim — F0».
 */

export * as arith from './arith.js';
export * as rng from './rng.js';
export * as hex from './hex.js';
export * as geom from './geom.js';
export * as iter from './iter.js';

export type { Int, Rate } from './arith.js';
export type { RngState } from './rng.js';
export type { Hex, HexKey, Lattice } from './hex.js';
export type { Vec } from './geom.js';

export { canon, hashOf, sha256Hex, shortHash } from './hash.js';
export { serialize, deserialize, clone, assertAllIntegers } from './serialize.js';
