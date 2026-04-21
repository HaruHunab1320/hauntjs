import type { ChatRequest, ChatResponse, ModelProvider } from "@hauntjs/resident";

interface QueuedCall {
  request: ChatRequest;
  priority: number;
  provider: ModelProvider;
  resolve: (response: ChatResponse) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
}

export interface ModelQueueOptions {
  /** Maximum concurrent model calls. Default: 3. */
  maxConcurrent?: number;
  /** Minimum delay between calls in ms. Default: 300. */
  minDelayMs?: number;
  /** Maximum time a request can wait in queue before being dropped. Default: 15000. */
  staleLimitMs?: number;
}

/**
 * A shared queue that throttles model calls across multiple agents.
 * Prevents rate limiting and ensures fair scheduling with priority.
 *
 * Priority: 0 = highest (resident), 1 = responding to speech, 2 = autonomous
 */
export class ModelCallQueue {
  private queue: QueuedCall[] = [];
  private activeCount = 0;
  private maxConcurrent: number;
  private minDelayMs: number;
  private staleLimitMs: number;
  private lastCallAt = 0;
  private processing = false;

  constructor(options?: ModelQueueOptions) {
    this.maxConcurrent = options?.maxConcurrent ?? 3;
    this.minDelayMs = options?.minDelayMs ?? 300;
    this.staleLimitMs = options?.staleLimitMs ?? 15000;
  }

  /**
   * Wraps a ModelProvider with queue-based throttling.
   * All calls through the returned provider go through this queue.
   */
  wrap(provider: ModelProvider, priority = 2): ModelProvider {
    return {
      name: `${provider.name}[queued:${priority}]`,
      chat: (request: ChatRequest): Promise<ChatResponse> => {
        return new Promise((resolve, reject) => {
          this.queue.push({
            request,
            priority,
            provider,
            resolve,
            reject,
            enqueuedAt: Date.now(),
          });
          this.queue.sort((a, b) => a.priority - b.priority);
          this.scheduleProcess();
        });
      },
    };
  }

  private scheduleProcess(): void {
    if (this.processing) return;
    this.processing = true;
    setTimeout(() => {
      this.processing = false;
      this.processNext();
    }, 0);
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= this.maxConcurrent) return;
    if (this.queue.length === 0) return;

    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallAt;
    if (timeSinceLastCall < this.minDelayMs) {
      setTimeout(() => this.processNext(), this.minDelayMs - timeSinceLastCall);
      return;
    }

    // Drop stale requests
    while (this.queue.length > 0 && now - this.queue[0].enqueuedAt > this.staleLimitMs) {
      const stale = this.queue.shift()!;
      stale.reject(new Error("Request dropped: stale"));
    }

    if (this.queue.length === 0) return;

    const call = this.queue.shift()!;
    this.activeCount++;
    this.lastCallAt = Date.now();

    try {
      const response = await call.provider.chat(call.request);
      call.resolve(response);
    } catch (err) {
      call.reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }

  get pending(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.activeCount;
  }
}
