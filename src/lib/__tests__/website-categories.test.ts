import { describe, it, expect } from 'vitest';
import { getCategoryForDomain, getCategoryByKey, WEBSITE_CATEGORIES } from '../website-categories';

describe('website-categories', () => {
  describe('getCategoryForDomain', () => {
    it('categorizes social media', () => {
      expect(getCategoryForDomain('facebook.com').key).toBe('social');
      expect(getCategoryForDomain('instagram.com').key).toBe('social');
    });

    it('categorizes video sites', () => {
      expect(getCategoryForDomain('youtube.com').key).toBe('video');
      expect(getCategoryForDomain('netflix.com').key).toBe('video');
    });

    it('categorizes Brazilian banks', () => {
      expect(getCategoryForDomain('itau.com.br').key).toBe('banking');
      expect(getCategoryForDomain('nubank.com.br').key).toBe('banking');
    });

    it('categorizes government by TLD', () => {
      expect(getCategoryForDomain('any.gov.br').key).toBe('government');
      expect(getCategoryForDomain('exercito.mil.br').key).toBe('government');
    });

    it('handles subdomains', () => {
      expect(getCategoryForDomain('web.whatsapp.com').key).toBe('communication');
      expect(getCategoryForDomain('mail.google.com').key).toBe('email');
    });

    it('returns "other" for unknown domains', () => {
      expect(getCategoryForDomain('random-unknown-site.xyz').key).toBe('other');
    });

    it('is case insensitive', () => {
      expect(getCategoryForDomain('FACEBOOK.COM').key).toBe('social');
    });

    it('categorizes gambling sites', () => {
      expect(getCategoryForDomain('bet365.com').key).toBe('gambling');
    });

    it('categorizes adult sites', () => {
      expect(getCategoryForDomain('pornhub.com').key).toBe('adult');
    });
  });

  describe('getCategoryByKey', () => {
    it('returns category for valid key', () => {
      const cat = getCategoryByKey('social');
      expect(cat).toBeDefined();
      expect(cat!.name).toBe('Redes Sociais');
    });

    it('returns undefined for invalid key', () => {
      expect(getCategoryByKey('nonexistent')).toBeUndefined();
    });
  });

  it('has all expected categories', () => {
    const keys = WEBSITE_CATEGORIES.map(c => c.key);
    expect(keys).toContain('social');
    expect(keys).toContain('banking');
    expect(keys).toContain('government');
    expect(keys).toContain('gambling');
    expect(keys).toContain('adult');
    expect(keys).toContain('other');
  });
});
