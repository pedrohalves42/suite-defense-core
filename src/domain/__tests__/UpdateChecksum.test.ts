import { describe, it, expect } from 'vitest';
import { UpdateChecksum } from '../value-objects/UpdateChecksum';
import { UpdatePackageId } from '../value-objects/UpdatePackageId';
import { JobExecutionId } from '../value-objects/JobExecutionId';

describe('UpdateChecksum', () => {
  it('creates from valid SHA-256', () => {
    const result = UpdateChecksum.create('a'.repeat(64));
    expect(result.isSuccess).toBe(true);
  });

  it('rejects short string', () => {
    expect(UpdateChecksum.create('abc').isFailure).toBe(true);
  });

  it('rejects non-hex', () => {
    expect(UpdateChecksum.create('z'.repeat(64)).isFailure).toBe(true);
  });

  it('matches identical checksums', () => {
    const a = UpdateChecksum.create('a'.repeat(64)).value;
    const b = UpdateChecksum.create('a'.repeat(64)).value;
    expect(a.matches(b)).toBe(true);
  });

  it('does not match different checksums', () => {
    const a = UpdateChecksum.create('a'.repeat(64)).value;
    const b = UpdateChecksum.create('b'.repeat(64)).value;
    expect(a.matches(b)).toBe(false);
  });
});

describe('UpdatePackageId', () => {
  it('generates and validates', () => {
    const id = UpdatePackageId.generate();
    expect(UpdatePackageId.create(id.value).isSuccess).toBe(true);
  });

  it('rejects invalid', () => {
    expect(UpdatePackageId.create('bad').isFailure).toBe(true);
  });
});

describe('JobExecutionId', () => {
  it('generates and validates', () => {
    const id = JobExecutionId.generate();
    expect(JobExecutionId.create(id.value).isSuccess).toBe(true);
  });
});
