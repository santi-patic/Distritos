/**
 * Dibujo de la vista con PixiJS, con el alfabeto gráfico del espacio de diseño: una forma por
 * categoría (círculo fijo, rombo recurso, anillo sitio, triángulo obrero, hexágono terreno), un
 * color por función, el estado en un anillo, el tamaño es el nivel y ningún texto en el mapa.
 * Lo propio va relleno en blanco de cal; lo del común, hueco. Aquí sí hay coma flotante: lo que
 * se dibuja no decide nada.
 */

import { Application, Graphics } from 'pixi.js';
import {
  hex as H,
  positionOf,
  type CompiledContent,
  type Element,
  type Flows,
  type HexKey,
  type Lattice,
  type Link,
  type Mobile,
  type PublicState,
  type Sector,
  type UnknownSector,
  type Vec,
} from '@distritos/sim';
import type { Clock } from './game.js';

export const PALETTE = {
  bg: 0x0f1820,
  unknown: 0x0b1218,
  fog: 0x1d2a33,
  fogDot: 0x33444f,
  fogOpen: 0x9fb2bb,
  cal: 0xeef2ef,
  energia: 0xf2c94c,
  agua: 0x4aa3df,
  verde: 0x6cc070,
  piedra: 0x9aa3ab,
  night: 0x070d13,
} as const;

const TERRAIN: Record<string, number> = {
  prado: 0x4f6b45,
  bosque: 0x2f4d38,
  agua: 0x2d5873,
  cantera: 0x5a6168,
};

/** Color por función; lo que no esté aquí es piedra. */
const KIND_COLOR: Record<string, number> = {
  casa: PALETTE.cal,
  panel: PALETTE.energia,
  bateria: PALETTE.energia,
  punto_carga: PALETTE.energia,
  pozo: PALETTE.agua,
  bomba: PALETTE.agua,
  manantial: PALETTE.agua,
  salto: PALETTE.agua,
  huerta: PALETTE.verde,
  almacen_comun: PALETTE.verde,
  madera: PALETTE.verde,
};

const RESOURCE_COLOR: Record<string, number> = {
  energia: PALETTE.energia,
  agua: PALETTE.agua,
  comida: PALETTE.verde,
  madera: PALETTE.verde,
  piedra: PALETTE.piedra,
};

const LINK_COLOR: Record<string, number> = {
  cable: PALETTE.energia,
  canal: PALETTE.agua,
  camino: PALETTE.piedra,
};

/** El almacén cuyo nivel enseña el anillo de cada tipo (la casa enseña la batería). */
const RING_OF: Record<string, string> = {
  bateria: 'energia',
  punto_carga: 'energia',
  pozo: 'agua',
  bomba: 'agua',
  huerta: 'comida',
  almacen_comun: 'comida',
};

export interface Camera {
  ox: number;
  oy: number;
  /** Píxeles por milímetro. */
  scale: number;
}

export interface Insets {
  top: number;
  bottom: number;
}

export type Hit =
  | { kind: 'mobile'; id: string }
  | { kind: 'element'; id: string }
  | { kind: 'sector'; hex: HexKey; pos: Vec };

export interface Highlight {
  element?: string;
  mobile?: string;
  sector?: HexKey;
  /** Extremos posibles de un nexo que se está tendiendo. */
  candidates?: readonly string[];
  /** Destino del encargo de la pizarra, mientras falte algo. */
  encargo?: string;
  /** Punto donde se construiría (sector propio tocado). */
  point?: Vec;
}

export interface DrawInput {
  view: PublicState;
  content: CompiledContent;
  clock: Clock;
  /** Milisegundos de animación (performance.now). */
  animMs: number;
  /** Luz del tick en milésimas. */
  light: number;
  /** Hay luz de trabajo en el tick. */
  workable: boolean;
  flows: Flows;
  active: string | null;
  highlight: Highlight;
  reduceMotion: boolean;
}

export function worldToScreen(c: Camera, v: Vec): { x: number; y: number } {
  return { x: c.ox + v.x * c.scale, y: c.oy + v.y * c.scale };
}

export function screenToWorld(c: Camera, p: { x: number; y: number }): Vec {
  return { x: Math.round((p.x - c.ox) / c.scale), y: Math.round((p.y - c.oy) / c.scale) };
}

