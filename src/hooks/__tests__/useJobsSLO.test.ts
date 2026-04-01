import { describe, it, expect } from 'vitest';
import { getBurnRateStatus } from '@/hooks/useJobsSLO';

describe('getBurnRateStatus', () => {
  it('returns critical for burn rate >= 10', () => {
    expect(getBurnRateStatus(10).level).toBe('critical');
    expect(getBurnRateStatus(15).level).toBe('critical');
  });

  it('returns high for burn rate >= 4 and < 10', () => {
    expect(getBurnRateStatus(4).level).toBe('high');
    expect(getBurnRateStatus(9.9).level).toBe('high');
  });

  it('returns warning for burn rate >= 2 and < 4', () => {
    expect(getBurnRateStatus(2).level).toBe('warning');
    expect(getBurnRateStatus(3.9).level).toBe('warning');
  });

  it('returns alert for burn rate >= 1 and < 2', () => {
    expect(getBurnRateStatus(1).level).toBe('alert');
    expect(getBurnRateStatus(1.9).level).toBe('alert');
  });

  it('returns ok for burn rate < 1', () => {
    expect(getBurnRateStatus(0).level).toBe('ok');
    expect(getBurnRateStatus(0.5).level).toBe('ok');
    expect(getBurnRateStatus(0.99).level).toBe('ok');
  });

  it('includes correct labels', () => {
    expect(getBurnRateStatus(10).label).toBe('CRÍTICO');
    expect(getBurnRateStatus(4).label).toBe('ALTO');
    expect(getBurnRateStatus(2).label).toBe('ATENÇÃO');
    expect(getBurnRateStatus(1).label).toBe('ALERTA');
    expect(getBurnRateStatus(0).label).toBe('OK');
  });

  it('includes correct color properties', () => {
    const ok = getBurnRateStatus(0);
    expect(ok.bgColor).toBeTruthy();
    expect(ok.textColor).toBeTruthy();
    expect(ok.color).toBe('green');
  });
});
