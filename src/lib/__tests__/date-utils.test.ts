import { describe, it, expect } from 'vitest';
import {
  format,
  formatDistanceToNow,
  toBrasiliaTime,
  formatBrazilDateTime,
  formatBrazil,
  formatBrazilTime,
  formatBrazilShortDate,
  formatRelativeTime,
  formatDuration,
  BRASILIA_TIMEZONE,
  TIMEZONE_INDICATOR,
} from '../date-utils';

describe('date-utils', () => {
  const fixedDate = '2025-06-15T12:00:00Z';

  describe('format()', () => {
    it('formats a valid ISO string', () => {
      const result = format(fixedDate, 'dd/MM/yyyy');
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('formats a Date object', () => {
      const result = format(new Date(fixedDate), 'HH:mm');
      expect(result).toMatch(/\d{2}:\d{2}/);
    });

    it('formats a timestamp number', () => {
      const result = format(Date.parse(fixedDate), 'yyyy');
      expect(result).toBe('2025');
    });

    it('returns "-" for invalid date string', () => {
      expect(format('not-a-date', 'dd/MM/yyyy')).toBe('-');
    });

    it('returns "-" for NaN timestamp', () => {
      expect(format(NaN, 'dd/MM/yyyy')).toBe('-');
    });
  });

  describe('formatDistanceToNow()', () => {
    it('returns a relative string for a recent date', () => {
      const recent = new Date(Date.now() - 60000).toISOString();
      const result = formatDistanceToNow(recent, { addSuffix: true });
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns "-" for invalid date', () => {
      expect(formatDistanceToNow('invalid')).toBe('-');
    });
  });

  describe('toBrasiliaTime()', () => {
    it('converts a valid date string', () => {
      const result = toBrasiliaTime(fixedDate);
      expect(result).toBeInstanceOf(Date);
    });

    it('returns null for null/undefined', () => {
      expect(toBrasiliaTime(null)).toBeNull();
      expect(toBrasiliaTime(undefined)).toBeNull();
    });

    it('returns null for invalid date', () => {
      expect(toBrasiliaTime('not-valid')).toBeNull();
    });
  });

  describe('formatBrazilDateTime()', () => {
    it('returns "-" for null/undefined', () => {
      expect(formatBrazilDateTime(null)).toBe('-');
      expect(formatBrazilDateTime(undefined)).toBe('-');
    });

    it('returns "-" for invalid date', () => {
      expect(formatBrazilDateTime('garbage')).toBe('-');
    });

    it('formats with "full" type', () => {
      const result = formatBrazilDateTime(fixedDate, 'full');
      expect(result).toMatch(/\d/);
    });

    it('formats with "date" type', () => {
      const result = formatBrazilDateTime(fixedDate, 'date');
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('formats with "time" type', () => {
      const result = formatBrazilDateTime(fixedDate, 'time');
      expect(result).toMatch(/\d{2}:\d{2}/);
    });

    it('formats with "short" type', () => {
      const result = formatBrazilDateTime(fixedDate, 'short');
      expect(result).toMatch(/\d/);
    });

    it('formats with "datetime" type (default)', () => {
      const result = formatBrazilDateTime(fixedDate);
      expect(result).toMatch(/\d/);
    });

    it('formats with "filename" type', () => {
      const result = formatBrazilDateTime(fixedDate, 'filename');
      expect(result).toMatch(/\d/);
    });

    it('formats with "day-month" type', () => {
      const result = formatBrazilDateTime(fixedDate, 'day-month');
      expect(result).toMatch(/\d{2}\/\d{2}/);
    });

    it('accepts Date object', () => {
      const result = formatBrazilDateTime(new Date(fixedDate), 'date');
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });
  });

  describe('formatBrazil()', () => {
    it('formats with custom format string', () => {
      const result = formatBrazil(fixedDate, 'dd/MM/yyyy HH:mm');
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
    });

    it('returns "-" for null', () => {
      expect(formatBrazil(null, 'dd/MM')).toBe('-');
    });

    it('returns "-" for invalid date', () => {
      expect(formatBrazil('bad', 'dd/MM')).toBe('-');
    });
  });

  describe('formatBrazilTime()', () => {
    it('formats time as HH:mm', () => {
      const result = formatBrazilTime(fixedDate);
      expect(result).toMatch(/\d{2}:\d{2}/);
    });

    it('returns "-" for null', () => {
      expect(formatBrazilTime(null)).toBe('-');
    });
  });

  describe('formatBrazilShortDate()', () => {
    it('formats as dd/MM', () => {
      const result = formatBrazilShortDate(fixedDate);
      expect(result).toMatch(/\d{2}\/\d{2}/);
    });
  });

  describe('formatRelativeTime()', () => {
    it('returns "-" for null/undefined', () => {
      expect(formatRelativeTime(null)).toBe('-');
      expect(formatRelativeTime(undefined)).toBe('-');
    });

    it('returns "-" for invalid date', () => {
      expect(formatRelativeTime('bad')).toBe('-');
    });

    it('returns "agora" for very recent dates', () => {
      const now = new Date().toISOString();
      expect(formatRelativeTime(now)).toBe('agora');
    });

    it('returns minutes ago', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(formatRelativeTime(fiveMinAgo)).toMatch(/há \d+ min/);
    });

    it('returns hours ago', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(threeHoursAgo)).toMatch(/há \d+h/);
    });

    it('returns "ontem" for 1 day ago', () => {
      const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(yesterday)).toBe('ontem');
    });

    it('returns days ago for 2-6 days', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(threeDaysAgo)).toMatch(/há \d+ dias/);
    });
  });

  describe('formatDuration()', () => {
    it('formats seconds', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-01T00:00:30Z');
      expect(formatDuration(start, end)).toBe('30s');
    });

    it('formats minutes', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-01T00:05:00Z');
      expect(formatDuration(start, end)).toBe('5min');
    });

    it('formats hours with remaining minutes', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-01T02:30:00Z');
      expect(formatDuration(start, end)).toBe('2h 30min');
    });

    it('formats exact hours without minutes', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-01T03:00:00Z');
      expect(formatDuration(start, end)).toBe('3h');
    });

    it('formats 1 day', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-02T00:00:00Z');
      expect(formatDuration(start, end)).toBe('1 dia');
    });

    it('formats multiple days', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-04T00:00:00Z');
      expect(formatDuration(start, end)).toBe('3 dias');
    });
  });

  describe('constants', () => {
    it('exports BRASILIA_TIMEZONE', () => {
      expect(BRASILIA_TIMEZONE).toBe('America/Sao_Paulo');
    });

    it('exports TIMEZONE_INDICATOR', () => {
      expect(TIMEZONE_INDICATOR).toBe('(UTC-3)');
    });
  });
});