function lattice(v: PublicState): Lattice {
  return { hexW: v.scene.hexW, hexH: v.scene.hexH };
}

function hexPoints(cx: number, cy: number, r: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i + 30);
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return pts;
}

/** Encuadra unos sectores en la pantalla, dejando sitio a las barras de arriba y de abajo. */
export function fitCamera(
  sectors: Iterable<{ q: number; r: number }>,
  lat: Lattice,
  width: number,
  height: number,
  insets: Insets,
  /** Cuánto de cada hexágono del borde entra, en radios (1: entero; menos: cortado). */
  pad = 1,
): Camera {
  const size = (lat.hexH / 1.5) * pad;
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
  const top = insets.top;
  const usable = Math.max(1, height - insets.top - insets.bottom);
  if (!Number.isFinite(minX)) return { ox: width / 2, oy: top + usable / 2, scale: 0.001 };
  const margin = 12;
  const scale = Math.min((width - 2 * margin) / (maxX - minX), (usable - 2 * margin) / (maxY - minY));
  return {
    scale,
    ox: width / 2 - ((minX + maxX) / 2) * scale,
    oy: top + usable / 2 - ((minY + maxY) / 2) * scale,
  };
}

/** Línea discontinua; `offset` desplaza los trazos en el sentido de la línea (flujo). */
function dashed(
  g: Graphics,
  a: { x: number; y: number },
  b: { x: number; y: number },
  dash: number,
  gap: number,
  offset: number,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;
  const period = dash + gap;
  const shift = ((offset % period) + period) % period;
  for (let s = shift - period; s < len; s += period) {
    const from = Math.max(0, s);
    const to = Math.min(len, s + dash);
    if (to > from) g.moveTo(a.x + ux * from, a.y + uy * from).lineTo(a.x + ux * to, a.y + uy * to);
  }
}

/** Anillo de estado: fondo tenue y arco desde arriba en el sentido de las agujas. */
function ring(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  frac: number,
  color: number,
  width: number,
): void {
  g.circle(x, y, r).stroke({ width, color, alpha: 0.22 });
  const f = Math.max(0, Math.min(1, frac));
  if (f <= 0) return;
  const start = -Math.PI / 2;
  if (f >= 0.999) {
    g.circle(x, y, r).stroke({ width, color });
    return;
  }
  g.moveTo(x + r * Math.cos(start), y + r * Math.sin(start))
    .arc(x, y, r, start, start + 2 * Math.PI * f)
    .stroke({ width, color, cap: 'round' });
}

interface Drawn {
  id: string;
  x: number;
  y: number;
  r: number;
}

export class Renderer {
  readonly app = new Application();
  private readonly terrain = new Graphics();
  private readonly links = new Graphics();
  private readonly night = new Graphics();
  private readonly elements = new Graphics();
  private readonly overlay = new Graphics();
  private readonly mobiles = new Graphics();
  private drawnElements: Drawn[] = [];
  private drawnMobiles: Drawn[] = [];
  private revealedAt: Record<string, number> = {};
  private knownRevealed: Record<string, true> | null = null;
  camera: Camera = { ox: 0, oy: 0, scale: 0.001 };
  insets: Insets = { top: 0, bottom: 0 };
  private tween: {
    from: { ox: number; oy: number };
    to: { ox: number; oy: number };
    start: number;
    ms: number;
  } | null = null;

  async init(parent: HTMLElement): Promise<void> {
    await this.app.init({
      background: PALETTE.bg,
      resizeTo: window,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });
    this.app.canvas.setAttribute('aria-label', 'mapa');
    parent.prepend(this.app.canvas);
    this.app.stage.addChild(this.terrain, this.links, this.night, this.elements, this.overlay, this.mobiles);
  }

  get width(): number {
    return this.app.screen.width;
  }

  get height(): number {
    return this.app.screen.height;
  }

  /** Encuadra la casa y su primer anillo de sectores. */
  frameHome(v: PublicState): void {
    const plot = v.plots[(v.actors[v.viewer] as { plot?: string } | undefined)?.plot ?? ''];
    const anchor = plot === undefined ? { q: 0, r: 0 } : H.parse(plot.anchor);
    this.camera = fitCamera(H.range(anchor, 1), lattice(v), this.width, this.height, this.insets, 0.62);
  }

