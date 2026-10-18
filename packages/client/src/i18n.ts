/**
 * Todo texto visible pasa por claves (fundacional, Idiomas). Idioma maestro: castellano;
 * gallego, segundo idioma de F1 (A11). Los textos describen acciones o estados y nunca
 * explican un principio. La moneda se llama Águilas en castellano (registro, 16 oct) y Aguias
 * en gallego. Los nombres de los obreros son datos de las tablas: no se traducen.
 */

export type Lang = 'es' | 'gl';

type Dict = Record<string, string>;

const es: Dict = {
  // recursos y unidades
  'res.energia': 'energía',
  'res.agua': 'agua',
  'res.comida': 'comida',
  'res.madera': 'madera',
  'res.piedra': 'piedra',
  'res.eagles': 'Águilas',
  'res.trabajo': 'horas de obra',
  'unit.energia': '{n} kWh',
  'unit.agua': '{n} L',
  'unit.comida': '{n} raciones',
  'unit.comida.one': '{n} ración',
  'unit.madera': '{n} de madera',
  'unit.piedra': '{n} de piedra',
  'unit.eagles': '{n} Águilas',
  'unit.eagles.one': '{n} Águila',
  'rate.energia': '{n} W',
  'rate.agua': '{n} L/h',
  'rate.perDay': '{what} al día',
  // elementos, terrenos, obreros
  'el.casa': 'Casa',
  'el.panel': 'Panel solar',
  'el.bateria': 'Batería',
  'el.pozo': 'Pozo',
  'el.huerta': 'Huerta',
  'el.taller': 'Taller',
  'el.cobertizo': 'Cobertizo',
  'el.bomba': 'Bomba de agua',
  'el.punto_carga': 'Punto de carga',
  'el.almacen_comun': 'Almacén común',
  'el.colina': 'Colina',
  'el.paso': 'Paso estrecho',
  'el.salto': 'Salto de agua',
  'el.madera': 'Madera',
  'el.piedra': 'Piedra',
  'el.manantial': 'Manantial',
  'place.punto_carga': 'punto de carga',
  'place.almacen_comun': 'almacén común',
  'terrain.prado': 'Prado',
  'terrain.bosque': 'Bosque',
  'terrain.agua': 'Agua',
  'terrain.cantera': 'Cantera',
  'sector.hidden': 'Sector sin abrir',
  'sector.open': 'Sector abierto',
  'sector.byYou': 'Lo abriste tú',
  'mob.obrero_peon': 'Trabajo de peón',
  'mob.obrero_tecnico': 'Trabajo técnico',
  // órdenes
  'act.reveal': 'Abrir el sector',
  'act.move': 'Ir aquí',
  'act.home': 'Volver a casa',
  'act.build.taller': 'Construir un taller',
  'act.build.cobertizo': 'Construir un cobertizo',
  'act.build.bomba': 'Construir una bomba',
  'act.task.sacar_agua': 'Sacar agua',
  'act.task.recoger': 'Recoger la cosecha',
  'act.task.talar': 'Cortar madera',
  'act.task.picar': 'Picar piedra',
  'act.task.limpiar': 'Limpiar el panel',
  'act.on': 'Encender',
  'act.off': 'Apagar',
  'act.hire.obrero_peon': 'Contratar a alguien',
  'act.link.cable': 'Tender un cable',
  'act.link.canal': 'Abrir un canal',
  'act.link.camino': 'Hacer un camino',
  'act.link.pick': 'Toca el otro extremo',
  'act.link.none': 'No hay nada que unir así desde aquí',
  'act.deliver': 'Llevar {what}',
  'act.deliver.work': 'Trabajar en la obra',
  'act.cancel': 'Cancelar',
  'act.close': 'Cerrar',
  'act.frameHome': 'Ver la casa',
  'sheet.worker': 'Va {name}',
  // presupuesto de una orden
  'meta.ends': 'termina {when}',
  'meta.arrives': 'llega {when}',
  'meta.carry': 'lleva {what}',
  'meta.work': '{d} de obra',
  'meta.pay': 'cobra {pay}',
  'meta.pickOther': 'Después, toca el otro extremo',
  // estado de lo tocado
  'info.store': '{have} de {cap}',
  'info.produces': 'Da {rate} ahora',
  'info.consumes': 'Gasta {rate}',
  'info.unsupplied': 'Sin {resource}',
  'info.dirt': 'Suciedad: {pct} %',
  'info.capacity': 'Capacidad: {pct} %',
  'info.running': 'Encendida',
  'info.stopped': 'Apagada',
  'info.beds': 'Camas: {used} de {beds} ocupadas',
  'info.builtByYou': 'Lo construiste tú',
  'info.common': 'Del común',
  'info.encargo': 'Hoy hace falta {what}; entregado: {done}',
  'info.carrying': 'Lleva {what}',
  'info.free': 'Sin coste',
  'info.from': 'Desde: {what}',
  'info.fromTo': 'Entre {a} y {b}',
  // obreros
  'worker.idle': 'Libre',
  'worker.freeAt': 'Libre {when}',
  'worker.walking': 'De camino. Llega {when}.',
  'worker.goingTo': 'Va a {what}. Termina {when}.',
  'worker.working': 'Trabajando: {what}. Termina {when}.',
  'worker.waiting': 'Espera la luz para {what}. Termina {when}.',
  'worker.hungry': 'No ha comido: rinde la mitad',
  'job.reveal': 'abrir un sector',
  'job.build.taller': 'construir un taller',
  'job.build.cobertizo': 'construir un cobertizo',
  'job.build.bomba': 'construir una bomba',
  'job.link.cable': 'tender un cable',
  'job.link.canal': 'abrir un canal',
  'job.link.camino': 'hacer un camino',
  'job.task.sacar_agua': 'sacar agua',
  'job.task.recoger': 'recoger la cosecha',
  'job.task.talar': 'cortar madera',
  'job.task.picar': 'picar piedra',
  'job.task.limpiar': 'limpiar el panel',
  'job.deliver': 'llevar {what} al {place}',
  'job.deliverWork': 'trabajar en el {place}',
  // tiempo
  'time.min': '{n} min',
  'time.h': '{n} h',
  'time.hmin': '{h} h {m} min',
  'when.today': 'a las {t}',
  'when.tomorrow': 'mañana a las {t}',
  'when.later': 'el {d} a las {t}',
  'clock.day': 'Hay luz para trabajar',
  'clock.night': 'Es de noche',
  'clock.dayUntil': 'Hay luz para trabajar. Se va {when}.',
  'clock.nightUntil': 'Es de noche. Se podrá trabajar {when}.',
  // pizarra del común
  'board.title': 'Pizarra del común',
  'board.need': '{what} en el {place}',
  'board.work': '{d} de obra en el {place}',
  'board.progress': 'Entregado: {done} de {total}',
  'board.reward': 'Paga {reward} en total',
  'board.who': 'Quién lo ha traído',
  'board.always': 'Lo traído siempre',
  'board.you': 'Tu finca',
  'board.totalWork': '{d} de obra',
  'board.none': 'Hoy no hace falta nada',
  'board.send': 'Mandar a alguien',
  'board.sendWho': 'Mandar a {name}',
  'board.show': 'Ver dónde es',
  'board.done': 'Ya está cubierto',
  // menú
  'menu.title': 'Menú',
  'menu.lang': 'Idioma',
  'menu.export': 'Exportar la partida',
  'menu.copy': 'Copiar la partida',
  'menu.import': 'Cargar una partida',
  'menu.reset': 'Empezar de nuevo',
  'menu.resetConfirm': '¿Borrar esta finca y empezar otra?',
  'menu.resetYes': 'Borrar y empezar',
  'menu.importConfirm': '¿Cambiar esta partida por la del archivo? La de ahora se pierde.',
  'menu.importYes': 'Cambiar',
  'menu.version': 'Versión {build}, reglas {rules}, tablas {content}',
  'menu.seed': 'Semilla {seed}',
  'menu.exported': 'Partida exportada',
  'menu.copied': 'Partida copiada',
  'menu.copyFailed': 'No se ha podido copiar',
  'menu.imported': 'Partida cargada',
  'menu.importSame': 'Partida cargada: el hash coincide en t={tick}',
  'menu.importDiffers': 'Partida cargada: con estas tablas el hash no coincide en t={tick}',
  'menu.importBad': 'Ese archivo no es una partida',
  'menu.replayed': 'La partida se ha repetido con las reglas nuevas',
  // avisos
  'toast.sent': 'Orden dada',
  'toast.revealed': 'Sector abierto',
  'toast.built': '{what}: terminado',
  'toast.linked': 'Unión hecha',
  'toast.hired': 'Ha llegado {name}',
  'toast.switchedOff': '{what}: se ha parado',
  'toast.delivered': 'Entregado: +{pay}',
  'toast.encargo': 'Hay un encargo nuevo en la pizarra',
  'toast.hungry': '{name} no ha comido',
  'toast.free': '{name} ha terminado',
  'hud.hash': 't={tick} {hash}',
  // rechazos
  'reject.too_late': 'Demasiado tarde.',
  'reject.unknown_kind': 'Orden desconocida.',
  'reject.bad_args': 'Orden mal formada.',
  'reject.not_system': 'Solo el sistema puede hacer eso.',
  'reject.unknown_actor': 'Jugador desconocido.',
  'reject.unknown_mobile': 'No hay nadie libre.',
  'reject.not_owner': 'Eso no es tuyo.',
  'reject.busy': 'Todos están ocupados.',
  'reject.unknown_element': 'Eso ya no existe.',
  'reject.already_there': 'Ya está ahí.',
  'reject.no_access': 'No se puede entrar ahí.',
  'reject.off_map': 'Eso está fuera del mapa.',
  'reject.not_hidden': 'Ese sector ya está abierto.',
  'reject.not_adjacent': 'Solo se abre junto a un sector abierto.',
  'reject.bad_amount': 'Cantidad inválida.',
  'reject.content_mismatch': 'Las tablas no coinciden.',
  'reject.dark': 'No habrá luz para trabajar.',
  'reject.not_buildable': 'Eso no se puede construir.',
  'reject.bad_position': 'Solo se construye en un sector abierto.',
  'reject.too_close': 'Demasiado cerca de otra cosa.',
  'reject.not_near': 'Tiene que estar junto al agua.',
  'reject.not_linkable': 'Esos dos no se pueden unir así.',
  'reject.already_linked': 'Ya están unidos.',
  'reject.too_long': 'Demasiado lejos.',
  'reject.not_switchable': 'Eso no se enciende.',
  'reject.no_supply': 'Primero hay que unirla a la batería.',
  'reject.unchanged': 'Ya está así.',
  'reject.unknown_task': 'Tarea desconocida.',
  'reject.wrong_element': 'Eso no se hace ahí.',
  'reject.nothing_to_do': 'Ahora no hay nada que hacer ahí.',
  'reject.not_hireable': 'No se puede contratar.',
  'reject.no_bed': 'No hay cama libre.',
  'reject.no_encargo': 'Ese encargo ya no está.',
  'reject.encargo_done': 'El encargo ya está cubierto.',
  'reject.insufficient': 'No hay bastante {resource}.',
  'reject.full': 'No cabe más {resource}.',
};

