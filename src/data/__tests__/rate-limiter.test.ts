/**
 * Rate Limiter Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../rate-limiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      requestsPerMinute: 5,
      requestsPerDay: 100,
      name: 'Test API',
    });
  });

  it('should allow requests within limits', async () => {
    // Should not throw
    await limiter.waitForAvailability();
    await limiter.waitForAvailability();
    await limiter.waitForAvailability();
  });

  it('should track remaining requests', async () => {
    await limiter.waitForAvailability();
    await limiter.waitForAvailability();

    const remaining = limiter.getRemainingRequests();
    expect(remaining.perMinute).toBe(3);
    expect(remaining.perDay).toBe(98);
  });

  it('should throw when daily limit exceeded', async () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 100,
      requestsPerDay: 2,
      name: 'Test API',
    });

    await limiter.waitForAvailability();
    await limiter.waitForAvailability();

    await expect(limiter.waitForAvailability()).rejects.toThrow('Daily rate limit');
  });

  it('should reset daily count', () => {
    limiter.reset();
    const remaining = limiter.getRemainingRequests();
    expect(remaining.perDay).toBe(100);
  });
});
