import type { PresenceEvent } from "./types.js";
import type { PipelineState, System, SystemContext } from "./systems/types.js";
import { createLogger } from "./logger.js";

export type TimePhase = "dawn" | "day" | "dusk" | "night";

export interface TimeState {
  /** Current in-world hour (0-23). */
  inWorldHour: number;
  /** Current phase. */
  phase: TimePhase;
  /** Real ms per in-world hour. Default: 600000 (10 min). */
  realMsPerInWorldHour: number;
  /** Total elapsed real ms since simulation start. */
  elapsedRealMs: number;
  /** In-world day count (starts at 1). */
  day: number;
  /** Real ms timestamp of simulation start. */
  startedAt: number;
}

export interface TimeSystemOptions {
  /** Real milliseconds per in-world hour. Default: 600000 (10 minutes). */
  realMsPerInWorldHour?: number;
  /** Starting in-world hour (0-23). Default: 6 (dawn). */
  startHour?: number;
}

const PHASE_RANGES: Array<{ phase: TimePhase; start: number; end: number }> = [
  { phase: "dawn", start: 5, end: 8 },
  { phase: "day", start: 8, end: 18 },
  { phase: "dusk", start: 18, end: 21 },
  { phase: "night", start: 21, end: 5 },
];

function getPhaseForHour(hour: number): TimePhase {
  for (const range of PHASE_RANGES) {
    if (range.start <= range.end) {
      if (hour >= range.start && hour < range.end) return range.phase;
    } else {
      // Wraps around midnight (night: 21-5)
      if (hour >= range.start || hour < range.end) return range.phase;
    }
  }
  return "day";
}

/**
 * Time system — tracks in-world time and emits phase change events.
 *
 * Advances time based on real elapsed time since simulation start.
 * When the phase transitions (dawn→day→dusk→night), emits a
 * `time.phaseChanged` event into the pipeline.
 *
 * Insert at the START of the pipeline (before StatePropagation).
 */
export class TimeSystem implements System {
  readonly name = "Time";
  private state: TimeState;
  private log = createLogger("Time");
  private pendingPhaseEvent: PresenceEvent | null = null;

  constructor(options?: TimeSystemOptions) {
    const realMsPerHour = options?.realMsPerInWorldHour ?? 600000;
    const startHour = options?.startHour ?? 6;
    const phase = getPhaseForHour(startHour);

    this.state = {
      inWorldHour: startHour,
      phase,
      realMsPerInWorldHour: realMsPerHour,
      elapsedRealMs: 0,
      day: 1,
      startedAt: Date.now(),
    };

    this.log.info(`initialized — ${phase}, hour ${startHour}, ${realMsPerHour / 1000}s per in-world hour`);
  }

  /** Get the current time state (read-only snapshot). */
  get time(): Readonly<TimeState> {
    return this.state;
  }

  async run(pipeline: PipelineState, _ctx: SystemContext): Promise<PipelineState> {
    // Update time based on real elapsed time
    const now = Date.now();
    this.state.elapsedRealMs = now - this.state.startedAt;

    const totalInWorldHours = this.state.elapsedRealMs / this.state.realMsPerInWorldHour;
    const startHour = 6; // We started at hour 6
    const currentHour = Math.floor((startHour + totalInWorldHours) % 24);
    const currentDay = Math.floor((startHour + totalInWorldHours) / 24) + 1;

    const prevPhase = this.state.phase;
    const newPhase = getPhaseForHour(currentHour);

    this.state.inWorldHour = currentHour;
    this.state.day = currentDay;

    // Emit phase change event if phase transitioned
    if (newPhase !== prevPhase) {
      this.state.phase = newPhase;
      this.log.info(`phase change: ${prevPhase} → ${newPhase} (hour ${currentHour}, day ${currentDay})`);

      // Inject the phase change event into the pipeline
      // The event will be processed by subsequent systems
      this.pendingPhaseEvent = {
        type: "time.phaseChanged",
        from: prevPhase,
        to: newPhase,
        inWorldHour: currentHour,
        day: currentDay,
        at: new Date(),
      };
    }

    return pipeline;
  }

  /** Check if there's a pending phase change event that needs to be emitted separately. */
  consumePendingPhaseEvent(): PresenceEvent | null {
    const event = this.pendingPhaseEvent;
    this.pendingPhaseEvent = null;
    return event;
  }
}

export { getPhaseForHour };
