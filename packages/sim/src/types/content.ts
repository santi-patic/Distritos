/**
 * Contenido compilado: la forma en que el sim consume las tablas. Esquema del paquete sim, §14.
 *
 * Las tablas JSON viven en @distritos/content y llegan aquí ya validadas y convertidas
 * (duraciones en ticks, velocidades en mm/s, tasas en unidades por día). El sim recibe este
 * objeto como argumento en todas sus funciones y nunca lo importa ni lo cachea: cambiar de
 * tablas es cambiar de argumento, y el hash de las tablas entra en el estado.
 *
 * Todo lo marcado F1 es opcional: sin esas secciones, las reglas se comportan como en F0
 * (sin almacenes, sin flujos, las tareas no esperan a la luz). Así unas tablas de F0 siguen
 * dando la misma partida.
 */

import type { Hex } from '../hex.js';
import type { Int, Joule, KindId, Mm, Permille, PlotId, ResourceId } from './ids.js';
import type { SceneKind, Stats } from './state.js';

export interface SceneTable {
  tickMs: Int;
  dayTicks: Int;
  /**
   * Curva de luz por tramos constantes: pares [tick del ciclo, milésimas], ordenados. Cada
   * punto fija la luz desde su tick hasta el siguiente; antes del primero rige el último.
   */
  light: [Int, Int][];
  /** Radio centro–vértice del hexágono, mm. */
  hexSizeMm: Mm;
  /** Retícula entera: hexW = 2·round(hexSizeMm·√3/2) (par), hexH = round(hexSizeMm·3/2). */
  hexW: Mm;
  hexH: Mm;
  maxCatchupTicks: Int;
  /** F1. Luz mínima para que avance una tarea; sin ella, se trabaja a cualquier hora. */
  workLight?: Permille;
  /** F1. Tick del ciclo del paso diario (comidas, suciedad, ciclos de batería, pizarra). */
  dailyAt?: Int;
}

export interface Weighted {
  kind: KindId;
  weight: Int;
}

export interface StartElement {
  kind: KindId;
  /** Desplazamiento respecto al centro del sector central, mm. */
  dx: Mm;
  dy: Mm;
  /** F1. Existencias iniciales de sus almacenes (se recortan a la capacidad). */
  store?: Record<ResourceId, Int>;
  /** F1. Encendido al empezar (solo elementos conmutables). */
  on?: boolean;
}

/** F1. Nexo de la dotación inicial, entre dos elementos de la lista por su índice. */
export interface StartLink {
  kind: KindId;
  a: Int;
  b: Int;
}

export interface StartKit {
  /** Terreno del sector central, abierto desde el principio. */
  terrain: KindId;
  elements: StartElement[];
  mobiles: { kind: KindId }[];
  stocks: Record<ResourceId, Int>;
  /** F1. La finca empieza cableada. */
  links?: StartLink[];
}

export interface Archetype {
  /** Experiencia mínima para ocupar un terreno de este arquetipo. */
  tier: Int;
  /** Qué terreno sale en cada sector oculto. */
  terrains: Weighted[];
  /** Qué se encuentra al abrir, por terreno. 'nada' es un hallazgo válido. */
  finds: Record<KindId, Weighted[]>;
  start: StartKit;
}

export interface TemplatePlot {
  id: PlotId;
  archetype: KindId;
  anchor: Hex;
  /** Los sectores del terreno son range(anchor, radius); más adelante, listas explícitas. */
  radius: Int;
}

/** F1. Elemento fijo de la tierra común: existe desde la creación, abierto por el distrito. */
export interface CommonElement {
  kind: KindId;
  hex: Hex;
  dx: Mm;
  dy: Mm;
}

export interface Template {
  kind: SceneKind;
  plots: TemplatePlot[];
  /** Tierra común del distrito: sus sectores y el arquetipo que decide qué hay en ellos. */
  common: { archetype: KindId; sectors: Hex[]; elements?: CommonElement[] } | null;
}

/** F1. Lo que produce un elemento. Las tasas van en unidades por día de 24 h. */
export interface ProduceSpec {
  resource: ResourceId;
  /** Unidades por día a pleno rendimiento. */
  perDay: Int;
  /** Escala con la luz del tick (paneles). */
  light?: boolean;
  /** Escala con (1000 − desgaste): la suciedad del panel le quita rendimiento. */
  wear?: boolean;
  /** 'self': a su propio almacén; 'link': al almacén al que lo une un nexo que lleva el recurso. */
  to: 'self' | 'link';
}

/** F1. Lo que consume un elemento, siempre del almacén al que lo une un nexo. */
export interface ConsumeSpec {
  resource: ResourceId;
  perDay: Int;
}

