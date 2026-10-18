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

/** Contenido de prueba de F1: la casa con almacenes, flujos y pizarra, con un día de 10 minutos. */
export const TEST_CONTENT_F1_PATH = join(import.meta.dirname, 'content-f1.json');

function load(path: string): CompiledContent {
  const tables = JSON.parse(readFileSync(path, 'utf8')) as Omit<CompiledContent, 'hash'>;
  return { hash: hashOf(tables), ...tables };
}

export function testContent(): CompiledContent {
  return load(TEST_CONTENT_PATH);
}

export function testContentF1(): CompiledContent {
  return load(TEST_CONTENT_F1_PATH);
}

/** Contenido de prueba de F1 con recados: el de F1 más sitios, recados, rutas y cocina y casas vecinas en el común. */
export const TEST_CONTENT_F1R_PATH = join(import.meta.dirname, 'content-f1r.json');

export function testContentF1R(): CompiledContent {
  return load(TEST_CONTENT_F1R_PATH);
}

/** El contenido de prueba por nombre de fichero, como lo indican los fixtures. */
export function testContentNamed(file: string | undefined): CompiledContent {
  return load(join(import.meta.dirname, file ?? 'content.json'));
}
