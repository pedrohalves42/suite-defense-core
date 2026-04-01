import { describe, it, expect } from 'vitest';
import { getWindowsVersion, getOsDisplayName, getOsIcon } from '../os-utils';

describe('os-utils', () => {
  describe('getWindowsVersion()', () => {
    it('maps known Windows 11 build', () => {
      expect(getWindowsVersion('10.0.22631')).toBe('Windows 11 23H2');
    });

    it('maps known Windows 10 build', () => {
      expect(getWindowsVersion('10.0.19045')).toBe('Windows 10 22H2');
    });

    it('maps Windows Server 2022', () => {
      expect(getWindowsVersion('10.0.20348')).toBe('Windows Server 2022');
    });

    it('detects unknown Windows 11 build by range', () => {
      expect(getWindowsVersion('10.0.23000')).toMatch(/Windows 11/);
    });

    it('detects unknown Windows 10 build by range', () => {
      expect(getWindowsVersion('10.0.15000')).toMatch(/Windows 10/);
    });

    it('detects Windows 7/Server 2008 R2 by major.minor', () => {
      expect(getWindowsVersion('6.1.9999')).toMatch(/Windows 7/);
    });

    it('returns original for unknown format', () => {
      expect(getWindowsVersion('unknown')).toBe('unknown');
    });

    it('handles extra version parts', () => {
      const result = getWindowsVersion('10.0.22631.1234');
      expect(result).toBe('Windows 11 23H2');
    });
  });

  describe('getOsDisplayName()', () => {
    it('returns "Desconhecido" for null osType', () => {
      expect(getOsDisplayName(null, null)).toBe('Desconhecido');
    });

    it('returns Windows with version mapping', () => {
      expect(getOsDisplayName('Windows', '10.0.22631')).toBe('Windows 11 23H2');
    });

    it('returns "Windows" without version', () => {
      expect(getOsDisplayName('Windows', null)).toBe('Windows');
    });

    it('returns Linux version as-is', () => {
      expect(getOsDisplayName('Linux', 'Ubuntu 22.04')).toBe('Ubuntu 22.04');
    });

    it('returns "Linux" without version', () => {
      expect(getOsDisplayName('Linux', null)).toBe('Linux');
    });

    it('maps macOS versions', () => {
      expect(getOsDisplayName('macOS', '14.1')).toContain('Sonoma');
    });

    it('returns macOS with unknown version', () => {
      expect(getOsDisplayName('macOS', '99.0')).toBe('macOS 99.0');
    });

    it('handles darwin as macOS', () => {
      expect(getOsDisplayName('darwin', '13.0')).toContain('Ventura');
    });

    it('returns osVersion for unknown OS type', () => {
      expect(getOsDisplayName('FreeBSD', '13.2')).toBe('13.2');
    });
  });

  describe('getOsIcon()', () => {
    it('returns Windows icon', () => {
      expect(getOsIcon('Windows')).toBe('\uD83E\uDE9F');
    });

    it('returns Linux icon', () => {
      expect(getOsIcon('Linux')).toBe('\uD83D\uDC27');
    });

    it('returns macOS icon', () => {
      expect(getOsIcon('macOS')).toBe('\uD83C\uDF4E');
    });

    it('returns default for null', () => {
      expect(getOsIcon(null)).toBe('\uD83D\uDCBB');
    });

    it('returns default for unknown', () => {
      expect(getOsIcon('FreeBSD')).toBe('\uD83D\uDCBB');
    });
  });
});
