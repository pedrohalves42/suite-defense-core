import { describe, it, expect } from 'vitest';
import { UpdatePackage } from '../entities/UpdatePackage';
import { AgentUpdate } from '../entities/AgentUpdate';
import { AgentVersion } from '../value-objects/AgentVersion';
import { UpdateChecksum } from '../value-objects/UpdateChecksum';
import { UpdatePackageId } from '../value-objects/UpdatePackageId';
import { AgentId } from '../value-objects/AgentId';
import { Platform, UpdateChannel, UpdateStatus } from '../constants';

const validScript = 'x'.repeat(1001);
const sha = 'a'.repeat(64);

function makePackageProps(overrides: Partial<any> = {}) {
  return {
    id: UpdatePackageId.generate(),
    version: AgentVersion.create('5.0.3').value,
    platform: Platform.WINDOWS,
    channel: UpdateChannel.STABLE,
    checksum: UpdateChecksum.create(sha).value,
    scriptContent: validScript,
    size: validScript.length,
    releaseNotes: 'test',
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('UpdatePackage', () => {
  it('creates with valid props', () => {
    const pkg = UpdatePackage.create(makePackageProps());
    expect(pkg.isActive).toBe(true);
    expect(pkg.version.normalized).toBe('5.0.3');
  });

  it('rejects short script content', () => {
    expect(() => UpdatePackage.create(makePackageProps({ scriptContent: 'short' }))).toThrow();
  });

  it('detects upgrade', () => {
    const pkg = UpdatePackage.create(makePackageProps());
    const older = AgentVersion.create('4.0.0').value;
    expect(pkg.isUpgradeFor(older)).toBe(true);
    expect(pkg.isUpgradeFor(AgentVersion.create('6.0.0').value)).toBe(false);
  });

  it('detects hotfix', () => {
    const pkg = UpdatePackage.create(makePackageProps());
    const sameVer = AgentVersion.create('5.0.3').value;
    const diffChecksum = UpdateChecksum.create('b'.repeat(64)).value;
    expect(pkg.isHotfixFor(sameVer, diffChecksum)).toBe(true);
    expect(pkg.isHotfixFor(sameVer, UpdateChecksum.create(sha).value)).toBe(false);
  });

  it('checks compatibility with min/max version', () => {
    const pkg = UpdatePackage.create(makePackageProps({
      minVersion: AgentVersion.create('4.0.0').value,
      maxVersion: AgentVersion.create('6.0.0').value,
    }));
    expect(pkg.isCompatibleWith(AgentVersion.create('5.0.0').value)).toBe(true);
    expect(pkg.isCompatibleWith(AgentVersion.create('3.0.0').value)).toBe(false);
    expect(pkg.isCompatibleWith(AgentVersion.create('7.0.0').value)).toBe(false);
  });

  it('activates and deactivates', () => {
    const pkg = UpdatePackage.create(makePackageProps());
    pkg.deactivate();
    expect(pkg.isActive).toBe(false);
    pkg.activate();
    expect(pkg.isActive).toBe(true);
  });

  it('reconstitutes without validation', () => {
    const pkg = UpdatePackage.reconstitute(makePackageProps({ scriptContent: 'short' }));
    expect(pkg.scriptContent).toBe('short');
  });
});

describe('AgentUpdate', () => {
  const agentId = AgentId.generate();
  const pkgId = UpdatePackageId.generate();

  it('creates with PENDING status', () => {
    const update = AgentUpdate.create(agentId, pkgId);
    expect(update.status).toBe(UpdateStatus.PENDING);
  });

  it('follows valid state transitions', () => {
    const update = AgentUpdate.create(agentId, pkgId);
    update.startDownload();
    expect(update.status).toBe(UpdateStatus.DOWNLOADING);
    update.completeDownload();
    update.startApply();
    expect(update.status).toBe(UpdateStatus.APPLYING);
    update.complete();
    expect(update.status).toBe(UpdateStatus.COMPLETED);
    expect(update.isTerminal()).toBe(true);
  });

  it('allows rollback from COMPLETED', () => {
    const update = AgentUpdate.create(agentId, pkgId);
    update.startDownload();
    update.completeDownload();
    update.startApply();
    update.complete();
    update.rollback('bad version');
    expect(update.status).toBe(UpdateStatus.ROLLED_BACK);
    expect(update.rollbackReason).toBe('bad version');
  });

  it('rejects invalid transitions', () => {
    const update = AgentUpdate.create(agentId, pkgId);
    expect(() => update.complete()).toThrow(); // PENDING -> COMPLETED invalid
    expect(() => update.startApply()).toThrow(); // PENDING -> APPLYING invalid
  });

  it('allows fail from any non-terminal state', () => {
    const update = AgentUpdate.create(agentId, pkgId);
    update.fail('network error');
    expect(update.status).toBe(UpdateStatus.FAILED);
    expect(update.errorMessage).toBe('network error');
    expect(update.isTerminal()).toBe(true);
  });

  it('cannot transition from FAILED', () => {
    const update = AgentUpdate.create(agentId, pkgId);
    update.fail('err');
    expect(() => update.startDownload()).toThrow();
  });
});
