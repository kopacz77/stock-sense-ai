/**
 * Rate Limiter for API Calls
 * Handles rate limiting for different API providers
 */

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerDay: number;
  name: string;
}

export class RateLimiter {
  private requestTimestamps: number[] = [];
  private dailyCount = 0;
  private lastResetDate = new Date().toDateString();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  async waitForAvailability(): Promise<void> {
    // Check daily limit
    this.resetDailyCountIfNeeded();

    if (this.dailyCount >= this.config.requestsPerDay) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const waitTime = tomorrow.getTime() - Date.now();

      throw new Error(
        `Daily rate limit (${this.config.requestsPerDay}) reached for ${this.config.name}. ` +
        `Resets in ${Math.ceil(waitTime / 1000 / 60)} minutes.`
      );
    }

    // Clean old timestamps (older than 1 minute)
    const oneMinuteAgo = Date.now() - 60 * 1000;
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => timestamp > oneMinuteAgo
    );

    // Check minute limit
    if (this.requestTimestamps.length >= this.config.requestsPerMinute) {
      const oldestTimestamp = this.requestTimestamps[0] ?? Date.now();
      const waitTime = 60 * 1000 - (Date.now() - oldestTimestamp);

      if (waitTime > 0) {
        await this.sleep(waitTime + 100); // Add 100ms buffer
      }
    }

    // Record this request
    this.requestTimestamps.push(Date.now());
    this.dailyCount++;
  }

  private resetDailyCountIfNeeded(): void {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      this.dailyCount = 0;
      this.lastResetDate = today;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getRemainingRequests(): { perMinute: number; perDay: number } {
    this.resetDailyCountIfNeeded();

    const oneMinuteAgo = Date.now() - 60 * 1000;
    const recentRequests = this.requestTimestamps.filter(
      (timestamp) => timestamp > oneMinuteAgo
    ).length;

    return {
      perMinute: this.config.requestsPerMinute - recentRequests,
      perDay: this.config.requestsPerDay - this.dailyCount,
    };
  }

  reset(): void {
    this.requestTimestamps = [];
    this.dailyCount = 0;
    this.lastResetDate = new Date().toDateString();
  }
}
