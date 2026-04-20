import { createLogger } from "./logger.js";
import type { RuntimeInterface } from "./types.js";

export interface TickSchedulerOptions {
  /** Tick interval in milliseconds. Default: 5 minutes. */
  intervalMs?: number;
  /** Whether to emit ticks when no guests are present. Default: false for v0.1. */
  tickWhenEmpty?: boolean;
}

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class TickScheduler {
  private runtime: RuntimeInterface;
  private intervalMs: number;
  private tickWhenEmpty: boolean;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private log = createLogger("TickScheduler");

  constructor(runtime: RuntimeInterface, options?: TickSchedulerOptions) {
    this.runtime = runtime;
    this.intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.tickWhenEmpty = options?.tickWhenEmpty ?? false;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        this.log.error("tick error:", err);
      });
    }, this.intervalMs);

    this.log.info(`started — interval: ${this.intervalMs / 1000}s`);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Fire an immediate tick — used for on-return events. */
  async fireImmediate(): Promise<void> {
    await this.tick();
  }

  private async tick(): Promise<void> {
    if (!this.running) return;

    if (!this.tickWhenEmpty) {
      const hasGuests = Array.from(this.runtime.place.guests.values()).some(
        (g) => g.currentRoom !== null,
      );
      if (!hasGuests) return;
    }

    await this.runtime.emit({
      type: "tick",
      at: new Date(),
    });
  }
}
