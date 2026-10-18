/**
 * Partida local: la escena corre en el navegador con el mismo sim que correrá en el servidor.
 *
 * El reloj de pared vive aquí, fuera del sim: el tick objetivo es floor((ahora − ancla) /
 * tickMs), con el ancla en milisegundos de época guardada con la partida, y `advance` lleva
 * el estado hasta él aplicando las órdenes del registro. Una intención se valida contra el
 * estado actual y, si vale, entra en el registro sellada con el tick actual: es el árbitro
 * local de F1; en F2 el árbitro será el servidor.
 *
 * Al abrir, el registro se repite desde el tick 0 (puesta al día). Si la partida llevaba más
 * del tope sin abrirse, el árbitro anota un salto del sistema al llegar al tope: lo que pasa
 * de ahí no produce (esquema §5.4).
 */

import {
  RULES_VERSION,
  SYSTEM_ACTOR,
  advance,
  createScene,
  hashState,
  quote,
  validate,
  view,
  type ActorId,
  type CompiledContent,
  type Event,
  type Order,
  type OrderIntent,
  type PublicState,
  type Quote,
  type Reject,
  type SimState,
  type Tick,
} from '@distritos/sim';
import type { ExportData, SaveData } from './save.js';

export interface Clock {
  /** Tick del estado (el próximo por ejecutar). */
  tick: number;
  /** Fracción del tick en curso, 0..1, para interpolar el dibujo. */
  fraction: number;
}

export class LocalGame {
  readonly state: SimState;
  private seq: number;

  constructor(
    readonly content: CompiledContent,
    readonly save: SaveData,
    readonly actor: ActorId,
  ) {
    this.state = createScene(save.params, content);
    this.seq = save.log.reduce((m, o) => Math.max(m, o.seq), 0);
  }

  get tickMs(): number {
    return this.state.scene.tickMs;
  }

  /** Tick que marca el reloj de pared. */
  wallTick(now: number = Date.now()): number {
    return Math.max(0, Math.floor((now - this.save.anchorMs) / this.tickMs));
  }

  /** Instante (época, ms) en que empieza un tick. */
  msOf(tick: Tick): number {
    return this.save.anchorMs + tick * this.tickMs;
  }

  clock(now: number = Date.now()): Clock {
    const wall = (now - this.save.anchorMs) / this.tickMs;
    const tick = this.state.tick;
    const fraction = wall >= tick && wall < tick + 1 ? wall - tick : 0;
    return { tick, fraction };
  }

  /**
   * Puesta al día al abrir: repite el registro hasta la hora actual. Más allá del tope de la
   * escena desde la última vez que se abrió, anota un salto del sistema.
   */
  catchUp(now: number = Date.now()): Event[] {
    const target = this.wallTick(now);
    const cap = this.content.scenes[this.state.scene.kind].maxCatchupTicks;
    const last = this.save.log[this.save.log.length - 1];
    const seen = Math.max(this.save.seenTick, last?.tick ?? 0);
    if (target - seen > cap) {
      const at = seen + cap;
      const ticks = target - at - 1;
      if (ticks > 0)
        this.append({ seq: this.seq + 1, tick: at, actor: SYSTEM_ACTOR, kind: 'skip', args: { ticks } });
    }
    return this.sync(now);
  }

  /** Lleva el estado hasta el tick del reloj de pared. Devuelve los eventos producidos. */
  sync(now: number = Date.now()): Event[] {
    const target = this.wallTick(now);
    if (target <= this.state.tick) return [];
    const events = advance(this.state, this.save.log, target, this.content);
    this.save.seenTick = Math.max(this.save.seenTick, this.state.tick);
    return events;
  }

  private append(order: Order): void {
    this.seq = order.seq;
    this.save.log.push(order);
  }

  /** Valida una intención y, si vale, la sella con el tick actual y la añade al registro. */
  submit(intent: OrderIntent, now: number = Date.now()): Reject | null {
    this.sync(now);
    const reason = validate(this.state, intent, this.content);
    if (reason !== null) return reason;
    this.append({
      seq: this.seq + 1,
      tick: this.state.tick,
      actor: intent.actor,
      kind: intent.kind,
      args: intent.args,
    });
    return null;
  }

  /** Motivo por el que una intención no vale ahora, o null. */
  check(intent: OrderIntent): Reject | null {
    return validate(this.state, intent, this.content);
  }

  /** Presupuesto de una intención en el tick actual (null si no vale). */
  quote(intent: OrderIntent): Quote | null {
    return quote(this.state, intent, this.content);
  }

  view(): PublicState {
    return view(this.state, this.actor);
  }

  hash(): { tick: Tick; hash: string } {
    return { tick: this.state.tick, hash: hashState(this.state) };
  }

  /** Lo que se exporta para que un probador mande su partida. */
  exportData(now: number, client: ExportData['client']): ExportData {
    const { tick, hash } = this.hash();
    return {
      ...structuredClone(this.save),
      exportedAt: now,
      check: { tick, hash, contentHash: this.content.hash, rules: RULES_VERSION },
      client,
    };
  }
}
