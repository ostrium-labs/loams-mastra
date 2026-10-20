import type { Context } from '@resonatehq/sdk/async';

/** The engine primitives a step can read from `engine` in its execute function. */
export type ResonateEngineType = {
  /** The Resonate context of the current durable operation. */
  ctx: Context;
  /** The id of the run's root durable promise. */
  rootId: string;
};

/** Options for `init`. */
export interface ResonateEngineConfig {
  /** Deadline of a run's durable promises, in milliseconds. */
  timeout?: number;
  /** The worker group passes are dispatched to; the Resonate client's group. */
  group?: string;
}
