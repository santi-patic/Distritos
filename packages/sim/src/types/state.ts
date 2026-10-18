/**
 * Tipos de estado. Esquema del paquete sim, §7.
 *
 * El estado es JSON plano de enteros seguros, cadenas, booleanos y null: se serializa con
 * `serialize`, se hashea con `hashState` y se reconstruye desde el registro de órdenes.
 * Los campos marcados F2–F5 son huecos reservados: existen en el tipo, no en las reglas. Los de
 * F1 son opcionales y solo aparecen cuando las tablas definen almacenes, flujos o pizarra.
 */

import type { Vec } from '../geom.js';
import type { HexKey } from '../hex.js';
import type { RngState } from '../rng.js';
import type {
  ActorId,
  ElementId,
  Int,
  KindId,
  LinkId,
  Mm,
  MmPerS,
  MobileId,
  Permille,
  PlotId,
  ResourceId,
  Tick,
} from './ids.js';

/** La casa es un terreno dentro de 'district'; incursión, carga y disputa son escenas aparte. */
export type SceneKind = 'district' | 'incursion' | 'charge' | 'dispute';

export interface SceneHeader {
  kind: SceneKind;
  /** Plantilla de la que nace la escena. */
  template: KindId;
  /** Semilla de la escena, 64 bits en hexadecimal. */
  seed: string;
  tickMs: Int;
  /** Longitud del ciclo día-noche en ticks. */
  dayTicks: Int;
  /** Fase del ciclo en el tick 0. */
  dayOffset: Int;
  /** Retícula entera de centros (hex.ts); precomputada, sin raíces en ejecución. */
  hexW: Mm;
  hexH: Mm;
  /** sha-256 de las tablas compiladas con las que corre la escena. */
  contentHash: string;
  /** Versión de las reglas (semver del paquete sim). */
  rules: string;
}

export type Audience = 'owner' | 'district' | 'all' | { actors: ActorId[] };

export interface Access {
  see: Audience;
  enter: Audience;
}

export interface Sector {
  q: Int;
  r: Int;
  /** null: tierra común del distrito. */
  plot: PlotId | null;
  /** 'rumor' reservado para la radio (F5). */
  status: 'hidden' | 'revealed';
  /** «El nombre de quien abre cada sector.» */
  revealedBy?: ActorId;
  revealedTick?: Tick;
  /** Lo que se vio al abrir. */
  terrain?: KindId;
  access: Access;
  /** F1 (P14). Apertura en curso: quién la empezó y cuándo se abre. */
  opening?: Opening;
}

/** F1 (P14). Una apertura en marcha: el sector sigue oculto hasta `endTick`. */
export interface Opening {
  by: ActorId;
  startTick: Tick;
  endTick: Tick;
}

export interface MapState {
  sectors: Record<HexKey, Sector>;
}

export type PlotStatus = 'vacant' | 'occupied' | 'called' | 'custody';

export interface Plot {
  id: PlotId;
  archetype: KindId;
  /** Experiencia mínima para ocuparlo. */
  tier: Int;
  /** Sector central; los sectores del terreno llevan Sector.plot. */
  anchor: HexKey;
  owner: ActorId | null;
  status: PlotStatus;
  /** Tick del último cambio de estado. */
  since: Tick;
  /** Llamada a la actividad en curso (F5). */
  calledTick?: Tick;
}

export interface Element {
  id: ElementId;
  kind: KindId;
  pos: Vec;
  sector: HexKey;
  /** El tamaño es el nivel. */
  level: Int;
  /** Sin dueño: es del distrito (tierra común). */
  owner?: ActorId;
  /** Obras con nombre (F1 en el terreno, F5 en la tierra común). */
  builtBy?: ActorId[];
  /** Degradación (F1): suciedad del panel o capacidad perdida de la batería, en milésimas. */
  wear?: Permille;
  /** Nombre que le ha puesto un jugador (F1, P16); sin él, la interfaz lo nombra por su tipo. */
  name?: string;
  /** Existencias de sus almacenes, por recurso (F1). La capacidad está en la tabla. */
  store?: Record<ResourceId, Int>;
  /** Restos de los acumuladores de flujo de cada almacén, por recurso (F1). */
  carry?: Record<string, Int>;
  /** Descarga acumulada desde el último ciclo contado (F1, baterías). */
  drawn?: Int;
  /** Encendido (F1, elementos conmutables). */
  on?: boolean;
}

export interface Stats {
  force: Int;
  vision: Int;
  alert: Int;
  speed: MmPerS;
}

