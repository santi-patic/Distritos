#!/usr/bin/env python3
"""Prepara el arte de Distritos a partir de los originales del autor.

Uso:
    python3 -I tools/arte/preparar.py ORIGINALES SALIDA [--hojas CARPETA]

ORIGINALES es una carpeta fuera del repositorio con los PNG tal como salen del generador
(nombres de «Grafismos de F1»: el_casa.png, ter_prado_1.png...). SALIDA es
packages/client/public/arte: ahí van las versiones reducidas, que son las que se publican.

- Cosas (el_, rec_, sit_, ob_): fondo transparente o magenta plano (#FF00FF), que se recorta;
  se limpia la neblina del recorte, se ajusta al contenido, se centra en un cuadrado y se reduce
  a 256 px (WebP con transparencia).
- Terreno (ter_): se hace repetible sin costuras con un corte de error mínimo en cada eje (como
  en el «image quilting» de Efros y Freeman) y se reduce a 1024 px (WebP).
- Con --hojas, deja en CARPETA las hojas de contacto: cada cosa a 24 y 48 px sobre el fondo del
  juego y sobre cada terreno, en color y en gris, y cada terreno repetido 2 × 2 para ver costuras.

Necesita Pillow y numpy. Nada de esto decide reglas: solo imágenes.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

THING_PREFIXES = ("el_", "rec_", "sit_", "ob_")
THING_SIZE = 256
TERRAIN_SIZE = 1024
# Alfa por debajo de esto es neblina del recorte; por encima, opaco con ruido del generador.
ALPHA_FLOOR = 16
ALPHA_CEIL = 240
# Margen alrededor del contenido, en fracción del lado.
MARGIN = 0.02
# Banda de solape para quitar costuras, en fracción del lado.
SEAM_BAND = 0.10
SEAM_FEATHER = 3.0
BG = (15, 24, 32)


def is_magenta(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    return (r > 200) & (b > 200) & (g < 80)


def clean_thing(im: Image.Image) -> Image.Image:
    """Recorta el fondo, limpia la neblina y deja el contenido centrado en un cuadrado."""
    rgba = np.asarray(im.convert("RGBA")).copy()
    has_alpha = (rgba[..., 3] < 250).mean() > 0.05
    if not has_alpha:
        # Sin transparencia: el fondo tiene que ser magenta plano.
        key = is_magenta(rgba[..., :3])
        if key.mean() < 0.05:
            raise ValueError("ni transparencia ni fondo magenta")
        rgba[..., 3] = np.where(key, 0, 255)
    a = rgba[..., 3].astype(int)
    a = np.where(a < ALPHA_FLOOR, 0, np.where(a >= ALPHA_CEIL, 255, a))
    rgba[..., 3] = a.astype(np.uint8)
    rgba[a == 0, :3] = 0
    out = Image.fromarray(rgba, "RGBA")
    box = out.getchannel("A").getbbox()
    if box is None:
        raise ValueError("imagen vacía")
    out = out.crop(box)
    w, h = out.size
    side = int(round(max(w, h) * (1 + 2 * MARGIN)))
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(out, ((side - w) // 2, (side - h) // 2))
    return square


def min_cut_path(err: np.ndarray) -> np.ndarray:
    """Camino vertical de error mínimo por una banda (una columna por fila, saltos de uno)."""
    h, w = err.shape
    cost = err.astype(np.float64).copy()
    for y in range(1, h):
        prev = cost[y - 1]
        left = np.concatenate(([np.inf], prev[:-1]))
        right = np.concatenate((prev[1:], [np.inf]))
        cost[y] += np.minimum(np.minimum(left, prev), right)
    path = np.zeros(h, dtype=int)
    path[-1] = int(np.argmin(cost[-1]))
    for y in range(h - 2, -1, -1):
        x = path[y + 1]
        lo, hi = max(0, x - 1), min(w, x + 2)
        path[y] = lo + int(np.argmin(cost[y, lo:hi]))
    return path


def seamless_x(img: np.ndarray, band: int) -> np.ndarray:
    """Quita la costura horizontal: la salida mide W - band y su borde derecho sigue en el izquierdo.

    Las primeras `band` columnas pasan, por un corte de error mínimo, de las columnas que en el
    original venían después del final de la salida a las del principio.
    """
    h, w, _ = img.shape
    after = img[:, w - band : w]
    start = img[:, 0:band]
    err = ((after - start) ** 2).sum(axis=2)
    path = min_cut_path(err)
    xs = np.arange(band)[None, :]
    weight = np.clip(0.5 + (xs - path[:, None]) / (2 * SEAM_FEATHER), 0, 1)[..., None]
    blended = after * (1 - weight) + start * weight
    return np.concatenate([blended, img[:, band : w - band]], axis=1)


def wrap_resize(img: np.ndarray, size: int) -> Image.Image:
    """Reduce una textura repetible teniendo en cuenta que sus bordes continúan en el lado opuesto."""
    h, w, _ = img.shape
    pad = max(8, w // 32)
    padded = np.pad(img, ((pad, pad), (pad, pad), (0, 0)), mode="wrap")
    src = Image.fromarray(np.clip(padded, 0, 255).astype(np.uint8), "RGB")
    return src.resize((size, size), Image.LANCZOS, box=(pad, pad, pad + w, pad + h))


def make_terrain(im: Image.Image) -> Image.Image:
    img = np.asarray(im.convert("RGB")).astype(np.float64)
    side = min(img.shape[0], img.shape[1])
    img = img[:side, :side]
    band = int(side * SEAM_BAND)
    img = seamless_x(img, band)
    img = np.transpose(seamless_x(np.transpose(img, (1, 0, 2)), band), (1, 0, 2))
    return wrap_resize(img, TERRAIN_SIZE)


def seam_score(im: Image.Image) -> tuple[float, float]:
    """Diferencia media entre columnas vecinas dentro y entre la última y la primera."""
    a = np.asarray(im.convert("RGB")).astype(int)
    inner = float(np.abs(a[:, 1:] - a[:, :-1]).mean())
    wrap = float(np.abs(a[:, -1] - a[:, 0]).mean())
    return inner, wrap


def font(size: int) -> ImageFont.ImageFont:
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",):
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def contact_sheet(things: dict[str, Image.Image], terrains: dict[str, Image.Image]) -> Image.Image:
    """Una fila por cosa: a 24, 32 y 48 px sobre el fondo del juego y sobre cada terreno, y a 128."""
    sizes = (24, 32, 48)
    backs: list[tuple[str, Image.Image | None]] = [("fondo del juego", None)] + [
        (k, v) for k, v in sorted(terrains.items())
    ]
    cell = 64
    big = 128
    label_w = 120
    group = len(sizes) * cell + 12
    width = label_w + len(backs) * group + big + 24
    height = 56 + max(1, len(things)) * (big + 16)
    sheet = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(sheet)
    f = font(14)
    small_f = font(12)
    x = label_w
    for name, _ in backs:
        draw.text((x + 4, 8), name, fill=(238, 242, 239), font=f)
        for i, s in enumerate(sizes):
            draw.text((x + i * cell + 4, 30), f"{s} px", fill=(160, 172, 180), font=small_f)
        x += group
    draw.text((x + 8, 30), f"{big} px", fill=(160, 172, 180), font=small_f)
    y = 56
    for name, thing in sorted(things.items()):
        draw.text((8, y + big // 2 - 8), name, fill=(238, 242, 239), font=f)
        x = label_w
        for _, back in backs:
            for s in sizes:
                tile = Image.new("RGB", (cell, cell), BG)
                if back is not None:
                    tile = back.resize((384, 384), Image.LANCZOS).crop((0, 0, cell, cell))
                small = thing.resize((s, s), Image.LANCZOS)
                tile.paste(small, ((cell - s) // 2, (cell - s) // 2), small)
                sheet.paste(tile, (x, y + (big - cell) // 2))
                x += cell
            x += 12
        large = thing.resize((big, big), Image.LANCZOS)
        sheet.paste(large, (x + 8, y), large)
        y += big + 16
    return sheet


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("originales", type=Path)
    ap.add_argument("salida", type=Path)
    ap.add_argument("--hojas", type=Path)
    args = ap.parse_args()
    args.salida.mkdir(parents=True, exist_ok=True)
    things: dict[str, Image.Image] = {}
    terrains: dict[str, Image.Image] = {}
    for src in sorted(args.originales.iterdir()):
        if src.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        name = src.stem.lower()
        im = Image.open(src)
        if name.startswith("ter_"):
            out = make_terrain(im)
            before = seam_score(im)
            after = seam_score(out)
            out.save(args.salida / f"{name}.webp", "WEBP", quality=82, method=6)
            terrains[name] = out
            print(
                f"{name}: {im.size[0]}→{TERRAIN_SIZE} px; costura antes {before[1]:.1f} "
                f"(dentro {before[0]:.1f}), después {after[1]:.1f} (dentro {after[0]:.1f})"
            )
        elif name.startswith(THING_PREFIXES):
            sq = clean_thing(im)
            out = sq.resize((THING_SIZE, THING_SIZE), Image.LANCZOS)
            out.save(args.salida / f"{name}.webp", "WEBP", quality=90, alpha_quality=100, method=6)
            things[name] = out
            print(f"{name}: {im.size[0]}×{im.size[1]} → contenido {sq.size[0]} px → {THING_SIZE} px")
        else:
            print(f"{src.name}: nombre sin prefijo conocido, se salta", file=sys.stderr)
    if args.hojas is not None:
        args.hojas.mkdir(parents=True, exist_ok=True)
        sheet = contact_sheet(things, terrains)
        sheet.save(args.hojas / "hoja-color.png")
        ImageOps.grayscale(sheet).save(args.hojas / "hoja-gris.png")
        for name, t in terrains.items():
            tiled = Image.new("RGB", (2 * TERRAIN_SIZE, 2 * TERRAIN_SIZE))
            for dx in (0, 1):
                for dy in (0, 1):
                    tiled.paste(t, (dx * TERRAIN_SIZE, dy * TERRAIN_SIZE))
            tiled.resize((TERRAIN_SIZE, TERRAIN_SIZE), Image.LANCZOS).save(args.hojas / f"{name}-2x2.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
