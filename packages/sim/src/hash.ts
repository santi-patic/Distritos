/**
 * Serialización canónica y hash de estado.
 *
 * `canon(value)` produce JSON canónico: claves ordenadas por unidades de código, sin espacios,
 * enteros en decimal, cadenas escapadas como JSON.stringify, `undefined` equivale a ausente.
 * Cualquier número que no sea entero seguro, y cualquier bigint, función, símbolo, Date, Map,
 * Set u objeto con prototipo propio provoca excepción: es la última red contra la coma
 * flotante y corre en cada hash de las pruebas. Esquema del paquete sim, §12.
 *
 * El hash es SHA-256 de los bytes UTF-8 del texto canónico, en hexadecimal.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { sortedKeys } from './iter.js';

const OBJECT_PROTO = Object.getPrototypeOf({}) as object;

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v) as object | null;
  return proto === OBJECT_PROTO || proto === null;
}

function write(value: unknown, out: string[], path: string): void {
  switch (typeof value) {
    case 'number':
      if (!Number.isSafeInteger(value)) {
        throw new TypeError(`canon: número no entero o inseguro en ${path}: ${String(value)}`);
      }
      // String(-0) es '0', así que el cero negativo no deja rastro.
      out.push(String(value));
      return;
    case 'string':
      out.push(JSON.stringify(value));
      return;
    case 'boolean':
      out.push(value ? 'true' : 'false');
      return;
    case 'object':
      break;
    default:
      throw new TypeError(`canon: tipo no serializable (${typeof value}) en ${path}`);
  }
  if (value === null) {
    out.push('null');
    return;
  }
  if (Array.isArray(value)) {
    out.push('[');
    for (let i = 0; i < value.length; i++) {
      if (i > 0) out.push(',');
      const item: unknown = value[i];
      if (item === undefined) throw new TypeError(`canon: undefined dentro de un array en ${path}[${i}]`);
      write(item, out, `${path}[${i}]`);
    }
    out.push(']');
    return;
  }
  if (!isPlainObject(value)) {
    throw new TypeError(`canon: objeto con prototipo propio (Date, Map, Set, clase…) en ${path}`);
  }
  const record = value as Record<string, unknown>;
  const keys = sortedKeys(record).filter((k) => record[k] !== undefined);
  out.push('{');
  let first = true;
  for (const k of keys) {
    if (!first) out.push(',');
    first = false;
    out.push(JSON.stringify(k), ':');
    write(record[k], out, `${path}.${k}`);
  }
  out.push('}');
}

/** JSON canónico de un valor. Lanza ante cualquier cosa que no sea JSON plano de enteros. */
export function canon(value: unknown): string {
  const out: string[] = [];
  write(value, out, '$');
  return out.join('');
}

/** SHA-256 en hexadecimal de los bytes UTF-8 de un texto. */
export function sha256Hex(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

/** Hash de un valor: SHA-256 de su JSON canónico. */
export function hashOf(value: unknown): string {
  return sha256Hex(canon(value));
}

/** Prefijo corto para registros y mensajes. */
export function shortHash(hash: string): string {
  return hash.slice(0, 16);
}