/** Un viaje es un compromiso: origen, destino y llegada se fijan al salir. La posición se deriva. */
export interface Trip {
  from: Vec;
  to: Vec;
  /** null cuando el destino es un punto (el centro de un sector). */
  toElement: ElementId | null;
  departTick: Tick;
  arriveTick: Tick;
  /** Orden que lo lanzó; desempata llegadas simultáneas. */
  seq: Int;
}

export type Where = { kind: 'at'; pos: Vec; element: ElementId | null } | { kind: 'trip'; trip: Trip };

/**
 * Una tarea se fija al dar la orden: empieza al llegar (startTick) y termina en endTick,
 * calculado saltando los tramos sin luz de trabajo. Su efecto ocurre al terminar.
 */
export interface RevealJob {
  kind: 'reveal';
  hex: HexKey;
  startTick: Tick;
  endTick: Tick;
  /**
   * F1 (P14). Con curva: el obrero solo va a empezar la apertura (la tarea acaba al llegar) y
   * el sector se abre en este tick, fijado al dar la orden.
   */
  opens?: Tick;
}

/** F1. Levantar un edificio en un punto. */
export interface BuildJob {
  kind: 'build';
  what: KindId;
  pos: Vec;
  startTick: Tick;
  endTick: Tick;
}

/** F1. Tender un nexo entre dos elementos. */
export interface LinkJob {
  kind: 'link';
  what: KindId;
  from: ElementId;
  to: ElementId;
  startTick: Tick;
  endTick: Tick;
}

/** F1. Tarea sobre un elemento (sacar agua, recoger, limpiar…). */
export interface TaskJob {
  kind: 'task';
  task: KindId;
  element: ElementId;
  startTick: Tick;
  endTick: Tick;
  /** F1 (P9). Lo que deja al terminar una tarea de jornada, fijado al dar la orden. */
  gives?: Record<ResourceId, Int>;
}

/** F1. Llevar a la tierra común lo que pide un encargo de la pizarra, o trabajar allí. */
export interface DeliverJob {
  kind: 'deliver';
  encargo: Int;
  element: ElementId;
  resource: ResourceId;
  work: boolean;
  /** Lo que se entrega: unidades del recurso, o ticks de trabajo si `work`. */
  amount: Int;
  /** Lo que se cobra al entregar, fijado al dar la orden. */
  pay: Int;
  startTick: Tick;
  endTick: Tick;
}

/** F1. Una parada de una ruta, con su horario fijado al dar la orden. */
export interface RouteStop {
  at: ElementId;
  arrive: Tick;
  /** Fin del trabajo en la parada (con luz) y salida hacia la siguiente. */
  leave: Tick;
}

/**
 * F1. Ruta de recados: una cadena de viajes con una parada de trabajo en cada sitio. En cada
 * parada se entrega lo que va allí y se recoge lo que va a una parada posterior. `startTick` y
 * `endTick` son los de la parada en curso; el horario entero se fija al dar la orden.
 */
export interface RouteJob {
  kind: 'route';
  stops: RouteStop[];
  /** Parada en curso: a la que va o en la que está. */
  index: Int;
  startTick: Tick;
  endTick: Tick;
  /** Orden que la lanzó; desempata las llegadas de sus viajes. */
  seq: Int;
}

export type Job = RevealJob | BuildJob | LinkJob | TaskJob | DeliverJob | RouteJob;

export interface Mobile {
  id: MobileId;
  kind: KindId;
  owner: ActorId;
  /** Dato del jugador o de una tabla de nombres; no es texto traducible. */
  name?: string;
  stats: Stats;
  where: Where;
  job: Job | null;
  /** Lo que lleva encima (F1: la entrega de un encargo). */
  cargo?: Record<ResourceId, Int>;
  /** No ha comido hoy (F1): trabaja más despacio. */
  hungry?: true;
}

/**
 * Nexo entre dos elementos. Los que llevan un recurso van en el sentido del flujo: de quien
 * produce al almacén, o del almacén a quien consume.
 */
export interface Link {
  id: LinkId;
  kind: KindId;
  from: ElementId;
  to: ElementId;
  wear?: Permille;
  /** Obra con nombre (F1). */
  builtBy?: ActorId[];
}

/** Lo que viaja entre distritos (F1+); vacío en F0. Copia de la entidad del servidor. */
export interface Character {
  /** Oficios y nivel. */
  skills: Record<KindId, Int>;
  /** Planos y habilidades. */
  blueprints: KindId[];
  /** Calculada en tabla a partir del libro de hechos del servidor. */
  experience: Int;
}