const gl: Dict = {
  'res.energia': 'enerxía',
  'res.agua': 'auga',
  'res.comida': 'comida',
  'res.madera': 'madeira',
  'res.piedra': 'pedra',
  'res.eagles': 'Aguias',
  'res.trabajo': 'horas de obra',
  'unit.energia': '{n} kWh',
  'unit.agua': '{n} L',
  'unit.comida': '{n} racións',
  'unit.comida.one': '{n} ración',
  'unit.madera': '{n} de madeira',
  'unit.piedra': '{n} de pedra',
  'unit.eagles': '{n} Aguias',
  'unit.eagles.one': '{n} Aguia',
  'rate.energia': '{n} W',
  'rate.agua': '{n} L/h',
  'rate.perDay': '{what} ao día',
  'el.casa': 'Casa',
  'el.panel': 'Panel solar',
  'el.bateria': 'Batería',
  'el.pozo': 'Pozo',
  'el.huerta': 'Horta',
  'el.taller': 'Obradoiro',
  'el.cobertizo': 'Alpendre',
  'el.bomba': 'Bomba de auga',
  'el.punto_carga': 'Punto de carga',
  'el.almacen_comun': 'Almacén común',
  'el.colina': 'Outeiro',
  'el.paso': 'Paso estreito',
  'el.salto': 'Fervenza',
  'el.madera': 'Madeira',
  'el.piedra': 'Pedra',
  'el.manantial': 'Manancial',
  'place.punto_carga': 'punto de carga',
  'place.almacen_comun': 'almacén común',
  'terrain.prado': 'Prado',
  'terrain.bosque': 'Fraga',
  'terrain.agua': 'Auga',
  'terrain.cantera': 'Canteira',
  'sector.hidden': 'Sector sen abrir',
  'sector.open': 'Sector aberto',
  'sector.byYou': 'Abríchelo ti',
  'mob.obrero_peon': 'Traballo de peón',
  'mob.obrero_tecnico': 'Traballo técnico',
  'act.reveal': 'Abrir o sector',
  'act.move': 'Ir aquí',
  'act.home': 'Volver á casa',
  'act.build.taller': 'Construír un obradoiro',
  'act.build.cobertizo': 'Construír un alpendre',
  'act.build.bomba': 'Construír unha bomba',
  'act.task.sacar_agua': 'Sacar auga',
  'act.task.recoger': 'Recoller a colleita',
  'act.task.talar': 'Cortar madeira',
  'act.task.picar': 'Picar pedra',
  'act.task.limpiar': 'Limpar o panel',
  'act.on': 'Acender',
  'act.off': 'Apagar',
  'act.hire.obrero_peon': 'Contratar a alguén',
  'act.link.cable': 'Tender un cable',
  'act.link.canal': 'Abrir unha canle',
  'act.link.camino': 'Facer un camiño',
  'act.link.pick': 'Toca o outro extremo',
  'act.link.none': 'Non hai nada que unir así desde aquí',
  'act.deliver': 'Levar {what}',
  'act.deliver.work': 'Traballar na obra',
  'act.cancel': 'Cancelar',
  'act.close': 'Pechar',
  'act.frameHome': 'Ver a casa',
  'sheet.worker': 'Vai {name}',
  'meta.ends': 'remata {when}',
  'meta.arrives': 'chega {when}',
  'meta.carry': 'leva {what}',
  'meta.work': '{d} de obra',
  'meta.pay': 'cobra {pay}',
  'meta.pickOther': 'Despois, toca o outro extremo',
  'info.store': '{have} de {cap}',
  'info.produces': 'Dá {rate} agora',
  'info.consumes': 'Gasta {rate}',
  'info.unsupplied': 'Sen {resource}',
  'info.dirt': 'Sucidade: {pct} %',
  'info.capacity': 'Capacidade: {pct} %',
  'info.running': 'Acesa',
  'info.stopped': 'Apagada',
  'info.beds': 'Camas: {used} de {beds} ocupadas',
  'info.builtByYou': 'Construíchelo ti',
  'info.common': 'Do común',
  'info.encargo': 'Hoxe fai falta {what}; entregado: {done}',
  'info.carrying': 'Leva {what}',
  'info.free': 'Sen custo',
  'info.from': 'Desde: {what}',
  'info.fromTo': 'Entre {a} e {b}',
  'worker.idle': 'Ceibe',
  'worker.freeAt': 'Ceibe {when}',
  'worker.walking': 'De camiño. Chega {when}.',
  'worker.goingTo': 'Vai {what}. Remata {when}.',
  'worker.working': 'Traballando: {what}. Remata {when}.',
  'worker.waiting': 'Agarda pola luz para {what}. Remata {when}.',
  'worker.hungry': 'Non comeu: rende a metade',
  'job.reveal': 'abrir un sector',
  'job.build.taller': 'construír un obradoiro',
  'job.build.cobertizo': 'construír un alpendre',
  'job.build.bomba': 'construír unha bomba',
  'job.link.cable': 'tender un cable',
  'job.link.canal': 'abrir unha canle',
  'job.link.camino': 'facer un camiño',
  'job.task.sacar_agua': 'sacar auga',
  'job.task.recoger': 'recoller a colleita',
  'job.task.talar': 'cortar madeira',
  'job.task.picar': 'picar pedra',
  'job.task.limpiar': 'limpar o panel',
  'job.deliver': 'levar {what} ao {place}',
  'job.deliverWork': 'traballar no {place}',
  'time.min': '{n} min',
  'time.h': '{n} h',
  'time.hmin': '{h} h {m} min',
  'when.today': 'ás {t}',
  'when.tomorrow': 'mañá ás {t}',
  'when.later': 'o {d} ás {t}',
  'clock.day': 'Hai luz para traballar',
  'clock.night': 'É de noite',
  'clock.dayUntil': 'Hai luz para traballar. Vaise {when}.',
  'clock.nightUntil': 'É de noite. Poderase traballar {when}.',
  'board.title': 'Lousa do común',
  'board.need': '{what} no {place}',
  'board.work': '{d} de obra no {place}',
  'board.progress': 'Entregado: {done} de {total}',
  'board.reward': 'Paga {reward} en total',
  'board.who': 'Quen o trouxo',
  'board.always': 'O traído sempre',
  'board.you': 'A túa leira',
  'board.totalWork': '{d} de obra',
  'board.none': 'Hoxe non fai falta nada',
  'board.send': 'Mandar a alguén',
  'board.sendWho': 'Mandar a {name}',
  'board.show': 'Ver onde é',
  'board.done': 'Xa está cuberto',
  'menu.title': 'Menú',
  'menu.lang': 'Idioma',
  'menu.export': 'Exportar a partida',
  'menu.copy': 'Copiar a partida',
  'menu.import': 'Cargar unha partida',
  'menu.reset': 'Comezar de novo',
  'menu.resetConfirm': 'Borrar esta leira e comezar outra?',
  'menu.resetYes': 'Borrar e comezar',
  'menu.importConfirm': 'Cambiar esta partida pola do ficheiro? A de agora pérdese.',
  'menu.importYes': 'Cambiar',
  'menu.version': 'Versión {build}, regras {rules}, táboas {content}',
  'menu.seed': 'Semente {seed}',
  'menu.exported': 'Partida exportada',
  'menu.copied': 'Partida copiada',
  'menu.copyFailed': 'Non se puido copiar',
  'menu.imported': 'Partida cargada',
  'menu.importSame': 'Partida cargada: o hash coincide en t={tick}',
  'menu.importDiffers': 'Partida cargada: con estas táboas o hash non coincide en t={tick}',
  'menu.importBad': 'Ese ficheiro non é unha partida',
  'menu.replayed': 'A partida repetiuse coas regras novas',
  'toast.sent': 'Orde dada',
  'toast.revealed': 'Sector aberto',
  'toast.built': '{what}: rematado',
  'toast.linked': 'Unión feita',
  'toast.hired': 'Chegou {name}',
  'toast.switchedOff': '{what}: parou',
  'toast.delivered': 'Entregado: +{pay}',
  'toast.encargo': 'Hai un encargo novo na lousa',
  'toast.hungry': '{name} non comeu',
  'toast.free': '{name} rematou',
  'hud.hash': 't={tick} {hash}',
  'reject.too_late': 'Demasiado tarde.',
  'reject.unknown_kind': 'Orde descoñecida.',
  'reject.bad_args': 'Orde mal formada.',
  'reject.not_system': 'Só o sistema pode facer iso.',
  'reject.unknown_actor': 'Xogador descoñecido.',
  'reject.unknown_mobile': 'Non hai ninguén ceibe.',
  'reject.not_owner': 'Iso non é teu.',
  'reject.busy': 'Están todos ocupados.',
  'reject.unknown_element': 'Iso xa non existe.',
  'reject.already_there': 'Xa está aí.',
  'reject.no_access': 'Non se pode entrar aí.',
  'reject.off_map': 'Iso está fóra do mapa.',
  'reject.not_hidden': 'Ese sector xa está aberto.',
  'reject.not_adjacent': 'Só se abre xunto a un sector aberto.',
  'reject.bad_amount': 'Cantidade non válida.',
  'reject.content_mismatch': 'As táboas non coinciden.',
  'reject.dark': 'Non haberá luz para traballar.',
  'reject.not_buildable': 'Iso non se pode construír.',
  'reject.bad_position': 'Só se constrúe nun sector aberto.',
  'reject.too_close': 'Demasiado preto doutra cousa.',
  'reject.not_near': 'Ten que estar xunto á auga.',
  'reject.not_linkable': 'Eses dous non se poden unir así.',
  'reject.already_linked': 'Xa están unidos.',
  'reject.too_long': 'Demasiado lonxe.',
  'reject.not_switchable': 'Iso non se acende.',
  'reject.no_supply': 'Primeiro hai que unila á batería.',
  'reject.unchanged': 'Xa está así.',
  'reject.unknown_task': 'Tarefa descoñecida.',
  'reject.wrong_element': 'Iso non se fai aí.',
  'reject.nothing_to_do': 'Agora non hai nada que facer aí.',
  'reject.not_hireable': 'Non se pode contratar.',
  'reject.no_bed': 'Non hai cama libre.',
  'reject.no_encargo': 'Ese encargo xa non está.',
  'reject.encargo_done': 'O encargo xa está cuberto.',
  'reject.insufficient': 'Non chega {resource}.',
  'reject.full': 'Non cabe máis {resource}.',
};