  /** Centra la cámara en un punto del mundo sin cambiar el zoom. */
  focus(world: Vec): void {
    this.tween = null;
    const top = this.insets.top;
    const usable = this.height - this.insets.top - this.insets.bottom;
    this.camera = {
      scale: this.camera.scale,
      ox: this.width / 2 - world.x * this.camera.scale,
      oy: top + usable / 2 - world.y * this.camera.scale,
    };
  }

  pan(dx: number, dy: number): void {
    this.tween = null;
    this.camera = { ...this.camera, ox: this.camera.ox + dx, oy: this.camera.oy + dy };
  }

  /** Desplaza la cámara con un movimiento corto (o de golpe si se pide sin animación). */
  glide(dx: number, dy: number, animate: boolean): void {
    if (!animate) {
      this.pan(dx, dy);
      return;
    }
    const from = this.tween?.to ?? { ox: this.camera.ox, oy: this.camera.oy };
    this.tween = {
      from: { ox: this.camera.ox, oy: this.camera.oy },
      to: { ox: from.ox + dx, oy: from.oy + dy },
      start: performance.now(),
      ms: 260,
    };
  }

  private stepTween(now: number): void {
    const tw = this.tween;
    if (tw === null) return;
    const k = Math.min(1, (now - tw.start) / tw.ms);
    const e = 1 - (1 - k) * (1 - k) * (1 - k);
    this.camera = {
      scale: this.camera.scale,
      ox: tw.from.ox + (tw.to.ox - tw.from.ox) * e,
      oy: tw.from.oy + (tw.to.oy - tw.from.oy) * e,
    };
    if (k >= 1) this.tween = null;
  }

  /** Escala alrededor de un punto de pantalla, entre ver el distrito entero y ver un sector de cerca. */
  zoom(factor: number, at: { x: number; y: number }, lat: Lattice): void {
    const c = this.camera;
    const short = Math.min(this.width, this.height);
    const min = short / (lat.hexW * 12);
    const max = (short * 1.6) / lat.hexW;
    this.tween = null;
    const scale = Math.max(min, Math.min(max, c.scale * factor));
    const k = scale / c.scale;
    this.camera = { scale, ox: at.x - (at.x - c.ox) * k, oy: at.y - (at.y - c.oy) * k };
  }