export interface ElementKind {
  /** Círculo (fijo), rombo (recurso) o círculo de sitio; el cliente dibuja por categoría. */
  category: 'fixed' | 'resource' | 'site';
  // ---- F1 ----
  /** Capacidad de sus almacenes, por recurso. */
  stores?: Record<ResourceId, Int>;
  /** Sus almacenes son existencias del dueño: de ahí salen los costes y las comidas. */
  inventory?: boolean;
  produce?: ProduceSpec;
  consume?: ConsumeSpec;
  /** Se enciende y se apaga; se apaga solo sin suministro o con su almacén lleno. */
  switchable?: boolean;
  /** Camas: cuántos obreros pueden vivir en la finca. */
  beds?: Int;
  /** Desgaste por calendario, reversible y con tope (suciedad del panel). */
  soil?: { perDay: Permille; max: Permille };
  /** Desgaste por uso: milésimas de capacidad perdidas por cada ciclo completo de descarga. */
  cycles?: { lossPermille: Permille };
}

export interface MobileKind {
  stats: Stats;
  /** Tabla de nombres; se elige con el generador de la escena. */
  names: string[];
  /** F1. Lo que come al día, del almacén de la casa. */
  eats?: { resource: ResourceId; perDay: Int };
  /** F1. Rendimiento en las tareas cuando no ha comido, en milésimas. */
  hungryPermille?: Permille;
  /** F1. Bultos de recados que lleva a la vez. */
  carry?: Int;
}

export interface TerrainKind {
  /** Solo existencia por ahora; el cliente le da color. */
  category: 'ground' | 'water' | 'wood' | 'stone';
}

/** Abrir un sector trabajando: el obrero trabaja `ticks` en él al llegar y lo abre al terminar (F0). */
export interface RevealWork {
  resource: ResourceId;
  cost: Joule;
  ticks: Int;
  firstTicks?: Int;
}

/**
 * F1 (P14). Abrir un sector con curva: el obrero va a empezar la apertura y queda libre; el
 * sector se abre cuando pasa su tiempo, de día y de noche. La n-ésima apertura que empieza un
 * actor dura `curve[n]` ticks (pasado el final, el último valor). Varias a la vez: el freno es
 * el coste.
 */
export interface RevealCurve {
  resource: ResourceId;
  cost: Joule;
  curve: Int[];
}

export interface Actions {
  /** Abrir un sector: qué recurso cuesta, cuánto y cuánto tarda. */
  reveal: RevealWork | RevealCurve;
  /** F1 (P16). Nombres que pone el jugador a lugares y obreros; sin esto, no se renombra. */
  name?: { maxLength: Int };
}

export function isRevealCurve(r: RevealWork | RevealCurve): r is RevealCurve {
  return 'curve' in r;
}

/** F1. Recurso: físico (en almacenes de elementos) o de libro (en el actor). */
export interface ResourceKind {
  physical: boolean;
  /** Orden de resolución de flujos: un recurso va antes que los que se producen gastándolo. */
  order: Int;
}

/** F1. Duración y coste de una tarea; `firstTicks` es la primera vez del actor (entrada fácil). */
export interface WorkSpec {
  ticks: Int;
  firstTicks?: Int;
  cost?: Record<ResourceId, Int>;
}

/** F1. Tarea de un obrero sobre un elemento (sacar agua, recoger, limpiar…). */
export interface TaskKind extends WorkSpec {
  /** Tipos de elemento sobre los que se hace. */
  at: KindId[];
  /** Lo que produce al terminar. */
  gives?: Record<ResourceId, Int>;
  /** A dónde va lo producido: el almacén del propio elemento o las existencias del dueño. */
  into?: 'self' | 'inventory';
  /** Lleva a las existencias lo que el elemento tiene almacenado de este recurso (recoger). */
  collect?: ResourceId;
  /** Deja el desgaste a cero (limpiar). */
  clean?: boolean;
  /** Variante si el actor tiene un elemento de este tipo (el taller). */
  tool?: WorkSpec & { kind: KindId };
  /**
   * F1 (P9). Tarea de jornada: dura lo que quede de luz de trabajo al llegar (de noche, la
   * jornada siguiente entera), o menos si antes se llena donde va lo producido. `gives` es lo
   * que rinde cada `ticks` de trabajo. La primera vez (`firstTicks`) sigue siendo corta y fija.
   */
  jornada?: boolean;
}

/** F1. Edificio construible. */
export interface BuildKind extends WorkSpec {
  cost: Record<ResourceId, Int>;
  /** Distancia mínima a cualquier otro elemento, mm. */
  gapMm: Mm;
  /** Tiene que haber un elemento de estos tipos a esta distancia en sectores. */
  near?: { kinds: KindId[]; hexes: Int };
}

