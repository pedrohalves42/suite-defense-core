import { describe, it, expect } from 'vitest';
import { generateExportCertificate, computeStateDiff, type ExportResult } from '../audit-integrity';

describe('audit-integrity', () => {
  describe('generateExportCertificate', () => {
    it('generates valid certificate for valid chain', () => {
      const result: ExportResult = {
        logs: [],
        chain_valid: true,
        export_hash: 'abc123',
        export_timestamp: new Date().toISOString(),
        total_records: 5,
      };
      const cert = generateExportCertificate(result);
      expect(cert).toContain('CERTIFICADO DE EXPORTAÇÃO');
      expect(cert).toContain('VÁLIDA');
      expect(cert).toContain('abc123');
      expect(cert).toContain('5');
    });

    it('marks compromised chain', () => {
      const result: ExportResult = {
        logs: [],
        chain_valid: false,
        export_hash: 'xyz',
        export_timestamp: new Date().toISOString(),
        total_records: 3,
      };
      const cert = generateExportCertificate(result);
      expect(cert).toContain('COMPROMETIDA');
      expect(cert).toContain('ATENÇÃO');
    });
  });

  describe('computeStateDiff', () => {
    it('detects changes between states', () => {
      const before = { name: 'A', status: 'active' };
      const after = { name: 'A', status: 'inactive' };
      const diff = computeStateDiff(before, after);
      
      const statusDiff = diff.find(d => d.key === 'status');
      expect(statusDiff?.changed).toBe(true);
      expect(statusDiff?.before).toBe('active');
      expect(statusDiff?.after).toBe('inactive');

      const nameDiff = diff.find(d => d.key === 'name');
      expect(nameDiff?.changed).toBe(false);
    });

    it('handles null before', () => {
      const diff = computeStateDiff(null, { key: 'val' });
      expect(diff).toHaveLength(1);
      expect(diff[0].changed).toBe(true);
    });

    it('handles null after', () => {
      const diff = computeStateDiff({ key: 'val' }, null);
      expect(diff).toHaveLength(1);
      expect(diff[0].changed).toBe(true);
    });

    it('handles both null', () => {
      expect(computeStateDiff(null, null)).toEqual([]);
    });

    it('sorts changed items first', () => {
      const diff = computeStateDiff({ a: 1, b: 2 }, { a: 1, b: 3 });
      expect(diff[0].key).toBe('b');
      expect(diff[0].changed).toBe(true);
    });
  });
});
