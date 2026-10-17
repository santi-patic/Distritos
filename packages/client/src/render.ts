/**
 * Dibujo de la vista con PixiJS, siguiendo el alfabeto gráfico del espacio de diseño:
 * una forma por categoría (círculo fijo, rombo recurso, triángulo móvil, hexágono terreno),
 * un color por función, el estado en un anillo, el tamaño es el nivel, nada de texto en el
 * mapa. Aquí sí hay coma flotante: lo que se dibuja no decide nada.
 */

import { Application, Graphics } from 'pixi.js';
import {
  hex as H,
  positionOf,
  type CompiledContent,
  type Element,
  type Lattice,
  type Mobile,
  type MobileId,
  type PublicState,
  type Sector,
  type UnknownSector,
  type Vec,
} from '@distritos/sim';
import type { Clock } from './game.js';

export const COLORS = {
  bg: 0x1b1d20,
  fog: 0x2e3135,
  fogDot: 0x4b5057,
  unknown: 0x222426,
  ink: 0xe8e6e3,
  accent: 0xd96c3f, // lo propio
  energia: 0xf5c518, // amarillo
  agua: 0x3f8fd2, // azul
  verde: 0x4caf50, // bosque y comida
  gris: 0x8d8d8d, // piedra y metal
  violeta: 0x8e6ac8, // saber
  naranja: 0xef8f2f, // combustible
  rojo: 0xd32f2f, // solo el clan
} as const;

const TERRAIN_COLOR: Record<string, number> = {
  prado: 0x6f9a5a,
  bosque: 0x3d6b43,
  agua: 0x3b6f9c,
  cantera: 0x6e6e6e,
};

/** Color por función de cada tipo de elemento; lo que no está aquí es gris. */
const KIND_COLOR: Record<string, number> = {
  casa: COLORS.accent,
  panel: COLORS.energia,
  bateria: COLORS.energia,
  pozo: COLORS.agua,
  huerta: COLORS.verde,
  madera: COLORS.verde,
  piedra: COLORS.gris,
  manantial: COLORS.agua,
  colina: COLORS.gris,
  paso: COLORS.gris,
  salto: COLORS.agua,
};

export interface Camera {
  ox: number;
  oy: number;
  /** píxeles por milímetro */
  scale: number;
}

export function worldToScreen(c: Camera, v: Vec): { x: number; y: number } {
  return { x: c.ox + v.x * c.scale, y: c.oy + v.y * c.scale };
}

export function screenToWorld(c: Camera, p: { x: number; y: number }): Vec {
  return { x: Math.round((p.x - c.ox) / c.scale), y: Math.round((p.y - c.oy) / c.scale) };
}

/** Encuadra los sectores dados en la pantalla, sin bajar de un hexágono legible. */
export function fitCamera(
  sectors: Iterable<Sector | UnknownSector>,
  lat: Lattice,
  width: number,
  height: number,
): Camera {
  const size = lat.hexH / 1.5;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of sectors) {
    const c = H.center({ q: s.q, r: s.r }, lat);
    minX = Math.min(minX, c.x - size);
    maxX = Math.max(maxX, c.x + size);
    minY = Math.min(minY, c.y - size);
    maxY = Math.max(maxY, c.y + size);
  }
  if (!Number.isFinite(minX)) return { ox: width / 2, oy: height / 2, scale: 0.001 };
  const margin = 24;
  const fitScale = Math.min((width - 2 * margin) / (maxX - minX), (height - 2 * margin) / (maxY - minY));
  // Un hexágono ocupa al menos un cuarto del lado corto de la pantalla.
  const minScale = Math.min(width, height) / 4 / lat.hexW;
  const scale = Math.max(fitScale, minScale);
  return {
    scale,
    ox: width / 2 - ((minX + maxX) / 2) * scale,
    oy: height / 2 - ((minY + maxY) / 2) * scale,
  };
}

function hexPoints(cx: number, cy: number, r: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i + 30);
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return pts;
}

function elementRadius(scale: number, hexH: number, level: number): number {
  const base = Math.max(7, Math.min(16, (hexH / 1.5) * scale * 0.18));
  return base * (1 + 0.15 * (level - 1));
}

/** Posición dibujable de un móvil: interpolada entre dos ticks con la fracción del reloj. */
export function drawPosition(m: Mobile, clock: Clock): { x: number; y: number } {
  const a = positionOf(m, clock.tick);
  const b = positionOf(m, clock.tick + 1);
  return { x: a.x + (b.x - a.x) * clock.fraction, y: a.y + (b.y - a.y) * clock.fraction };
}

export class Renderer {
  readonly app = new Application();
  private readonly terrain = new Graphics();
  private readonly elements = new Graphics();
  private readonly mobiles = new Graphics();
  camera: Camera = { ox: 0, oy: 0, scale: 0.001 };

  async init(parent: HTMLElement): Promise<void> {
    await this.app.init({
      background: COLORS.bg,
      resizeTo: window,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });
    parent.prepend(this.app.canvas);
    this.app.stage.addChild(this.terrain, this.elements, this.mobiles);
  }

  get width(): number {
    return this.app.screen.width;
  }

  get height(): number {
    return this.app.screen.height;
  }

