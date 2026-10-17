/**
 * @distritos/content — tablas de contenido validadas por esquema y su compilador.
 *
 * `content()` devuelve el `CompiledContent` de las tablas del repositorio; `compile(tables)`
 * compila unas tablas cualesquiera (para recargar en caliente o para pruebas). Todo número
 * de equilibrio del juego vive en `tables/`, nunca en código.
 */

import type { CompiledContent } from '@distritos/sim';
import { compile } from './compile.js';
import { tables } from './tables.js';

export { compile, validateTables, ContentError } from './compile.js';
export { schemas } from './schemas.js';
export { tables } from './tables.js';
export type {
  RawTables,
  RawScene,
  RawArchetype,
  RawTemplate,
  RawElement,
  RawMobile,
  RawTerrain,
  RawActions,
  TableName,
} from './raw.js';
export { TABLE_NAMES } from './raw.js';

let cached: CompiledContent | null = null;

/** Las tablas del repositorio, compiladas una vez. */
export function content(): CompiledContent {
  cached ??= compile(tables);
  return cached;
}
