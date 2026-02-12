import { describe, it, expect } from 'vitest';
import { AgentId } from '../value-objects/AgentId';
import { AgentVersion } from '../value-objects/AgentVersion';
import { UpdateChecksum } from '../value-objects/UpdateChecksum';
import { TenantId } from '../value-objects/TenantId';
import { UpdatePackageId } from '../value-objects/UpdatePackageId';

describe('AgentId', () => {
  it('creates from valid UUID', () => {
    const result = AgentId.create('550e8400-e29b-41d4-a716-446655440000');
    expect(result.isSuccess).toBe(true);
    expect(result.value.value).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('lowercases UUID', () => {
    const result = AgentId.create('550E8400-E29B-41D4-A716-446655440000');
    expect(result.value.value).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejects invalid UUID', () => {
    expect(AgentId.create('not-a-uuid').isFailure).toBe(true);
    expect(AgentId.create('').isFailure).toBe(true);
  });

  it('generates unique IDs', () => {
    const a = AgentId.generate();
    const b = AgentId.generate();
    expect(a.equals(b)).toBe(false);
  });

  it('equals by value', () => {
    const a = AgentId.create('550e8400-e29b-41d4-a716-446655440000').value;
    const b = AgentId.create('550e8400-e29b-41d4-a716-446655440000').value;
    expect(a.equals(b)).toBe(true);
  });
});

describe('AgentVersion', () => {
  it('parses semver', () => {
    const v = AgentVersion.create('5.0.3').value;
    expect(v.normalized).toBe('5.0.3');
  });

  it('handles v prefix', () => {
    const v = AgentVersion.create('v5.0.3').value;
    expect(v.normalized).toBe('5.0.3');
  });

  it('preserves suffix in full', () => {
    const v = AgentVersion.create('5.0.3-hotfix').value;
    expect(v.normalized).toBe('5.0.3');
    expect(v.full).toBe('5.0.3-hotfix');
  });

  it('compares versions correctly', () => {
    const v5 = AgentVersion.create('5.0.3').value;
    const v4 = AgentVersion.create('4.1.0').value;
    expect(v5.isNewerThan(v4)).toBe(true);
    expect(v4.isOlderThan(v5)).toBe(true);
    expect(v5.compareTo(v5)).toBe(0);
  });

  it('compares minor versions', () => {
    const a = AgentVersion.create('5.1.0').value;
    const b = AgentVersion.create('5.0.9').value;
    expect(a.isNewerThan(b)).toBe(true);
  });

  it('rejects invalid format', () => {
    expect(AgentVersion.create('').isFailure).toBe(true);
    expect(AgentVersion.create('abc').isFailure).toBe(true);
  });

  it('zero version', () => {
    const z = AgentVersion.zero();
    expect(z.normalized).toBe('0.0.0');
    expect(z.isOlderThan(AgentVersion.create('1.0.0').value)).toBe(true);
  });
});

describe('UpdateChecksum', () => {
  const validSha = 'a'.repeat(64);

  it('creates from valid SHA-256', () => {
    const result = UpdateChecksum.create(validSha);
    expect(result.isSuccess).toBe(true);
  });

  it('rejects invalid checksums', () => {
    expect(UpdateChecksum.create('short').isFailure).toBe(true);
    expect(UpdateChecksum.create('g'.repeat(64)).isFailure).toBe(true);
  });

  it('matches equal checksums', () => {
    const a = UpdateChecksum.create(validSha).value;
    const b = UpdateChecksum.create(validSha).value;
    expect(a.matches(b)).toBe(true);
  });

  it('does not match different checksums', () => {
    const a = UpdateChecksum.create('a'.repeat(64)).value;
    const b = UpdateChecksum.create('b'.repeat(64)).value;
    expect(a.matches(b)).toBe(false);
  });
});

describe('TenantId', () => {
  it('creates from valid UUID', () => {
    expect(TenantId.create('550e8400-e29b-41d4-a716-446655440000').isSuccess).toBe(true);
  });
  it('rejects invalid', () => {
    expect(TenantId.create('bad').isFailure).toBe(true);
  });
});

describe('UpdatePackageId', () => {
  it('creates and generates', () => {
    const gen = UpdatePackageId.generate();
    expect(gen.value).toBeTruthy();
    const created = UpdatePackageId.create(gen.value);
    expect(created.isSuccess).toBe(true);
  });
  it('rejects invalid', () => {
    expect(UpdatePackageId.create('nope').isFailure).toBe(true);
  });
});
