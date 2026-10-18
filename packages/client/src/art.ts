/**
 * Arte dibujado (regla 6 enmendada, P17): una textura por terreno y un dibujo por tipo de cosa.
 * Los archivos están en `src/arte` con los nombres de «Grafismos de F1» (`el_casa.webp`,
 * `ter_prado_1.webp`...) y salen de `tools/arte/preparar.py`. Lo que no tiene dibujo se pinta en
 * vector como siempre, y con `?arte=0` se pinta todo en vector. El estado nunca va en el dibujo:
 * sigue en los anillos, los nexos y las rutas.
 */

import { Assets, type Texture } from 'pixi.js';

/** Los archivos de arte que hay en la construcción: nombre de archivo → URL. */
const FILES: Readonly<Record<string, string>> = import.meta.glob<string>('./arte/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Prefijos de las cosas dibujadas; tras el prefijo va el tipo de elemento de las tablas. */
const THING_PREFIXES = ['el_', 'rec_', 'sit_'] as const;

export interface ArtIndex {
  /** Tipo de elemento → URL de su dibujo. */
  readonly things: Readonly<Record<string, string>>;
  /** Terreno → URLs de sus variantes, en orden. */
  readonly terrains: Readonly<Record<string, readonly string[]>>;
}

export interface Art {
  readonly things: Readonly<Record<string, Texture>>;
  readonly terrains: Readonly<Record<string, readonly Texture[]>>;
}

export const NO_ART: Art = { things: {}, terrains: {} };

/** Ordena los archivos por lo que dibujan; lo que no siga los nombres acordados se ignora. */
export function artIndex(files: Readonly<Record<string, string>> = FILES): ArtIndex {
  const things: Record<string, string> = {};
  const variants: Record<string, [number, string][]> = {};
  for (const path of Object.keys(files).sort()) {
    const url = files[path];
    const name = /([a-z0-9_]+)\.webp$/.exec(path)?.[1];
    if (url === undefined || name === undefined) continue;
    const terrain = /^ter_([a-z0-9]+(?:_[a-z0-9]+)*?)_(\d+)$/.exec(name);
    if (terrain !== null) {
      const [, kind, n] = terrain;
      if (kind !== undefined && n !== undefined) (variants[kind] ??= []).push([Number(n), url]);
      continue;
    }
    const prefix = THING_PREFIXES.find((p) => name.startsWith(p));
    if (prefix !== undefined) things[name.slice(prefix.length)] = url;
  }
  const terrains: Record<string, string[]> = {};
  for (const [kind, list] of Object.entries(variants)) {
    terrains[kind] = list.sort((a, b) => a[0] - b[0]).map(([, url]) => url);
  }
  return { things, terrains };
}

/** `?arte=0` apaga el arte para comparar con la vista vectorial. */
export function artEnabled(search: string): boolean {
  return new URLSearchParams(search).get('arte') !== '0';
}

async function load(url: string): Promise<Texture | null> {
  try {
    // Con mipmaps: los dibujos se ven a 20-60 px y el terreno a una fracción de su tamaño.
    return await Assets.load<Texture>({ src: url, data: { autoGenerateMipmaps: true } });
  } catch {
    // Un dibujo que no carga se queda en vector; el juego no depende de él.
    return null;
  }
}

/** Carga todo el arte de la construcción; lo que falle se queda en vector. */
export async function loadArt(index: ArtIndex = artIndex()): Promise<Art> {
  const things: Record<string, Texture> = {};
  const terrains: Record<string, Texture[]> = {};
  await Promise.all([
    ...Object.entries(index.things).map(async ([kind, url]) => {
      const tex = await load(url);
      if (tex !== null) things[kind] = tex;
    }),
    ...Object.entries(index.terrains).map(async ([kind, urls]) => {
      const list = await Promise.all(urls.map(load));
      const ok = list.filter((t): t is Texture => t !== null);
      if (ok.length > 0) terrains[kind] = ok;
    }),
  ]);
  return { things, terrains };
}
