/**
 * Contenido de prueba: un `CompiledContent` mínimo y fijo para la batería del sim, cargado
 * de `content.json` (sin hash; el hash se calcula al cargar, como hace el compilador).
 * No es el contenido del juego (ese vive en @distritos/content); cambiarlo cambia los dorados.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashOf } from '../src/hash.js';
import type { CompiledContent } from '../src/types/content.js';

export const TEST_CONTENT_PATH = join(import.meta.dirname, 'content.json');

export function testContent(): CompiledContent {
  const tables = JSON.parse(readFileSync(TEST_CONTENT_PATH, 'utf8')) as Omit<CompiledContent, 'hash'>;
  return { hash: hashOf(tables), ...tables };
}
