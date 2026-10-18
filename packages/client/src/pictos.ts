/**
 * Pictogramas de los tipos de recado (P15; regla 6 del alfabeto gráfico: monocromos dentro de
 * un cuadrado). Trazos de 2 px en una rejilla de 24, para que se lean a 16 px. El cuadrado lleva
 * el color de la función (comida verde, energía amarillo, combustible naranja, educación
 * violeta; el resto, cal) y el dibujo va en tinta. Nunca rojo: es del clan.
 */

export const ERRAND_TYPES = [
  'comida',
  'energia',
  'combustible',
  'salud',
  'transporte',
  'trabajo',
  'educacion',
  'seguridad',
] as const;

export type ErrandType = (typeof ERRAND_TYPES)[number];

/** Color de la función de cada tipo; lo que no tiene función propia va en cal. */
export const TYPE_COLOR: Record<string, number> = {
  comida: 0x6cc070,
  energia: 0xf2c94c,
  combustible: 0xe8954a,
  educacion: 0xa98ad6,
};

export const CAL = 0xeef2ef;

export function typeColor(type: string | undefined): number {
  return (type === undefined ? undefined : TYPE_COLOR[type]) ?? CAL;
}

export function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** Dibujo de cada tipo, como SVG interior de un viewBox 0 0 24 24, en `currentColor`. */
export const PICTO: Record<ErrandType, string> = {
  // Una hogaza con sus cortes.
  comida:
    '<path d="M3.5 14.5c0-4.2 3.8-7.5 8.5-7.5s8.5 3.3 8.5 7.5c0 1.7-1.3 2.5-3 2.5H6.5c-1.7 0-3-.8-3-2.5z" fill="currentColor"/><path d="M8.5 10.2l1.6 2.6M12 9.6l1.6 2.6M15.5 10.2l1.4 2.4" stroke="var(--picto-cut)" stroke-width="1.6" stroke-linecap="round"/>',
  // Un rayo.
  energia: '<path d="M13.5 2.5 5 13.5h6l-1.5 8 9-11.5h-6z" fill="currentColor"/>',
  // Dos troncos cruzados y una llama.
  combustible:
    '<path d="M4 20.5 19.5 15M4.5 15 20 20.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M12 3c2.6 2.6 3.8 4.6 3.8 6.6A3.8 3.8 0 0 1 12 13.4a3.8 3.8 0 0 1-3.8-3.8c0-1.5.8-2.6 1.8-3.6.2 1.4.9 2.2 1.8 2.4C12.2 7 11.7 5.2 12 3z" fill="currentColor"/>',
  // Un frasco con una hoja (sin cruz).
  salud:
    '<path d="M9 2.8h6M10 2.8v3.4l-3.3 3.6v9.4a2 2 0 0 0 2 2h6.6a2 2 0 0 0 2-2V9.8L14 6.2V2.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9.2 16.8c0-3 2-5 5.6-5.2-.1 3.6-2.2 5.6-5.6 5.2zM9.2 16.8l3-2.9" fill="currentColor"/>',
  // Una cesta con asa.
  transporte:
    '<path d="M7 10a5 5 0 0 1 10 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 10.5h18l-2.2 9a1.5 1.5 0 0 1-1.5 1.1H6.7a1.5 1.5 0 0 1-1.5-1.1z" fill="currentColor"/>',
  // Un martillo.
  trabajo:
    '<path d="M13.5 9.5 4.2 18.8a1.6 1.6 0 0 0 2.2 2.3l9.3-9.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M10.6 6.4 13.8 3.2c1.6-.8 4.2-.4 6.2 1.4l-1.4 1.5 1.8 1.8-3.6 3.6-1.8-1.8-1.2 1.2z" fill="currentColor"/>',
  // Un farol.
  seguridad:
    '<path d="M9 3.5h6M12 3.5V5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7.5 7h9l-.8 11.5a2 2 0 0 1-2 1.8h-3.4a2 2 0 0 1-2-1.8z" fill="currentColor"/><path d="M12 10.5c1.4 1.4 2 2.5 2 3.6a2 2 0 0 1-4 0c0-1.1.6-2.2 2-3.6z" fill="var(--picto-cut)"/>',
  // Un libro abierto.
  educacion:
    '<path d="M12 6.5C9.8 5 6.6 4.6 3 5.2v13.3c3.6-.6 6.8-.2 9 1.3 2.2-1.5 5.4-1.9 9-1.3V5.2c-3.6-.6-6.8-.2-9 1.3z" fill="currentColor"/><path d="M12 6.8v12.6" stroke="var(--picto-cut)" stroke-width="1.6"/>',
};

export function isErrandType(v: string): v is ErrandType {
  return (ERRAND_TYPES as readonly string[]).includes(v);
}