/** Obrero contratado que llega en un tick conocido (al amanecer). F1. */
export interface PendingHire {
  kind: KindId;
  tick: Tick;
  seq: Int;
}

export interface ActorState {
  plot: PlotId | null;
  /** Lo que no es físico (Eagles); lo físico vive en los almacenes de los elementos (F1). */
  stocks: Record<ResourceId, Int>;
  /** Parte de los flujos propios que va al común, en milésimas (F5; inerte antes). */
  share: Permille;
  /** Actividad: cualquier orden aceptada del actor. */
  lastOrderTick: Tick;
  character: Character;
  /** Contrataciones en camino (F1). */
  hires?: PendingHire[];
  /** Veces que ha empezado cada tarea con variante de primera vez (F1, entrada fácil). */
  started?: Record<string, Int>;
}

/** Encargo publicado en la pizarra del común (F1). */
export interface Encargo {
  id: Int;
  kind: KindId;
  /** Elemento de la tierra común de destino. */
  at: ElementId;
  resource: ResourceId;
  work: boolean;
  amount: Int;
  perTrip: Int;
  reward: Int;
  /** Comprometido por entregas en camino o ya hechas. */
  reserved: Int;
  delivered: Int;
  /** Lo entregado por cada actor. */
  by: Record<ActorId, Int>;
}

/** La pizarra del común: el encargo del día y lo que cada uno ha entregado siempre (F1). */
export interface Board {
  /** Días transcurridos desde la creación de la escena. */
  day: Int;
  /** Id del próximo encargo. */
  next: Int;
  encargo: Encargo | null;
  totals: Record<ActorId, Record<ResourceId, Int>>;
}

/** F1. Un recado: algo que hay que llevar de un sitio a otro. */
export interface Errand {
  id: Int;
  kind: KindId;
  /** Sitio de destino. */
  to: ElementId;
  size: Int;
  /** Lo que paga al entregarlo; se debe a quien lo recoge (P1). */
  pay: Int;
  /** Sitio donde está, o null si lo lleva un obrero. */
  at: ElementId | null;
  carrier?: MobileId;
  /**
   * Quien lo recogió. Lo que deja en un sitio solo lo vuelve a recoger él. Los que genera un
   * sitio con dueño (la casa del jugador) nacen suyos.
   */
  holder?: ActorId;
  /** Tick en que caduca si sigue sin recoger. */
  expires?: Tick;
  /** F1 (P15). Recado de hacer: ticks de trabajo con luz en la parada del destino. */
  work?: Int;
  /** F1 (P15). Lo que se saca de las existencias de quien lo recoge (llevar de casa). */
  takes?: Record<ResourceId, Int>;
  /** F1 (P15). Lo de `takes` ya se sacó: al volver a recogerlo no se saca otra vez. */
  taken?: true;
  /** F1 (P15). Recado de hacer comprometido por la ruta de este obrero al darla. */
  assigned?: MobileId;
}

/** F1. Los recados del distrito. */
export interface Errands {
  /** Id del próximo recado. */
  next: Int;
  items: Record<string, Errand>;
  /** Próximo tick de generación de cada sitio. */
  nextAt: Record<ElementId, Tick>;
  /** Recados entregados por cada actor. */
  delivered: Record<ActorId, Int>;
}

/** Lo común; se detalla con el diseño del distrito (F5). */
export interface DistrictState {
  pot: Record<ResourceId, Int>;
  /** F1: el común mínimo que lleva el juego hasta F5. */
  board?: Board;
  /** F1: recados entre los sitios del común y las casas vecinas. */
  errands?: Errands;
}

export interface SectorContent {
  terrain: KindId;
  finds: { kind: KindId; pos: Vec }[];
}

/** Lo que ningún actor ve. Generado al crear la escena; pasa a público al abrir. */
export interface HiddenState {
  sectorContents: Record<HexKey, SectorContent>;
}

export interface SimState {
  v: 1;
  scene: SceneHeader;
  /** Próximo tick a ejecutar. */
  tick: Tick;
  rng: RngState;
  counters: { element: Int; mobile: Int; link: Int };
  map: MapState;
  plots: Record<PlotId, Plot>;
  elements: Record<ElementId, Element>;
  mobiles: Record<MobileId, Mobile>;
  links: Record<LinkId, Link>;
  actors: Record<ActorId, ActorState>;
  district: DistrictState;
  hidden: HiddenState;
}

export const STATE_VERSION = 1 as const;
