import { describe, it, expect } from 'vitest';
import { t, menu, section, sentence, getStatusMessage, UI_DICTIONARY, MENU_LABELS, STATUS_MESSAGES, UI_SENTENCES } from '../ui-language';

describe('ui-language', () => {
  describe('t()', () => {
    it('translates technical terms', () => {
      expect(t('agent')).toBe('computador');
      expect(t('heartbeat')).toBe('sinal de vida');
      expect(t('tenant')).toBe('empresa');
    });
  });

  describe('menu()', () => {
    it('returns menu labels', () => {
      expect(menu('dashboard')).toBe('Painel Principal');
      expect(menu('settings')).toBe('Configurações');
    });
  });

  describe('section()', () => {
    it('returns section labels', () => {
      expect(section('security')).toBe('Segurança');
      expect(section('compliance')).toBe('Conformidade');
    });
  });

  describe('sentence()', () => {
    it('returns complete sentences', () => {
      expect(sentence('computerOk')).toBe('Este computador está protegido.');
      expect(sentence('actionApplied')).toBe('Ação aplicada com sucesso.');
    });
  });

  describe('getStatusMessage', () => {
    it('returns allGood for high score and no alerts', () => {
      const msg = getStatusMessage(90, 0);
      expect(msg).toBe(STATUS_MESSAGES.allGood);
    });

    it('returns attention for moderate score', () => {
      const msg = getStatusMessage(70, 1);
      expect(msg).toBe(STATUS_MESSAGES.attention);
    });

    it('returns urgent for low score with many alerts', () => {
      const msg = getStatusMessage(40, 5);
      expect(msg).toBe(STATUS_MESSAGES.urgent);
    });
  });

  it('dictionaries are comprehensive', () => {
    expect(Object.keys(UI_DICTIONARY).length).toBeGreaterThan(30);
    expect(Object.keys(MENU_LABELS).length).toBeGreaterThan(20);
    expect(Object.keys(UI_SENTENCES).length).toBeGreaterThan(20);
  });
});
