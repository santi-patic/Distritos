/**
 * Todo texto visible pasa por claves desde el primer commit (fundacional, Idiomas).
 * El idioma maestro está por decidir (registro, decisión 7); de momento, castellano.
 */

const es: Record<string, string> = {
  'hud.worker': 'Obrero: {name}',
  'hud.stocks': '⚡ {energy} kWh · comida {food} · Eagles {eagles}',
  'hud.tick': 't={tick} · {hash}',
  'hint.start':
    'Toca un elemento para mandar al obrero; toca un sector en niebla junto a uno abierto para abrirlo.',
  'hint.selected': 'Obrero {name} seleccionado.',
  'hint.sent': 'Orden dada.',
  'hint.revealing': '{name} va a abrir el sector; cuesta energía y tiempo.',
  'hint.nothing': 'Ahí no hay nada que hacer.',
  'reject.too_late': 'Demasiado tarde.',
  'reject.unknown_kind': 'Orden desconocida.',
  'reject.not_system': 'Solo el sistema puede hacer eso.',
  'reject.unknown_actor': 'Jugador desconocido.',
  'reject.unknown_mobile': 'Ese obrero no existe.',
  'reject.not_owner': 'Ese obrero no es tuyo.',
  'reject.busy': 'El obrero está ocupado.',
  'reject.unknown_element': 'Ese sitio no existe.',
  'reject.already_there': 'El obrero ya está ahí.',
  'reject.no_access': 'No puedes entrar ahí.',
  'reject.off_map': 'Eso está fuera del mapa.',
  'reject.not_hidden': 'Ese sector ya está abierto.',
  'reject.not_adjacent': 'Solo se abre junto a un sector abierto.',
  'reject.bad_amount': 'Cantidad inválida.',
  'reject.content_mismatch': 'Las tablas no coinciden.',
  'reject.insufficient': 'No hay bastante {resource}.',
  'resource.energia': 'energía',
  'resource.comida': 'comida',
  'resource.eagles': 'Eagles',
};

export function t(key: string, params: Record<string, string | number> = {}): string {
  let text = es[key] ?? key;
  for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/** Texto de un motivo de rechazo, incluidos los parametrizados (`insufficient:<recurso>`). */
export function rejectText(reason: string): string {
  if (reason.startsWith('insufficient:')) {
    const resource = reason.slice('insufficient:'.length);
    return t('reject.insufficient', { resource: t(`resource.${resource}`) });
  }
  return t(`reject.${reason}`);
}
