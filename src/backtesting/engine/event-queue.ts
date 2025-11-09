/**
 * Priority-based event queue for event-driven backtesting
 * Ensures events are processed in correct chronological and priority order
 */

import type { BacktestEvent } from "../types/backtest-types.js";

/**
 * Event queue using a priority queue implementation
 * Events are ordered first by timestamp, then by priority
 */
export class EventQueue {
  private queue: BacktestEvent[] = [];

  /**
   * Add an event to the queue
   * @param event The event to add
   */
  push(event: BacktestEvent): void {
    this.queue.push(event);
    // Maintain sorted order: by timestamp first, then by priority
    this.queue.sort((a, b) => {
      const timeDiff = a.timestamp.getTime() - b.timestamp.getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.priority - b.priority;
    });
  }

  /**
   * Remove and return the next event from the queue
   * @returns The next event, or undefined if queue is empty
   */
  pop(): BacktestEvent | undefined {
    return this.queue.shift();
  }

  /**
   * Peek at the next event without removing it
   * @returns The next event, or undefined if queue is empty
   */
  peek(): BacktestEvent | undefined {
    return this.queue[0];
  }

  /**
   * Check if the queue is empty
   * @returns True if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get the current queue size
   * @returns Number of events in the queue
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Clear all events from the queue
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Get all events matching a specific type
   * @param type Event type to filter by
   * @returns Array of matching events
   */
  getEventsByType(type: BacktestEvent["type"]): BacktestEvent[] {
    return this.queue.filter((event) => event.type === type);
  }

  /**
   * Get all events up to a specific timestamp
   * @param timestamp Cutoff timestamp
   * @returns Array of events up to the timestamp
   */
  getEventsUntil(timestamp: Date): BacktestEvent[] {
    return this.queue.filter((event) => event.timestamp <= timestamp);
  }

  /**
   * Remove all events of a specific type
   * @param type Event type to remove
   * @returns Number of events removed
   */
  removeEventsByType(type: BacktestEvent["type"]): number {
    const originalLength = this.queue.length;
    this.queue = this.queue.filter((event) => event.type !== type);
    return originalLength - this.queue.length;
  }
}
