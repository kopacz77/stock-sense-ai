/**
 * Market Hours Validation Utility
 *
 * Provides functions to check if US stock markets are open
 * and validate trading times for risk management.
 */

// US Market holidays for 2024-2026 (NYSE/NASDAQ)
// These should be updated annually
const MARKET_HOLIDAYS: Set<string> = new Set([
  // 2024
  "2024-01-01", // New Year's Day
  "2024-01-15", // MLK Day
  "2024-02-19", // Presidents Day
  "2024-03-29", // Good Friday
  "2024-05-27", // Memorial Day
  "2024-06-19", // Juneteenth
  "2024-07-04", // Independence Day
  "2024-09-02", // Labor Day
  "2024-11-28", // Thanksgiving
  "2024-12-25", // Christmas
  // 2025
  "2025-01-01", // New Year's Day
  "2025-01-20", // MLK Day
  "2025-02-17", // Presidents Day
  "2025-04-18", // Good Friday
  "2025-05-26", // Memorial Day
  "2025-06-19", // Juneteenth
  "2025-07-04", // Independence Day
  "2025-09-01", // Labor Day
  "2025-11-27", // Thanksgiving
  "2025-12-25", // Christmas
  // 2026
  "2026-01-01", // New Year's Day
  "2026-01-19", // MLK Day
  "2026-02-16", // Presidents Day
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
]);

// Early close days (1:00 PM ET close)
const EARLY_CLOSE_DAYS: Set<string> = new Set([
  // 2024
  "2024-07-03", // Day before Independence Day
  "2024-11-29", // Day after Thanksgiving
  "2024-12-24", // Christmas Eve
  // 2025
  "2025-07-03", // Day before Independence Day
  "2025-11-28", // Day after Thanksgiving
  "2025-12-24", // Christmas Eve
  // 2026
  "2026-11-27", // Day after Thanksgiving
  "2026-12-24", // Christmas Eve
]);

export interface MarketHoursResult {
  isOpen: boolean;
  reason?: string;
  nextOpen?: Date;
  currentTime: Date;
  marketTimeET: string;
}

export interface MarketSession {
  preMarket: { start: number; end: number }; // 4:00 AM - 9:30 AM ET
  regular: { start: number; end: number }; // 9:30 AM - 4:00 PM ET
  afterHours: { start: number; end: number }; // 4:00 PM - 8:00 PM ET
}

const MARKET_SESSIONS: MarketSession = {
  preMarket: { start: 4 * 60, end: 9 * 60 + 30 }, // 4:00 AM - 9:30 AM
  regular: { start: 9 * 60 + 30, end: 16 * 60 }, // 9:30 AM - 4:00 PM
  afterHours: { start: 16 * 60, end: 20 * 60 }, // 4:00 PM - 8:00 PM
};

/**
 * Convert a date to Eastern Time
 */
function toEasternTime(date: Date): Date {
  // Create a formatter for Eastern Time
  const etFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = etFormatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "0";

  return new Date(
    Number.parseInt(getPart("year"), 10),
    Number.parseInt(getPart("month"), 10) - 1,
    Number.parseInt(getPart("day"), 10),
    Number.parseInt(getPart("hour"), 10),
    Number.parseInt(getPart("minute"), 10),
    Number.parseInt(getPart("second"), 10)
  );
}

/**
 * Get the date string in YYYY-MM-DD format for a given date in ET
 */
