export type Unsubscribe = () => void;

/**
 * Minimal typed event emitter. Handlers are invoked in subscription order and
 * may be removed via the returned unsubscribe function.
 */
export class Emitter<TEvent> {
  private readonly handlers = new Set<(event: TEvent) => void>();

  on(handler: (event: TEvent) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emit(event: TEvent): void {
    for (const handler of Array.from(this.handlers)) {
      handler(event);
    }
  }

  clear(): void {
    this.handlers.clear();
  }

  get size(): number {
    return this.handlers.size;
  }
}
