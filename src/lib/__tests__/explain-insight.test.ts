import { describe, it, expect } from 'vitest';
import { explainInsight, explainDecisionForAudit, explainEffectiveness } from '../explain-insight';

describe('explain-insight', () => {
  describe('explainInsight', () => {
    it('generates explanation for auto-executed insight', () => {
      const result = explainInsight({
        insight_type: 'antivirus_disabled',
        title: 'AV disabled',
        severity: 'high',
        auto_action_executed: true,
      });
      expect(result.execution_mode).toBe('auto');
      expect(result.human_title).toBeTruthy();
      expect(result.why_it_matters).toContain('automaticamente');
    });

    it('generates explanation for suggested insight', () => {
      const result = explainInsight({
        insight_type: 'anomaly_detection',
        title: 'Anomaly',
        severity: 'medium',
      });
      expect(result.execution_mode).toBe('suggest');
      expect(result.why_it_matters).toContain('atenção');
    });

    it('uses custom mapping when provided', () => {
      const result = explainInsight(
        { insight_type: 'custom', title: 'Custom', severity: 'low' },
        { mode: 'auto', handler: 'test', risk: 'critical', human_label: 'Custom Label' }
      );
      expect(result.human_title).toBe('Custom Label');
    });
  });

  describe('explainDecisionForAudit', () => {
    it('generates audit text', () => {
      const text = explainDecisionForAudit(
        { insight_type: 'antivirus_disabled', title: 'AV Off', severity: 'high' },
        'system'
      );
      expect(text).toContain('REGISTRO DE DECISÃO');
      expect(text).toContain('system');
      expect(text).toContain('antivirus_disabled');
    });
  });

  describe('explainEffectiveness', () => {
    it('returns resolved explanation', () => {
      const result = explainEffectiveness('resolved', 'antivirus_disabled', { product: 'Defender' });
      expect(result.badge_label).toBe('Resolvido');
      expect(result.badge_variant).toBe('success');
      expect(result.human_text).toContain('eficaz');
    });

    it('returns failed explanation', () => {
      const result = explainEffectiveness('failed', 'unknown');
      expect(result.badge_label).toBe('Não resolvido');
      expect(result.badge_variant).toBe('destructive');
    });

    it('returns pending explanation', () => {
      const result = explainEffectiveness('pending', 'any');
      expect(result.badge_label).toBe('Verificando');
    });

    it('returns partial explanation', () => {
      const result = explainEffectiveness('partial', 'any', null, 'custom reason');
      expect(result.badge_label).toBe('Parcial');
      expect(result.detailed_reason).toBe('custom reason');
    });

    it('includes CVE in vulnerability resolution', () => {
      const result = explainEffectiveness('resolved', 'vulnerability_critical', { cve_id: 'CVE-2024-001' });
      expect(result.human_text).toContain('CVE-2024-001');
    });
  });
});