  /** Encuadre inicial: lo abierto y su frontera, no el mapa entero. */
  fit(v: PublicState): void {
    const lat = { hexW: v.scene.hexW, hexH: v.scene.hexH };
    const all = Object.values(v.map.sectors);
    const revealed = all.filter((s) => s.status === 'revealed');
    const near = all.filter((s) =>
      revealed.some((r) => H.distance({ q: s.q, r: s.r }, { q: r.q, r: r.r }) <= 1),
    );
    this.camera = fitCamera(near.length > 0 ? near : all, lat, this.width, this.height);
  }

  /** Desplaza la cámara en píxeles. */
  pan(dx: number, dy: number): void {
    this.camera = { ...this.camera, ox: this.camera.ox + dx, oy: this.camera.oy + dy };
  }

  /** Escala alrededor de un punto de pantalla, con límites. */
  zoom(factor: number, at: { x: number; y: number }): void {
    const c = this.camera;
    const scale = Math.max(0.0005, Math.min(0.02, c.scale * factor));
    const k = scale / c.scale;
    this.camera = { scale, ox: at.x - (at.x - c.ox) * k, oy: at.y - (at.y - c.oy) * k };
  }

  draw(v: PublicState, clock: Clock, selected: MobileId | null, content: CompiledContent): void {
    const lat: Lattice = { hexW: v.scene.hexW, hexH: v.scene.hexH };
    const cam = this.camera;
    const hexR = (lat.hexH / 1.5) * cam.scale;

    const g = this.terrain;
    g.clear();
    for (const s of Object.values(v.map.sectors)) {
      const c = worldToScreen(cam, H.center({ q: s.q, r: s.r }, lat));
      if (s.status === 'unknown') {
        g.poly(hexPoints(c.x, c.y, hexR * 0.96)).fill(COLORS.unknown);
      } else if (s.status === 'hidden') {
        g.poly(hexPoints(c.x, c.y, hexR * 0.96)).fill(COLORS.fog);
        g.circle(c.x, c.y, Math.max(2, hexR * 0.06)).fill(COLORS.fogDot);
      } else {
        g.poly(hexPoints(c.x, c.y, hexR * 0.96)).fill(TERRAIN_COLOR[s.terrain ?? ''] ?? COLORS.gris);
      }
    }

    const e = this.elements;
    e.clear();
    for (const el of Object.values(v.elements)) this.drawElement(e, el, v, content);

    const m = this.mobiles;
    m.clear();
    for (const mob of Object.values(v.mobiles)) this.drawMobile(m, mob, clock, mob.id === selected);
  }

  private drawElement(g: Graphics, el: Element, v: PublicState, content: CompiledContent): void {
    const cam = this.camera;
    const p = worldToScreen(cam, el.pos);
    const r = elementRadius(cam.scale, v.scene.hexH, el.level);
    const color = KIND_COLOR[el.kind] ?? COLORS.gris;
    const category = content.elements[el.kind]?.category ?? 'fixed';
    if (category === 'resource') {
      g.poly([p.x, p.y - r, p.x + r, p.y, p.x, p.y + r, p.x - r, p.y]).fill(color);
    } else if (category === 'site') {
      g.circle(p.x, p.y, r).stroke({ width: 2, color });
    } else {
      g.circle(p.x, p.y, r).fill(color);
    }
    if (el.kind === 'casa') {
      // El anillo de la casa: energía almacenada respecto a la dotación inicial.
      const actor = v.actors[v.viewer];
      const stocks = actor !== undefined && 'stocks' in actor ? actor.stocks : {};
      const plot = el.owner === undefined ? undefined : v.plots[v.actors[el.owner]?.plot ?? ''];
      const full = plot === undefined ? 0 : (content.archetypes[plot.archetype]?.start.stocks.energia ?? 0);
      const frac = full > 0 ? Math.max(0, Math.min(1, (stocks.energia ?? 0) / full)) : 0;
      const ring = r + 5;
      g.circle(p.x, p.y, ring).stroke({ width: 3, color: COLORS.fog });
      if (frac > 0) {
        const start = -Math.PI / 2;
        g.moveTo(p.x + ring * Math.cos(start), p.y + ring * Math.sin(start));
        g.arc(p.x, p.y, ring, start, start + 2 * Math.PI * frac).stroke({ width: 3, color: COLORS.energia });
      }
    }
  }

  private drawMobile(g: Graphics, mob: Mobile, clock: Clock, selected: boolean): void {
    const cam = this.camera;
    const pos = drawPosition(mob, clock);
    const p = worldToScreen(cam, { x: pos.x, y: pos.y });
    const r = Math.max(6, Math.min(14, (this.camera.scale * 50_000) / 6));
    let angle = -Math.PI / 2;
    if (mob.where.kind === 'trip') {
      const t = mob.where.trip;
      angle = Math.atan2(t.to.y - t.from.y, t.to.x - t.from.x);
    }
    const pts: number[] = [];
    for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
      const rr = a === 0 ? r * 1.3 : r;
      pts.push(p.x + rr * Math.cos(angle + a), p.y + rr * Math.sin(angle + a));
    }
    g.poly(pts).fill(COLORS.accent);
    if (selected) g.circle(p.x, p.y, r * 1.6).stroke({ width: 2, color: COLORS.ink });
  }
}
