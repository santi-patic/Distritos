/**
 * Partida local: la escena corre en el navegador con el mismo sim que correrá en el servidor.
 *
 * El reloj de pared vive aquí, fuera del sim: el tick objetivo es floor((ahora − ancla) /
 * tickMs) y `advance` lleva el estado hasta él aplicando las órdenes del registro. Una
 * intención se valida contra el estado actual y, si vale, entra en el registro sellada con
 * el tick actual: es el árbitro local de F1; en F2 el árbitro será el servidor.
 */

import {
  advance,
  createScene,
  hashState,
  validate,
  view,
  type ActorId,
  type CompiledContent,
  type Event,
  type Order,
  type OrderIntent,
  type PublicState,
  type Reject,
  type SceneParams,
  type SimState,
} from '@distritos/sim';

export interface Clock {
  /** Tick entero ya ejecutado o por ejecutar (= state.tick tras sincronizar). */
  tick: number;
  /** Fracción del tick en curso, 0..1, para interpolar el dibujo. */
  fraction: number;
}

export class LocalGame {
  readonly state: SimState;
  readonly log: Order[] = [];
  private seq = 0;
  private readonly anchorMs: number;

  constructor(
    readonly content: CompiledContent,
    params: SceneParams,
    readonly actor: ActorId,
    now: number = performance.now(),
  ) {
    this.state = createScene(params, content);
    this.anchorMs = now;
  }

  clock(now: number = performance.now()): Clock {
    const wall = (now - this.anchorMs) / this.state.scene.tickMs;
    const tick = Math.floor(wall);
    return { tick, fraction: wall - tick };
  }

  /** Lleva el estado hasta el tick del reloj de pared. Devuelve los eventos producidos. */
  sync(now: number = performance.now()): Event[] {
    const { tick } = this.clock(now);
    if (tick <= this.state.tick) return [];
    return advance(this.state, this.log, tick, this.content);
  }

  /** Valida una intención y, si vale, la sella con el tick actual y la añade al registro. */
  submit(intent: OrderIntent): Reject | null {
    this.sync();
    const reason = validate(this.state, intent, this.content);
    if (reason !== null) return reason;
    this.seq += 1;
    this.log.push({
      seq: this.seq,
      tick: this.state.tick,
      actor: intent.actor,
      kind: intent.kind,
      args: intent.args,
    });
    return null;
  }

  view(): PublicState {
    return view(this.state, this.actor);
  }

  hash(): string {
    return hashState(this.state);
  }
}
