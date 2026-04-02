import { describe, it, expect } from 'vitest';
import { getEducationalMoment, hasEducationalContent, EDUCATIONAL_MOMENTS } from '../education-mapping';

describe('education-mapping', () => {
  describe('getEducationalMoment', () => {
    it('returns content for known type', () => {
      const moment = getEducationalMoment('antivirus_disabled');
      expect(moment.title).toBe('Antivírus desativado');
      expect(moment.why_it_matters).toBeTruthy();
    });

    it('returns fallback for unknown type', () => {
      const moment = getEducationalMoment('nonexistent');
      expect(moment.title).toBe('Evento de segurança detectado');
    });
  });

  describe('hasEducationalContent', () => {
    it('returns true for known types', () => {
      expect(hasEducationalContent('antivirus_disabled')).toBe(true);
      expect(hasEducationalContent('vulnerability_critical')).toBe(true);
    });

    it('returns false for unknown types', () => {
      expect(hasEducationalContent('nonexistent')).toBe(false);
    });
  });

  it('has comprehensive coverage', () => {
    expect(Object.keys(EDUCATIONAL_MOMENTS).length).toBeGreaterThan(10);
  });
});
