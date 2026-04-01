import { describe, it, expect } from 'vitest';
import { FileIntegrityCheck, IntegrityStatus, ScanType, FileIntegritySeverity } from '@/domain/entities/FileIntegrityCheck';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';

const agentId = AgentId.create('agent-1').value;
const tenantId = TenantId.create('tenant-1').value;

describe('FileIntegrityCheck', () => {
  describe('create()', () => {
    it('creates with matching hashes as VALID', () => {
      const result = FileIntegrityCheck.create({
        agentId, tenantId,
        filePath: '/etc/hosts',
        expectedHash: 'abc123',
        actualHash: 'abc123',
        scanType: ScanType.CRITICAL_FILES,
      });
      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe(IntegrityStatus.VALID);
      expect(result.value.severity).toBe(FileIntegritySeverity.INFO);
      expect(result.value.isViolation).toBe(false);
    });

    it('creates with mismatched hashes as MODIFIED', () => {
      const result = FileIntegrityCheck.create({
        agentId, tenantId,
        filePath: '/etc/hosts',
        expectedHash: 'abc123',
        actualHash: 'xyz789',
        scanType: ScanType.CRITICAL_FILES,
      });
      expect(result.value.status).toBe(IntegrityStatus.MODIFIED);
      expect(result.value.severity).toBe(FileIntegritySeverity.CRITICAL);
      expect(result.value.isViolation).toBe(true);
    });

    it('creates with null expectedHash as UNKNOWN', () => {
      const result = FileIntegrityCheck.create({
        agentId, tenantId,
        filePath: '/etc/hosts',
        expectedHash: null,
        actualHash: 'abc123',
        scanType: ScanType.SYSTEM_BINS,
      });
      expect(result.value.status).toBe(IntegrityStatus.UNKNOWN);
      expect(result.value.isViolation).toBe(false);
    });

    it('severity varies by scan type', () => {
      const createModified = (scanType: ScanType) => FileIntegrityCheck.create({
        agentId, tenantId, filePath: '/f', expectedHash: 'a', actualHash: 'b', scanType,
      }).value.severity;

      expect(createModified(ScanType.CRITICAL_FILES)).toBe(FileIntegritySeverity.CRITICAL);
      expect(createModified(ScanType.SYSTEM_BINS)).toBe(FileIntegritySeverity.HIGH);
      expect(createModified(ScanType.LOGS)).toBe(FileIntegritySeverity.MEDIUM);
    });

    it('fails without filePath', () => {
      expect(FileIntegrityCheck.create({
        agentId, tenantId, filePath: '', expectedHash: 'a', actualHash: 'b', scanType: ScanType.LOGS,
      }).isFailure).toBe(true);
    });

    it('fails without actualHash', () => {
      expect(FileIntegrityCheck.create({
        agentId, tenantId, filePath: '/f', expectedHash: 'a', actualHash: '', scanType: ScanType.LOGS,
      }).isFailure).toBe(true);
    });
  });
});
