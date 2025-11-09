/**
 * Event Queue for Event-Driven Backtesting
 * Ensures chronological ordering and prevents look-ahead bias
 */

import type { Event, EventType } from "../types/backtest-types.js";

export class EventQueue {
  private queue: Event[] = [];
  private processedEvents: Event[] = [];

  /**
   * Add an event to the queue
   * Events are automatically sorted by timestamp and priority
   */
  push(event: Event): void {
    this.queue.push(event);
    this.sortQueue();
  }

  /**
   * Add multiple events to the queue
   */
  pushMany(events: Event[]): void {
    this.queue.push(...events);
    this.sortQueue();
  }

  /**
   * Get the next event from the queue
   * Returns null if queue is empty
   */
  pop(): Event | null {
    const event = this.queue.shift();
    if (event) {
      this.processedEvents.push(event);
    }
    return event ?? null;
  }

  /**
   * Peek at the next event without removing it
   */
  peek(): Event | null {
    return this.queue[0] ?? null;
  }

  /**
   * Get all events of a specific type
   */
  getEventsByType(type: EventType): Event[] {
    return this.queue.filter((e) => e.type === type);
  }

  /**
   * Get the current size of the queue
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Clear all events from the queue
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Get all processed events (for debugging/analysis)
   */
  getProcessedEvents(): Event[] {
    return [...this.processedEvents];
  }

  /**
   * Sort queue by timestamp (ascending) and priority (ascending)
   * Lower priority number = higher priority
   * This ensures:
   * 1. Events are processed in chronological order
   * 2. Within the same timestamp, higher priority events are processed first
   * 3. NO LOOK-AHEAD BIAS: Future events cannot be processed before past events
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // First, sort by timestamp
      const timeDiff = a.timestamp.getTime() - b.timestamp.getTime();
      if (timeDiff !== 0) return timeDiff;

      // If timestamps are equal, sort by priority
      return a.priority - b.priority;
    });
  }

  /**
   * Validate that all events are in chronological order
   * This is a critical check to ensure no look-ahead bias
   * @throws Error if events are out of order
   */
  validateChronologicalOrder(): void {
    for (let i = 1; i < this.queue.length; i++) {
      const prev = this.queue[i - 1];
      const curr = this.queue[i];

      if (prev && curr && prev.timestamp.getTime() > curr.timestamp.getTime()) {
        throw new Error(
          `Event queue violated chronological order: ` +
            `Event at index ${i - 1} (${prev.timestamp.toISOString()}) ` +
            `is after event at index ${i} (${curr.timestamp.toISOString()})`
        );
      }
    }
  }

  /**
   * Get statistics about the event queue
   */
  getStats(): {
    totalEvents: number;
    processedEvents: number;
    pendingEvents: number;
    eventsByType: Record<string, number>;
  } {
    const eventsByType: Record<string, number> = {};

    for (const event of this.queue) {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
    }

    return {
      totalEvents: this.processedEvents.length + this.queue.length,
      processedEvents: this.processedEvents.length,
      pendingEvents: this.queue.length,
      eventsByType,
    };
  }
}
