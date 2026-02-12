import { describe, it, expect } from 'vitest';
import { UpdatePackage } from '../entities/UpdatePackage';
import { AgentVersion } from '../value-objects/AgentVersion';
import { UpdateChecksum } from '../value-objects/UpdateChecksum';
import { UpdatePackageId } from '../value-objects/UpdatePackageId';
import { Platform, UpdateChannel } from '../constants';

const VALID_CHECKSUM = 'a'.repeat(64);
const SCRIPT = 'x'.repeat(1001);

function makePackage(overrides: Partial<any> = {}) {
  return UpdatePackage.reconstitute({
    id: UpdatePackageId.generate(),
    version: AgentVersion.create('5.0.3').value,
    platform: Platform.WINDOWS,
    channel: UpdateChannel.STABLE,
    checksum: UpdateChecksum.create(VALID_CHECKSUM).value,
    scriptContent: SCRIPT,
    size: 5000,
    releaseNotes: 'Fix bugs',
    isActive: true,
    signatureBase64: null,
    signedAt: null,
    signedBy: null,
    minVersion: null,
    maxVersion: null,
    createdAt: new Date(),
    ...overrides,
  });
}

describe('UpdatePackage Entity', () => {
  describe('create', () => {
    it('rejects script shorter than 1000 chars', () => {
      expect(() =>
        UpdatePackage.create({
          id: UpdatePackageId.generate(),
          version: AgentVersion.create('1.0.0').value,
          platform: Platform.WINDOWS,
          channel: UpdateChannel.STABLE,
          checksum: UpdateChecksum.create(VALID_CHECKSUM).value,
          scriptContent: 'short',
          size: 5,
          releaseNotes: '',
          isActive: true,
          createdAt: new Date(),
        })
      ).toThrow();
    });
  });

  describe('isCompatibleWith', () => {
    it('returns true when no version constraints', () => {
      const pkg = makePackage();
      expect(pkg.isCompatibleWith(AgentVersion.create('1.0.0').value)).toBe(true);
    });

    it('returns false when below minVersion', () => {
      const pkg = makePackage({ minVersion: AgentVersion.create('3.0.0').value });
      expect(pkg.isCompatibleWith(AgentVersion.create('2.0.0').value)).toBe(false);
    });

    it('returns false when above maxVersion', () => {
      const pkg = makePackage({ maxVersion: AgentVersion.create('4.0.0').value });
      expect(pkg.isCompatibleWith(AgentVersion.create('5.0.0').value)).toBe(false);
    });

    it('returns true when within range', () => {
      const pkg = makePackage({
        minVersion: AgentVersion.create('2.0.0').value,
        maxVersion: AgentVersion.create('6.0.0').value,
      });
      expect(pkg.isCompatibleWith(AgentVersion.create('4.0.0').value)).toBe(true);
    });
  });

  describe('isUpgradeFor', () => {
    it('returns true when package version is newer', () => {
      const pkg = makePackage({ version: AgentVersion.create('5.0.3').value });
      expect(pkg.isUpgradeFor(AgentVersion.create('4.0.0').value)).toBe(true);
    });

    it('returns false when same version', () => {
      const pkg = makePackage({ version: AgentVersion.create('5.0.3').value });
      expect(pkg.isUpgradeFor(AgentVersion.create('5.0.3').value)).toBe(false);
    });
  });

  describe('isHotfixFor', () => {
    it('returns true when same version but different checksum', () => {
      const pkg = makePackage({
        version: AgentVersion.create('5.0.3').value,
        checksum: UpdateChecksum.create('a'.repeat(64)).value,
      });
      expect(pkg.isHotfixFor(
        AgentVersion.create('5.0.3').value,
        UpdateChecksum.create('b'.repeat(64)).value
      )).toBe(true);
    });

    it('returns false when same checksum', () => {
      const checksum = UpdateChecksum.create(VALID_CHECKSUM).value;
      const pkg = makePackage({ version: AgentVersion.create('5.0.3').value, checksum });
      expect(pkg.isHotfixFor(AgentVersion.create('5.0.3').value, checksum)).toBe(false);
    });
  });

  describe('activation', () => {
    it('deactivate/activate toggles isActive', () => {
      const pkg = makePackage({ isActive: true });
      expect(pkg.isActive).toBe(true);
      pkg.deactivate();
      expect(pkg.isActive).toBe(false);
      pkg.activate();
      expect(pkg.isActive).toBe(true);
    });
  });
});
