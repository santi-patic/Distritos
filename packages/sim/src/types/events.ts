/**
 * Eventos: consecuencias observables de un paso. No forman parte del registro; se recalculan
 * en cada repetición. Esquema del paquete sim, §9.
 */

import type { HexKey } from '../hex.js';
import type { ActorId, ElementId, Int, MobileId, ResourceId, Tick } from './ids.js';
import type { Reject } from './orders.js';
import type { Job } from './state.js';

export type Event =
  | { tick: Tick; kind: 'rejected'; seq: Int; reason: Reject }
  | { tick: Tick; kind: 'trip_started'; mobile: MobileId; arriveTick: Tick }
  | { tick: Tick; kind: 'arrived'; mobile: MobileId; element: ElementId | null }
  | { tick: Tick; kind: 'job_started'; mobile: MobileId; job: Job }
  | { tick: Tick; kind: 'job_done'; mobile: MobileId; job: Job }
  | { tick: Tick; kind: 'sector_revealed'; hex: HexKey; by: ActorId; found: ElementId[] }
  | { tick: Tick; kind: 'stock'; actor: ActorId; resource: ResourceId; delta: Int; reason: string }
  | { tick: Tick; kind: 'skipped'; ticks: Int }
  | { tick: Tick; kind: 'content_changed'; hash: string };
// F5: plot_called, plot_custody, plot_joined, plot_left, access_changed, share_changed
