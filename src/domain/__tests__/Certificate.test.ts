import { describe, it, expect } from 'vitest';
import { Certificate, CertStore } from '@/domain/entities/Certificate';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';

const agentId = AgentId.create('00000000-0000-0000-0000-000000000002').value;
const tenantId = TenantId.create('00000000-0000-0000-0000-000000000001').value;

describe('Certificate', () => {
  const validInput = () => ({
    agentId,
    tenantId,
    certStore: CertStore.ROOT,
    subject: 'CN=example.com',
    thumbprint: 'AABBCCDD',
    issuer: 'CN=Root CA',
  });

  describe('create()', () => {
    it('creates successfully', () => {
      const result = Certificate.create(validInput());
      expect(result.isSuccess).toBe(true);
      expect(result.value.subject).toBe('CN=example.com');
      expect(result.value.isSelfSigned).toBe(false);
      expect(result.value.keyUsage).toEqual([]);
    });

    it('fails without subject', () => {
      expect(Certificate.create({ ...validInput(), subject: '' }).isFailure).toBe(true);
    });

    it('fails without thumbprint', () => {
      expect(Certificate.create({ ...validInput(), thumbprint: '' }).isFailure).toBe(true);
    });
  });

  describe('expiry', () => {
    it('isExpired returns false when no validUntil', () => {
      const cert = Certificate.create(validInput()).value;
      expect(cert.isExpired).toBe(false);
    });

    it('isExpired returns true for past date', () => {
      const cert = Certificate.create({
        ...validInput(),
        validUntil: new Date('2020-01-01'),
      }).value;
      expect(cert.isExpired).toBe(true);
    });

    it('isExpired returns false for future date', () => {
      const cert = Certificate.create({
        ...validInput(),
        validUntil: new Date('2030-01-01'),
      }).value;
      expect(cert.isExpired).toBe(false);
    });

    it('daysUntilExpiry returns Infinity when no validUntil', () => {
      const cert = Certificate.create(validInput()).value;
      expect(cert.daysUntilExpiry).toBe(Infinity);
    });

    it('daysUntilExpiry returns 0 for expired cert', () => {
      const cert = Certificate.create({
        ...validInput(),
        validUntil: new Date('2020-01-01'),
      }).value;
      expect(cert.daysUntilExpiry).toBe(0);
    });

    it('isExpiringSoon returns true for cert expiring in 15 days', () => {
      const cert = Certificate.create({
        ...validInput(),
        validUntil: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      }).value;
      expect(cert.isExpiringSoon).toBe(true);
    });

    it('isExpiringSoon returns false for cert expiring in 60 days', () => {
      const cert = Certificate.create({
        ...validInput(),
        validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      }).value;
      expect(cert.isExpiringSoon).toBe(false);
    });
  });
});
