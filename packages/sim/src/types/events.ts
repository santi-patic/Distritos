/**
 * Eventos: consecuencias observables de un paso. No forman parte del registro; se recalculan
 * en cada repetición. Esquema del paquete sim, §9.
 *
 * Los flujos continuos (producción, consumo) no emiten eventos: se leen del estado. Sí los
 * emiten los cambios discretos de un almacén (costes, entregas, lo que deja una tarea).
 */

import type { HexKey } from '../hex.js';
import type { ActorId, ElementId, Int, KindId, LinkId, MobileId, Permille, ResourceId, Tick } from './ids.js';
import type { Reject } from './orders.js';
import type { Job } from './state.js';

export type SwitchReason = 'order' | 'empty' | 'full';

export type Event =
  | { tick: Tick; kind: 'rejected'; seq: Int; reason: Reject }
  | { tick: Tick; kind: 'trip_started'; mobile: MobileId; arriveTick: Tick }
  | { tick: Tick; kind: 'arrived'; mobile: MobileId; element: ElementId | null }
  | { tick: Tick; kind: 'job_started'; mobile: MobileId; job: Job }
  | { tick: Tick; kind: 'job_done'; mobile: MobileId; job: Job }
  | { tick: Tick; kind: 'sector_revealed'; hex: HexKey; by: ActorId; found: ElementId[] }
  | { tick: Tick; kind: 'stock'; actor: ActorId; resource: ResourceId; delta: Int; reason: string }
  | { tick: Tick; kind: 'skipped'; ticks: Int }
  | { tick: Tick; kind: 'content_changed'; hash: string }
  // F1
  | { tick: Tick; kind: 'store'; element: ElementId; resource: ResourceId; delta: Int; reason: string }
  | { tick: Tick; kind: 'built'; element: ElementId; by: ActorId }
  | { tick: Tick; kind: 'linked'; link: LinkId; replaced: LinkId | null }
  | { tick: Tick; kind: 'switched'; element: ElementId; on: boolean; reason: SwitchReason }
  | { tick: Tick; kind: 'hired'; mobile: MobileId }
  | { tick: Tick; kind: 'hungry'; mobile: MobileId }
  | { tick: Tick; kind: 'fed'; mobile: MobileId }
  | { tick: Tick; kind: 'cleaned'; element: ElementId }
  | { tick: Tick; kind: 'cycled'; element: ElementId; wear: Permille }
  | { tick: Tick; kind: 'encargo'; id: Int; encargo: KindId }
  | { tick: Tick; kind: 'errand_made'; errand: Int; at: ElementId; to: ElementId }
  | { tick: Tick; kind: 'errand_picked'; errand: Int; mobile: MobileId }
  | { tick: Tick; kind: 'errand_delivered'; errand: Int; mobile: MobileId; actor: ActorId; pay: Int }
  | { tick: Tick; kind: 'errand_dropped'; errand: Int; at: ElementId }
  | { tick: Tick; kind: 'errand_expired'; errand: Int }
  | { tick: Tick; kind: 'route_cancelled'; mobile: MobileId }
  | { tick: Tick; kind: 'opening'; hex: HexKey; by: ActorId; endTick: Tick }
  | { tick: Tick; kind: 'renamed'; target: string; name: string }
  | {
      tick: Tick;
      kind: 'delivered';
      actor: ActorId;
      encargo: Int;
      resource: ResourceId;
      amount: Int;
      pay: Int;
    };
// F5: plot_called, plot_custody, plot_joined, plot_left, access_changed, share_changed
