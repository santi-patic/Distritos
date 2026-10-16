/**
 * Recorrido determinista de registros.
 *
 * El orden de iteración de un objeto en JavaScript depende de cómo se insertaron las claves,
 * así que el núcleo nunca itera un objeto directamente: pasa por aquí, que ordena las claves
 * por unidades de código UTF-16 (el mismo orden que usa el hash canónico). Único módulo con
 * Object.keys (ver eslint.config.js).
 */

/** Orden por unidades de código UTF-16, el de `<` entre cadenas. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortedKeys(record: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(record).sort(compareStrings);
}

/** Pares [clave, valor] en orden de clave. */
export function entries<V>(record: Readonly<Record<string, V>>): [string, V][] {
  const out: [string, V][] = [];
  for (const k of sortedKeys(record)) {
    const v = record[k];
    if (v !== undefined) out.push([k, v]);
  }
  return out;
}

/** Valores en orden de clave. */
export function values<V>(record: Readonly<Record<string, V>>): V[] {
  return entries(record).map(([, v]) => v);
}

export function isEmpty(record: Readonly<Record<string, unknown>>): boolean {
  return sortedKeys(record).length === 0;
}

export function size(record: Readonly<Record<string, unknown>>): number {
  return sortedKeys(record).length;
}
