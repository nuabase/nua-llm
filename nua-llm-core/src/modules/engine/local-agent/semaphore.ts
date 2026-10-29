/** Runs at most `limit` tasks at once; the rest wait in order. */
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  /** Rejects with the signal's reason, without running `task`, when `signal` aborts while it waits. */
  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    if (this.active >= this.limit) {
      await this.waitForTurn(signal);
    } else {
      this.active++;
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) {
        next();
      } else {
        this.active--;
      }
    }
  }

  /** Resolves once a finishing task hands over its place. */
  private waitForTurn(signal: AbortSignal | undefined): Promise<void> {
    return new Promise((resolve, reject) => {
      const take = () => {
        signal?.removeEventListener("abort", leave);
        resolve();
      };
      const leave = () => {
        this.waiting.splice(this.waiting.indexOf(take), 1);
        reject(signal!.reason);
      };
      this.waiting.push(take);
      signal?.addEventListener("abort", leave, { once: true });
    });
  }
}