  /** Qué hay bajo un punto de la pantalla: un obrero, un elemento o un sector. */
  hit(p: { x: number; y: number }, v: PublicState): Hit | null {
    // Lo más cercano al dedo entre obreros y elementos; los obreros ganan por poco en un empate.
    let best: Hit | null = null;
    let bestD = Infinity;
    for (const m of this.drawnMobiles) {
      const d = Math.hypot(m.x - p.x, m.y - p.y) - 2;
      if (d <= Math.max(20, m.r + 10) && d < bestD) {
        best = { kind: 'mobile', id: m.id };
        bestD = d;
      }
    }
    for (const e of this.drawnElements) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d <= Math.max(22, e.r + 10) && d < bestD) {
        best = { kind: 'element', id: e.id };
        bestD = d;
      }
    }
    if (best !== null) return best;
    const world = screenToWorld(this.camera, p);
    const k = H.key(H.nearest(world, lattice(v)));
    const s = v.map.sectors[k];
    if (s === undefined || s.status === 'unknown') return null;
    return { kind: 'sector', hex: k, pos: world };
  }

  /** Posición de pantalla de un elemento, de un obrero o del centro de un sector (pruebas, cámara). */
  screenOf(
    v: PublicState,
    what: { element?: string; mobile?: string; sector?: HexKey },
  ): { x: number; y: number } | null {
    if (what.mobile !== undefined) {
      const m = this.drawnMobiles.find((d) => d.id === what.mobile);
      return m === undefined ? null : { x: m.x, y: m.y };
    }
    if (what.element !== undefined) {
      const e = v.elements[what.element];
      return e === undefined ? null : worldToScreen(this.camera, e.pos);
    }
    if (what.sector !== undefined) {
      return worldToScreen(this.camera, H.center(H.parse(what.sector), lattice(v)));
    }
    return null;
  }

  draw(input: DrawInput): void {
    const { view: v } = input;
    this.stepTween(input.animMs);
    this.trackReveals(v, input.animMs);
    this.drawTerrain(input);
    this.drawLinks(input);
    this.drawNight(input);
    this.drawElements(input);
    this.drawOverlay(input);
    this.drawMobiles(input);
  }

  /** Apunta cuándo se ha visto abrir cada sector, para el fundido; lo abierto al cargar no se anima. */
  private trackReveals(v: PublicState, now: number): void {
    const first = this.knownRevealed === null;
    const known = this.knownRevealed ?? {};
    for (const [k, s] of Object.entries(v.map.sectors)) {
      if (s.status !== 'revealed' || known[k] === true) continue;
      known[k] = true;
      if (!first) this.revealedAt[k] = now;
    }
    this.knownRevealed = known;
  }

  private hexRadius(v: PublicState): number {
    return (v.scene.hexH / 1.5) * this.camera.scale;
  }

  private drawTerrain(input: DrawInput): void {
    const { view: v, animMs } = input;
    const g = this.terrain;
    g.clear();
    const lat = lattice(v);
    const hexR = this.hexRadius(v);
    const sectors = v.map.sectors;
    const revealed = (q: number, r: number): boolean => sectors[H.keyOf(q, r)]?.status === 'revealed';
    for (const [k, s] of Object.entries(sectors)) {
      const c = worldToScreen(this.camera, H.center({ q: s.q, r: s.r }, lat));
      const pts = hexPoints(c.x, c.y, hexR * 0.965);
      if (s.status === 'unknown') {
        g.poly(pts).fill(PALETTE.unknown);
        continue;
      }
      if (s.status === 'hidden') {
        g.poly(pts).fill(PALETTE.fog);
        const openable = H.neighbors({ q: s.q, r: s.r }).some((n) => revealed(n.q, n.r));
        g.circle(c.x, c.y, Math.max(2, hexR * (openable ? 0.05 : 0.035))).fill({
          color: openable ? PALETTE.fogOpen : PALETTE.fogDot,
          alpha: openable ? 0.75 : 1,
        });
        continue;
      }
      const sector = s;
      const color = TERRAIN[sector.terrain ?? ''] ?? PALETTE.piedra;
      const since = this.revealedAt[k];
      const fade = since === undefined || input.reduceMotion ? 1 : Math.min(1, (animMs - since) / 700);
      if (fade < 1) g.poly(pts).fill(PALETTE.fog);
      g.poly(pts).fill({ color, alpha: fade });
      if (sector.plot === null) {
        // La tierra común: un borde de tiza.
        g.poly(hexPoints(c.x, c.y, hexR * 0.9)).stroke({ width: 1.5, color: PALETTE.cal, alpha: 0.28 });
      }
    }
  }

  private elementRadius(v: PublicState, level: number): number {
    const base = Math.max(7, Math.min(20, this.hexRadius(v) * 0.15));
    return base * (1 + 0.15 * (level - 1));
  }

  private linkActive(l: Link, v: PublicState, content: CompiledContent, flows: Flows): boolean {
    const carries = content.links?.[l.kind]?.carries;
    if (carries === undefined) return false;
    const from = v.elements[l.from];
    if (from === undefined) return false;
    const kf = content.elements[from.kind];
    if (kf?.produce?.resource === carries && kf.produce.to === 'link')
      return (flows.produced[l.from] ?? 0) > 0;
    return (flows.supplied[l.to] ?? 0) > 0;
  }

  private drawLinks(input: DrawInput): void {
    const { view: v, content, flows, animMs, reduceMotion } = input;
    const g = this.links;
    g.clear();
    const scale = Math.max(0.6, Math.min(1.4, this.hexRadius(v) / 70));
    for (const l of Object.values(v.links)) {
      const a = v.elements[l.from];
      const b = v.elements[l.to];
      if (a === undefined || b === undefined) continue;
      const pa = worldToScreen(this.camera, a.pos);
      const pb = worldToScreen(this.camera, b.pos);
      const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      if (len < 1) continue;
      const ra = this.elementRadius(v, a.level) + 3;
      const rb = this.elementRadius(v, b.level) + 3;
      if (len <= ra + rb) continue;
      const ux = (pb.x - pa.x) / len;
      const uy = (pb.y - pa.y) / len;
      const s = { x: pa.x + ux * ra, y: pa.y + uy * ra };
      const e = { x: pb.x - ux * rb, y: pb.y - uy * rb };
      const color = LINK_COLOR[l.kind] ?? PALETTE.piedra;
      if (l.kind === 'camino') {
        dashed(g, s, e, 3 * scale, 3 * scale, 0);
        g.stroke({ width: 5 * scale, color, alpha: 0.55 });
        continue;
      }
      const active = this.linkActive(l, v, content, flows);
      const offset = active && !reduceMotion ? (animMs / 1000) * 14 * scale : 0;
      dashed(g, s, e, 7 * scale, 5 * scale, offset);
      g.stroke({ width: 2 * scale, color, alpha: active ? 0.95 : 0.4 });
    }
    // Nexos que se están tendiendo: punteados tenues entre sus extremos.
    for (const m of Object.values(v.mobiles)) {
      if (m.job?.kind !== 'link') continue;
      const a = v.elements[m.job.from];
      const b = v.elements[m.job.to];
      if (a === undefined || b === undefined) continue;
      dashed(g, worldToScreen(this.camera, a.pos), worldToScreen(this.camera, b.pos), 2, 6, 0);
      g.stroke({ width: 2, color: LINK_COLOR[m.job.what] ?? PALETTE.piedra, alpha: 0.35 });
    }
  }

  private drawNight(input: DrawInput): void {
    const g = this.night;
    g.clear();
    const alpha = 0.5 * (1 - Math.max(0, Math.min(1000, input.light)) / 1000);
    if (alpha <= 0.001) return;
    g.rect(0, 0, this.width, this.height).fill({ color: PALETTE.night, alpha });
  }

  private batteryFraction(v: PublicState, content: CompiledContent): number {
    let have = 0;
    let cap = 0;
    for (const e of Object.values(v.elements)) {
      if (e.owner !== v.viewer || e.kind !== 'bateria') continue;
      const base = content.elements.bateria?.stores?.energia ?? 0;
      cap += Math.floor((base * (1000 - (e.wear ?? 0))) / 1000);
      have += e.store?.energia ?? 0;
    }
    return cap > 0 ? have / cap : 0;
  }

  private drawElements(input: DrawInput): void {
    const { view: v, content } = input;
    const g = this.elements;
    g.clear();
    const drawn: Drawn[] = [];
    const battery = this.batteryFraction(v, content);
    const ids = Object.keys(v.elements).sort();
    for (const id of ids) {
      const el = v.elements[id];
      if (el === undefined) continue;
      const p = worldToScreen(this.camera, el.pos);
      const r = this.elementRadius(v, el.level);
      drawn.push({ id, x: p.x, y: p.y, r });
      this.drawElement(g, el, p, r, content, battery);
    }
    this.drawnElements = drawn;
  }

  private drawElement(
    g: Graphics,
    el: Element,
    p: { x: number; y: number },
    r: number,
    content: CompiledContent,
    battery: number,
  ): void {
    const kind = content.elements[el.kind];
    const color = KIND_COLOR[el.kind] ?? PALETTE.piedra;
    const common = el.owner === undefined;
    const category = kind?.category ?? 'fixed';
    const off = kind?.switchable === true && el.on !== true;
    const dirt = kind?.soil !== undefined ? Math.min(1, (el.wear ?? 0) / 600) : 0;
    const alpha = off ? 0.4 : 1 - dirt;
    if (category === 'resource') {
      g.poly([p.x, p.y - r * 1.15, p.x + r, p.y, p.x, p.y + r * 1.15, p.x - r, p.y]).fill({ color, alpha });
    } else if (category === 'site') {
      g.circle(p.x, p.y, r).stroke({ width: 2.5, color });
      g.circle(p.x, p.y, Math.max(1.5, r * 0.18)).fill(color);
    } else if (common) {
      g.circle(p.x, p.y, r).stroke({ width: 3, color });
    } else {
      g.circle(p.x, p.y, r).fill({ color, alpha });
      if (off) g.circle(p.x, p.y, r).stroke({ width: 1.5, color });
    }
    const width = Math.max(2, r * 0.22);
    if (el.kind === 'casa' && !common) {
      ring(g, p.x, p.y, r + width + 2, battery, PALETTE.energia, width);
      return;
    }
    const res = RING_OF[el.kind];
    if (res === undefined) return;
    const base = kind?.stores?.[res] ?? 0;
    const cap = kind?.cycles === undefined ? base : Math.floor((base * (1000 - (el.wear ?? 0))) / 1000);
    const have = el.store?.[res] ?? 0;
    ring(g, p.x, p.y, r + width + 2, cap > 0 ? have / cap : 0, RESOURCE_COLOR[res] ?? color, width);
  }

  private drawOverlay(input: DrawInput): void {
    const { view: v, highlight, animMs, reduceMotion } = input;
    const g = this.overlay;
    g.clear();
    const pulse = reduceMotion ? 0.8 : 0.55 + 0.45 * Math.sin(animMs / 320);
    const around = (id: string, extra: number, alpha: number, dashedRing: boolean): void => {
      const d = this.drawnElements.find((x) => x.id === id);
      if (d === undefined) return;
      const rr = d.r + extra;
      if (dashedRing) {
        const steps = 16;
        for (let i = 0; i < steps; i += 1) {
          const a0 = (i / steps) * Math.PI * 2 + (reduceMotion ? 0 : animMs / 2400);
          const a1 = a0 + (Math.PI * 2) / steps / 1.8;
          g.moveTo(d.x + rr * Math.cos(a0), d.y + rr * Math.sin(a0)).arc(d.x, d.y, rr, a0, a1);
        }
        g.stroke({ width: 2, color: PALETTE.cal, alpha });
      } else {
        g.circle(d.x, d.y, rr).stroke({ width: 2, color: PALETTE.cal, alpha });
      }
    };
    // Obras en curso: el sitio del edificio, punteado.
    for (const m of Object.values(v.mobiles)) {
      if (m.job?.kind !== 'build') continue;
      const p = worldToScreen(this.camera, m.job.pos);
      const r = this.elementRadius(v, 1);
      const steps = 10;
      for (let i = 0; i < steps; i += 1) {
        const a0 = (i / steps) * Math.PI * 2;
        g.moveTo(p.x + r * Math.cos(a0), p.y + r * Math.sin(a0)).arc(p.x, p.y, r, a0, a0 + Math.PI / steps);
      }
      g.stroke({ width: 2, color: PALETTE.piedra, alpha: 0.8 });
    }
    if (highlight.point !== undefined) {
      const p = worldToScreen(this.camera, highlight.point);
      const r = this.elementRadius(v, 1);
      const steps = 12;
      for (let i = 0; i < steps; i += 1) {
        const a0 = (i / steps) * Math.PI * 2;
        g.moveTo(p.x + r * Math.cos(a0), p.y + r * Math.sin(a0)).arc(p.x, p.y, r, a0, a0 + Math.PI / steps);
      }
      g.stroke({ width: 2, color: PALETTE.cal, alpha: 0.9 });
      g.circle(p.x, p.y, 2).fill(PALETTE.cal);
    }
    if (highlight.encargo !== undefined) around(highlight.encargo, 14, 0.25 + 0.35 * pulse, true);
    for (const c of highlight.candidates ?? []) around(c, 9, 0.4 + 0.5 * pulse, true);
    if (highlight.element !== undefined) around(highlight.element, 9, 0.95, false);
    if (highlight.sector !== undefined) {
      const s = v.map.sectors[highlight.sector];
      if (s !== undefined) {
        const c = worldToScreen(this.camera, H.center({ q: s.q, r: s.r }, lattice(v)));
        g.poly(hexPoints(c.x, c.y, this.hexRadius(v) * 0.9)).stroke({
          width: 2.5,
          color: PALETTE.cal,
          alpha: 0.9,
        });
      }
    }
  }

  /** Posición dibujada de cada obrero: en viaje, interpolada; parado junto a un elemento, a un lado. */
  private mobilePositions(v: PublicState, clock: Clock): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    const parked: Record<string, Mobile[]> = {};
    const ids = Object.keys(v.mobiles).sort();
    for (const id of ids) {
      const m = v.mobiles[id];
      if (m === undefined) continue;
      if (m.where.kind === 'trip') {
        const a = positionOf(m, clock.tick);
        const b = positionOf(m, clock.tick + 1);
        out[id] = worldToScreen(this.camera, {
          x: a.x + (b.x - a.x) * clock.fraction,
          y: a.y + (b.y - a.y) * clock.fraction,
        });
        continue;
      }
      const spot = m.where.element ?? `${m.where.pos.x},${m.where.pos.y}`;
      (parked[spot] ??= []).push(m);
    }
    for (const list of Object.values(parked)) {
      const first = list[0];
      if (first?.where.kind !== 'at') continue;
      const el = first.where.element === null ? undefined : v.elements[first.where.element];
      const center = worldToScreen(this.camera, el?.pos ?? first.where.pos);
      const base = el === undefined ? 0 : this.elementRadius(v, el.level) * 2.1 + 10;
      list.forEach((m, i) => {
        if (el === undefined && list.length === 1) {
          out[m.id] = center;
          return;
        }
        const angle = -Math.PI / 2 + (i - (list.length - 1) / 2) * 0.62;
        const dist = Math.max(base, 14);
        out[m.id] = { x: center.x + dist * Math.cos(angle), y: center.y + dist * Math.sin(angle) };
      });
    }
    return out;
  }

  private drawMobiles(input: DrawInput): void {
    const { view: v, clock, animMs, reduceMotion, active, highlight } = input;
    const g = this.mobiles;
    g.clear();
    const pos = this.mobilePositions(v, clock);
    const r = Math.max(6, Math.min(13, this.hexRadius(v) * 0.11));
    const drawn: Drawn[] = [];
    for (const [id, p] of Object.entries(pos)) {
      const m = v.mobiles[id];
      if (m === undefined) continue;
      drawn.push({ id, x: p.x, y: p.y, r });
      let angle = -Math.PI / 2;
      let alpha = 1;
      const job = m.job;
      if (m.where.kind === 'trip') {
        const t = m.where.trip;
        angle = Math.atan2(t.to.y - t.from.y, t.to.x - t.from.x);
      } else if (job !== null && clock.tick >= job.startTick) {
        if (input.workable || job.kind === 'deliver') {
          angle = reduceMotion ? -Math.PI / 2 : -Math.PI / 2 + (animMs / 1000) * 0.9;
          const span = Math.max(1, job.endTick - job.startTick);
          const done = Math.max(0, Math.min(1, (clock.tick - job.startTick) / span));
          ring(g, p.x, p.y, r * 1.9, done, PALETTE.cal, 2);
        } else {
          alpha = 0.55;
        }
      }
      const pts: number[] = [];
      for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
        const rr = a === 0 ? r * 1.35 : r;
        pts.push(p.x + rr * Math.cos(angle + a), p.y + rr * Math.sin(angle + a));
      }
      const mine = m.owner === v.viewer;
      if (m.hungry === true || !mine) g.poly(pts).stroke({ width: 2, color: PALETTE.cal, alpha });
      else g.poly(pts).fill({ color: PALETTE.cal, alpha });
      const cargo = m.cargo === undefined ? undefined : Object.keys(m.cargo)[0];
      if (cargo !== undefined) {
        g.circle(p.x - r * 1.2 * Math.cos(angle), p.y - r * 1.2 * Math.sin(angle), r * 0.45).fill(
          RESOURCE_COLOR[cargo] ?? PALETTE.piedra,
        );
      }
      if (id === highlight.mobile) {
        g.circle(p.x, p.y, r * 2.3).stroke({ width: 2, color: PALETTE.cal, alpha: 0.95 });
      } else if (id === active) {
        // El obrero elegido para la próxima orden: una raya bajo el triángulo.
        g.moveTo(p.x - r, p.y + r * 1.6)
          .lineTo(p.x + r, p.y + r * 1.6)
          .stroke({ width: 2, color: PALETTE.cal, alpha: 0.8 });
      }
    }
    this.drawnMobiles = drawn;
  }
}

export function isSector(s: Sector | UnknownSector): s is Sector {
  return s.status !== 'unknown';
}
