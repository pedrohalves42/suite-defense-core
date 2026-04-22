/**
 * Pure helper: builds an ISO date range ending now.
 * Extracted to keep the hook free of date arithmetic and easy to unit-test.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PeriodRange {
  period_start: string;
  period_end: string;
}

export function buildPeriodRange(days = 30, now: Date = new Date()): PeriodRange {
  return {
    period_end: now.toISOString(),
    period_start: new Date(now.getTime() - days * DAY_MS).toISOString(),
  };
}
