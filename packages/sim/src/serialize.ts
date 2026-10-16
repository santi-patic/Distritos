/**
 * Serialización del estado: texto canónico de ida, validación de enteros a la vuelta.
 *
 * Único módulo con JSON.parse (ver eslint.config.js): todo lo que entra por aquí se recorre
 * y cualquier número que no sea entero seguro se rechaza. La validación contra el esquema
 * del estado (TypeBox) se añade con los tipos de estado. Esquema del paquete sim, §12.1.
 */

import { canon } from './hash.js';
import { sortedKeys } from './iter.js';

/** JSON canónico. Idéntico al texto que se hashea. */
export function serialize(value: unknown): string {
  return canon(value);
}

function checkIntegers(value: unknown, path: string): void {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`deserialize: número no entero o inseguro en ${path}: ${String(value)}`);
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) checkIntegers(value[i], `${path}[${i}]`);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const k of sortedKeys(record)) checkIntegers(record[k], `${path}.${k}`);
}

/** Parsea JSON y comprueba que todo número es un entero seguro. El tipado fino lo hace quien llama. */
export function deserialize(json: string): unknown {
  const value: unknown = JSON.parse(json);
  checkIntegers(value, '$');
  return value;
}

/** Copia profunda de un valor JSON plano. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Recorre un valor y lanza si algún número no es entero seguro. Para las pruebas tras cada paso. */
export function assertAllIntegers(value: unknown): void {
  checkIntegers(value, '$');
}
