import { describe, it, expect } from 'vitest';
import { AgentId } from '../AgentId';
import { TenantId } from '../TenantId';
import { AgentVersion } from '../AgentVersion';
import { HmacSecret } from '../HmacSecret';
import { JobId } from '../JobId';
import { UpdateChecksum } from '../UpdateChecksum';

describe('Value Objects', () => {
  describe('AgentId', () => {
    it('creates from valid UUID', () => {
      const id = crypto.randomUUID();
      const result = AgentId.create(id);
      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(id.toLowerCase());
    });

    it('rejects invalid UUID', () => {
      expect(AgentId.create('not-a-uuid').isFailure).toBe(true);
      expect(AgentId.create('').isFailure).toBe(true);
    });

    it('generates unique IDs', () => {
      const a = AgentId.generate();
      const b = AgentId.generate();
      expect(a.value).not.toBe(b.value);
    });

    it('equality by value', () => {
      const id = crypto.randomUUID();
      const a = AgentId.create(id).value;
      const b = AgentId.create(id).value;
      expect(a.equals(b)).toBe(true);
    });
  });

  describe('TenantId', () => {
    it('creates from valid UUID', () => {
      const result = TenantId.create(crypto.randomUUID());
      expect(result.isSuccess).toBe(true);
    });

    it('rejects invalid UUID', () => {
      expect(TenantId.create('bad').isFailure).toBe(true);
    });
  });

  describe('JobId', () => {
    it('generates and creates', () => {
      const j = JobId.generate();
      const result = JobId.create(j.value);
      expect(result.isSuccess).toBe(true);
      expect(result.value.equals(j)).toBe(true);
    });
  });

  describe('AgentVersion', () => {
    it('parses semver string', () => {
      const v = AgentVersion.create('5.0.3').value;
      expect(v.value).toBe('5.0.3');
      expect(v.normalized).toBe('5.0.3');
    });

    it('strips v prefix', () => {
      const v = AgentVersion.create('v5.0.3').value;
      expect(v.normalized).toBe('5.0.3');
    });

    it('handles suffix', () => {
      const v = AgentVersion.create('5.0.3-hotfix').value;
      expect(v.normalized).toBe('5.0.3');
      expect(v.full).toBe('5.0.3-hotfix');
    });

    it('compares versions correctly', () => {
      const v1 = AgentVersion.create('4.0.10').value;
      const v2 = AgentVersion.create('5.0.3').value;
      expect(v1.isOlderThan(v2)).toBe(true);
      expect(v2.isNewerThan(v1)).toBe(true);
    });

    it('zero version', () => {
      const z = AgentVersion.zero();
      expect(z.value).toBe('0.0.0');
    });

    it('rejects invalid format', () => {
      expect(AgentVersion.create('abc').isFailure).toBe(true);
      expect(AgentVersion.create('').isFailure).toBe(true);
    });
  });

  describe('HmacSecret', () => {
    it('creates from 64-char hex', () => {
      const hex = 'a'.repeat(64);
      const result = HmacSecret.create(hex);
      expect(result.isSuccess).toBe(true);
    });

    it('rejects short hex', () => {
      expect(HmacSecret.create('abc').isFailure).toBe(true);
    });

    it('rejects non-hex chars', () => {
      expect(HmacSecret.create('g'.repeat(64)).isFailure).toBe(true);
    });

    it('generates valid secret', () => {
      const secret = HmacSecret.generate();
      expect(secret.value).toHaveLength(64);
      expect(HmacSecret.create(secret.value).isSuccess).toBe(true);
    });
  });
});
