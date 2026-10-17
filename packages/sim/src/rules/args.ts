/**
 * Comprobación de forma de los argumentos de una orden. Las órdenes llegan de clientes: antes
 * de leerlas como tipos hay que comprobar que lo son (enteros seguros, cadenas, booleanos).
 */

import { isInt } from '../arith.js';
import type { Vec } from '../geom.js';

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isStr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

export function isVec(v: unknown): v is Vec {
  return isRecord(v) && isInt(v.x) && isInt(v.y);
}

export { isInt };