/** F1. Nexo: cable, canal o camino. */
export interface LinkKind {
  /** Recurso que lleva (cable: energía; canal: agua). Sin él, es un camino. */
  carries?: ResourceId;
  /** Velocidad de los móviles entre sus dos extremos, en milésimas de la propia. */
  speedPermille?: Permille;
  /** Tramo de medida: la duración y el coste por tramo se cobran por cada unitMm o fracción. */
  unitMm: Mm;
  ticksPerUnit: Int;
  firstTicks?: Int;
  cost?: Record<ResourceId, Int>;
  costPerUnit?: Record<ResourceId, Int>;
  maxMm?: Mm;
}

/** F1. Contratación de un tipo de obrero. */
export interface HireKind {
  cost: Record<ResourceId, Int>;
}

/** F1. Encargo de la pizarra del común: lo que el distrito necesita hoy. */
export interface EncargoKind {
  id: KindId;
  /** Elemento de la tierra común al que se lleva o donde se trabaja. */
  at: KindId;
  /** Recurso que se entrega; si `work`, es la etiqueta de las horas y la cantidad va en ticks. */
  resource: ResourceId;
  work?: boolean;
  amount: Int;
  /** Lo más que lleva un obrero en un viaje (o trabaja en una orden). */
  perTrip: Int;
  /** Lo que paga el encargo completo, en la moneda de la pizarra. */
  reward: Int;
}

export interface BoardTable {
  currency: ResourceId;
  encargos: EncargoKind[];
}

/** F1. Sitio de recados (lugares del común y casas vecinas): guarda recados hasta su tope y genera los suyos. */
export interface PlaceKind {
  /** Bultos que caben, generados o dejados. */
  capacity: Int;
  /** Recados que se generan aquí al crear la escena. */
  start?: Int;
  /** Recados que genera, con su peso. */
  makes?: Weighted[];
  /** Cada cuántos ticks genera uno (si hay sitio). */
  everyTicks?: Int;
}

/**
 * F1. Tipo de recado. Los de llevar ocupan carga y se entregan en el destino; los de hacer
 * (P15) no ocupan carga: el obrero trabaja `work` ticks más en la parada del destino y cobra al
 * acabar.
 */
export interface ErrandKind {
  /** Tipos de sitio a los que puede ir. */
  to: KindId[];
  /** Bultos que ocupa; 0 en los de hacer. */
  size: Int;
  /** Lo que paga al entregarlo, en la moneda de los recados. */
  pay: Int;
  /** Ticks que aguanta en su sitio sin que nadie lo recoja; sin esto, no caduca. */
  expiresTicks?: Int;
  /** F1 (P15). Tipo, para la interfaz (pictograma y color): comida, energía, trabajo… */
  type?: KindId;
  /** F1 (P15). Recado de hacer: ticks de trabajo con luz en la parada del destino. */
  work?: Int;
  /**
   * F1 (P15). Lo que se saca de las existencias de quien lo recoge al recogerlo (llevar energía
   * o comida de casa); al entregarlo va al almacén del destino si lo tiene.
   */
  takes?: Record<ResourceId, Int>;
}

/** F1 (P15). Tipo de recado: clase y nada más (el pictograma y el color los pone el cliente). */
export interface ErrandType {
  class: 'llevar' | 'hacer';
}

/** F1. Recados y rutas. */
export interface ErrandTable {
  currency: ResourceId;
  /** Trabajo con luz de cada parada de una ruta (cargar, descargar, apuntar en la pizarra). */
  stopTicks: Int;
  firstStopTicks?: Int;
  maxStops: Int;
  kinds: Record<KindId, ErrandKind>;
  types?: Record<KindId, ErrandType>;
}

export interface CompiledContent {
  /** sha-256 del JSON canónico de todas las tablas. */
  hash: string;
  scenes: Record<SceneKind, SceneTable>;
  archetypes: Record<KindId, Archetype>;
  templates: Record<KindId, Template>;
  elements: Record<KindId, ElementKind>;
  mobiles: Record<KindId, MobileKind>;
  terrains: Record<KindId, TerrainKind>;
  actions: Actions;
  // ---- F1 ----
  resources?: Record<ResourceId, ResourceKind>;
  tasks?: Record<KindId, TaskKind>;
  builds?: Record<KindId, BuildKind>;
  links?: Record<KindId, LinkKind>;
  hires?: Record<KindId, HireKind>;
  board?: BoardTable;
  places?: Record<KindId, PlaceKind>;
  errands?: ErrandTable;
}

/** Hallazgo que no deja nada en el sector. */
export const NOTHING: KindId = 'nada';
