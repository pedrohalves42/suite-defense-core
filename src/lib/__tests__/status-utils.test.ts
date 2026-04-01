import { describe, it, expect } from 'vitest';
import {
  getStatusMapping,
  getStatusBadgeVariant,
  getStatusLabel,
  getStatusColor,
} from '../status-utils';

describe('status-utils', () => {
  describe('getStatusMapping()', () => {
    it('returns fallback for null/undefined', () => {
      expect(getStatusMapping(null).label).toBe('Desconhecido');
      expect(getStatusMapping(undefined).label).toBe('Desconhecido');
    });

    it('maps known statuses', () => {
      expect(getStatusMapping('completed').label).toBe('Concluído');
      expect(getStatusMapping('failed').category).toBe('error');
      expect(getStatusMapping('pending').category).toBe('warning');
      expect(getStatusMapping('online').category).toBe('success');
    });

    it('normalizes case and whitespace', () => {
      expect(getStatusMapping('COMPLETED').label).toBe('Concluído');
      expect(getStatusMapping('  Failed  ').category).toBe('error');
    });

    it('normalizes spaces to underscores', () => {
      expect(getStatusMapping('in progress').label).toBe('Em Progresso');
    });

    it('returns raw status as label for unknown values', () => {
      expect(getStatusMapping('custom_status').label).toBe('custom_status');
      expect(getStatusMapping('custom_status').category).toBe('neutral');
    });
  });

  describe('getStatusBadgeVariant()', () => {
    it('returns correct variants', () => {
      expect(getStatusBadgeVariant('completed')).toBe('healthy');
      expect(getStatusBadgeVariant('failed')).toBe('critical');
      expect(getStatusBadgeVariant('pending')).toBe('attention');
      expect(getStatusBadgeVariant(null)).toBe('neutral');
    });
  });

  describe('getStatusLabel()', () => {
    it('returns translated labels', () => {
      expect(getStatusLabel('running')).toBe('Executando');
      expect(getStatusLabel('cancelled')).toBe('Cancelado');
    });
  });

  describe('getStatusColor()', () => {
    it('returns semantic color classes', () => {
      expect(getStatusColor('completed')).toContain('text-success');
      expect(getStatusColor('failed')).toContain('text-destructive');
      expect(getStatusColor(null)).toContain('text-muted-foreground');
    });
  });
});