function getDateStringET(date: Date): string {
  const etDate = toEasternTime(date);
  const year = etDate.getFullYear();
  const month = String(etDate.getMonth() + 1).padStart(2, "0");
  const day = String(etDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Check if US stock markets are currently open for regular trading
 */
export function isMarketOpen(date: Date = new Date()): MarketHoursResult {
  const etDate = toEasternTime(date);
  const dateString = getDateStringET(date);

  const hours = etDate.getHours();
  const minutes = etDate.getMinutes();
  const currentMinutes = hours * 60 + minutes;
  const dayOfWeek = etDate.getDay(); // 0 = Sunday, 6 = Saturday

  const marketTimeET = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ET`;

  // Check weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      isOpen: false,
      reason: "Market closed - Weekend",
      currentTime: date,
      marketTimeET,
      nextOpen: getNextMarketOpen(date),
    };
  }

  // Check holidays
  if (MARKET_HOLIDAYS.has(dateString)) {
    return {
      isOpen: false,
      reason: "Market closed - Holiday",
      currentTime: date,
      marketTimeET,
      nextOpen: getNextMarketOpen(date),
    };
  }

  // Check early close days
  const closeTime = EARLY_CLOSE_DAYS.has(dateString)
    ? 13 * 60 // 1:00 PM ET
    : MARKET_SESSIONS.regular.end; // 4:00 PM ET

  // Check if within regular trading hours
  if (currentMinutes >= MARKET_SESSIONS.regular.start && currentMinutes < closeTime) {
    return {
      isOpen: true,
      currentTime: date,
      marketTimeET,
    };
  }

  // Market is closed - determine reason
  let reason: string;
  if (currentMinutes < MARKET_SESSIONS.regular.start) {
    reason = "Market closed - Before regular hours (opens 9:30 AM ET)";
  } else {
    reason = EARLY_CLOSE_DAYS.has(dateString)
      ? "Market closed - Early close day (closed at 1:00 PM ET)"
      : "Market closed - After hours (closed at 4:00 PM ET)";
  }

  return {
    isOpen: false,
    reason,
    currentTime: date,
    marketTimeET,
    nextOpen: getNextMarketOpen(date),
  };
}

/**
 * Check if currently in extended hours trading (pre-market or after-hours)
 */
export function isExtendedHours(date: Date = new Date()): {
  isExtended: boolean;
  session: "pre-market" | "after-hours" | "regular" | "closed";
} {
  const etDate = toEasternTime(date);
  const dateString = getDateStringET(date);
  const dayOfWeek = etDate.getDay();

  const hours = etDate.getHours();
  const minutes = etDate.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  // Weekend or holiday
  if (dayOfWeek === 0 || dayOfWeek === 6 || MARKET_HOLIDAYS.has(dateString)) {
    return { isExtended: false, session: "closed" };
  }

  // Check early close adjustment
  const closeTime = EARLY_CLOSE_DAYS.has(dateString) ? 13 * 60 : MARKET_SESSIONS.regular.end;

  if (currentMinutes >= MARKET_SESSIONS.preMarket.start && currentMinutes < MARKET_SESSIONS.regular.start) {
    return { isExtended: true, session: "pre-market" };
  }

  if (currentMinutes >= MARKET_SESSIONS.regular.start && currentMinutes < closeTime) {
    return { isExtended: false, session: "regular" };
  }

  if (currentMinutes >= closeTime && currentMinutes < MARKET_SESSIONS.afterHours.end) {
    return { isExtended: true, session: "after-hours" };
  }

  return { isExtended: false, session: "closed" };
}

/**
 * Get the next market open time
 */
export function getNextMarketOpen(fromDate: Date = new Date()): Date {
  const etDate = toEasternTime(fromDate);
  let nextDate = new Date(etDate);

  // If we're before market open today and it's a trading day, return today's open
  const currentMinutes = etDate.getHours() * 60 + etDate.getMinutes();
  const dateString = getDateStringET(fromDate);

  if (
    currentMinutes < MARKET_SESSIONS.regular.start &&
    etDate.getDay() !== 0 &&
    etDate.getDay() !== 6 &&
    !MARKET_HOLIDAYS.has(dateString)
  ) {
    nextDate.setHours(9, 30, 0, 0);
    return nextDate;
  }

  // Otherwise, find the next trading day
  nextDate.setDate(nextDate.getDate() + 1);
  nextDate.setHours(9, 30, 0, 0);

  // Skip weekends and holidays
  let attempts = 0;
  while (attempts < 10) {
    const checkDateString = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;
    const dayOfWeek = nextDate.getDay();

    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !MARKET_HOLIDAYS.has(checkDateString)) {
      return nextDate;
    }

    nextDate.setDate(nextDate.getDate() + 1);
    attempts++;
  }

  return nextDate;
}

/**
 * Validate if a trade should be allowed based on market hours
 * Returns validation result with warnings for extended hours trading
 */
export function validateTradeTime(
  date: Date = new Date(),
  allowExtendedHours = false
): {
  allowed: boolean;
  warnings: string[];
  marketStatus: MarketHoursResult;
} {
  const marketStatus = isMarketOpen(date);
  const extendedStatus = isExtendedHours(date);
  const warnings: string[] = [];

  // Regular hours - always allowed
  if (marketStatus.isOpen) {
    return { allowed: true, warnings: [], marketStatus };
  }

  // Extended hours - allowed with warning if enabled
  if (allowExtendedHours && extendedStatus.isExtended) {
    warnings.push(
      `⚠️ Trading in ${extendedStatus.session}: Reduced liquidity and wider spreads expected`
    );
    return { allowed: true, warnings, marketStatus };
  }

  // Market closed
  warnings.push(`🚫 ${marketStatus.reason}`);
  if (marketStatus.nextOpen) {
    warnings.push(`Next market open: ${marketStatus.nextOpen.toLocaleString("en-US", { timeZone: "America/New_York" })} ET`);
  }

  return { allowed: false, warnings, marketStatus };
}
