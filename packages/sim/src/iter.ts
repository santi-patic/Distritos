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

/** Borra una clave de un registro. Único sitio con `delete` dinámico. */
export function removeKey(record: Record<string, unknown>, key: string): void {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete record[key];
}

/** Valor de un registro que tiene que existir; lanza con un mensaje claro si no. */
export function get<V>(record: Readonly<Record<string, V>>, key: string, what = 'clave'): V {
  const v = record[key];
  if (v === undefined) throw new Error(`${what} no encontrada: ${key}`);
  return v;
}

/** Elemento de una lista que tiene que existir. */
export function at<T>(list: readonly T[], index: number, what = 'índice'): T {
  const v = list[index];
  if (v === undefined) throw new Error(`${what} fuera de rango: ${index}`);
  return v;
}