export const DICTIONARIES: Record<Lang, Dict> = { es, gl };

let current: Lang = 'es';

export function setLang(l: Lang): void {
  current = l;
  document.documentElement.lang = l;
}

export function lang(): Lang {
  return current;
}

/** El idioma del navegador si es uno de los nuestros; si no, el maestro. */
export function detectLang(): Lang {
  const prefs = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  for (const l of prefs) {
    const base = l.toLowerCase().slice(0, 2);
    if (base === 'gl' || base === 'es') return base;
  }
  return 'es';
}

export function t(key: string, params: Record<string, string | number> = {}): string {
  let text = DICTIONARIES[current][key] ?? es[key] ?? key;
  for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/** Si la clave existe en el diccionario maestro. */
export function has(key: string): boolean {
  return es[key] !== undefined;
}

const GL_WEEKDAYS = ['domingo', 'luns', 'martes', 'mércores', 'xoves', 'venres', 'sábado'];
const supported: Record<string, boolean> = {};

/**
 * Locale para `Intl`. Si el motor no trae datos de gallego (algunos WebView y Chromium sin ICU
 * completo), los números y las horas se escriben como en castellano, que usa las mismas
 * convenciones, y los días de la semana salen de una lista propia.
 */
function locale(): string {
  const want = current === 'gl' ? 'gl-ES' : 'es-ES';
  supported[want] ??= Intl.NumberFormat.supportedLocalesOf([want]).length > 0;
  return supported[want] ? want : 'es-ES';
}

function weekday(d: Date): string {
  if (current === 'gl' && locale() !== 'gl-ES') return GL_WEEKDAYS[d.getDay()] ?? '';
  return new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(d);
}

/** Número con los decimales pedidos (como mucho `decimals`, como poco `min`), a la manera del idioma. */
export function num(n: number, decimals = 0, min = decimals): string {
  return new Intl.NumberFormat(locale(), {
    minimumFractionDigits: min,
    maximumFractionDigits: decimals,
  }).format(n);
}

/** Cantidad de un recurso sin unidad (la energía, de J a kWh; el trabajo, en horas). */
export function qty(resource: string, value: number): string {
  if (resource === 'energia') return num(value / 3_600_000, 2);
  if (resource === 'trabajo') return duration(value);
  return num(value);
}

/** Cantidad de un recurso con su unidad. */
export function amount(resource: string, value: number): string {
  if (resource === 'trabajo') return t('meta.work', { d: duration(value) });
  const one = value === 1 && has(`unit.${resource}.one`) ? '.one' : '';
  return has(`unit.${resource}`)
    ? t(`unit.${resource}${one}`, { n: qty(resource, value) })
    : `${qty(resource, value)} ${resource}`;
}

/** Tasa a partir de unidades por día: la energía en vatios, el agua por hora, lo demás por día. */
export function rate(resource: string, perDay: number): string {
  if (resource === 'energia') return t('rate.energia', { n: num(perDay / 86_400) });
  if (resource === 'agua') return t('rate.agua', { n: num(perDay / 24) });
  return t('rate.perDay', { what: amount(resource, perDay) });
}

/** Duración de una cantidad de ticks. */
export function duration(ticks: number, tickMs = 100): string {
  const minutes = Math.max(1, Math.round((ticks * tickMs) / 60_000));
  if (minutes < 60) return t('time.min', { n: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? t('time.h', { n: h }) : t('time.hmin', { h, m });
}

/** Hora de reloj de un instante, dicha respecto a hoy: «a las 14:05», «mañana a las 06:30». */
export function when(ms: number, nowMs: number): string {
  const d = new Date(ms);
  const now = new Date(nowMs);
  const time = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(d);
  const dayOf = (x: Date): number => Math.floor((x.getTime() - x.getTimezoneOffset() * 60_000) / 86_400_000);
  const delta = dayOf(d) - dayOf(now);
  if (delta <= 0) return t('when.today', { t: time });
  if (delta === 1) return t('when.tomorrow', { t: time });
  const day =
    delta < 7
      ? weekday(d)
      : new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'numeric' }).format(d);
  return t('when.later', { d: day, t: time });
}

/** Lista con «y» o «e» (sin depender de los datos de idioma del motor). */
export function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  const and = current === 'gl' ? ' e ' : ' y ';
  return `${items.slice(0, -1).join(', ')}${and}${items[items.length - 1] ?? ''}`;
}

/** Texto de un motivo de rechazo, incluidos los que llevan recurso (`insufficient:…`, `full:…`). */
export function rejectText(reason: string): string {
  for (const prefix of ['insufficient', 'full']) {
    if (reason.startsWith(`${prefix}:`)) {
      const resource = reason.slice(prefix.length + 1);
      return t(`reject.${prefix}`, { resource: t(`res.${resource}`) });
    }
  }
  return has(`reject.${reason}`) ? t(`reject.${reason}`) : reason;
}
