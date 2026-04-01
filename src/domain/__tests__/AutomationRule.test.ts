import { describe, it, expect } from 'vitest';
import { AutomationRule } from '@/domain/entities/AutomationRule';
import { TenantId } from '@/domain/value-objects/TenantId';

const tenantId = TenantId.create('00000000-0000-0000-0000-000000000001').value;

describe('AutomationRule', () => {
  const validArgs = () => ({
    tenantId,
    name: 'High CPU Alert',
    triggerType: 'metric_threshold' as const,
    triggerConditions: { metric: 'cpu', operator: '>' as const, value: 90 },
    actionType: 'send_alert' as const,
    actionConfig: { alertChannel: 'email' },
  });

  describe('create()', () => {
    it('creates successfully with valid args', () => {
      const { tenantId: tid, name, triggerType, triggerConditions, actionType, actionConfig } = validArgs();
      const result = AutomationRule.create(tid, name, triggerType, triggerConditions, actionType, actionConfig);
      expect(result.isSuccess).toBe(true);
      expect(result.value.name).toBe('High CPU Alert');
      expect(result.value.isActive).toBe(true);
      expect(result.value.triggerCount).toBe(0);
    });

    it('fails with short name', () => {
      const { tenantId: tid, triggerType, triggerConditions, actionType, actionConfig } = validArgs();
      const result = AutomationRule.create(tid, 'ab', triggerType, triggerConditions, actionType, actionConfig);
      expect(result.isFailure).toBe(true);
    });

    it('fails with empty name', () => {
      const { tenantId: tid, triggerType, triggerConditions, actionType, actionConfig } = validArgs();
      const result = AutomationRule.create(tid, '', triggerType, triggerConditions, actionType, actionConfig);
      expect(result.isFailure).toBe(true);
    });

    it('fails with priority out of range', () => {
      const { tenantId: tid, name, triggerType, triggerConditions, actionType, actionConfig } = validArgs();
      const result = AutomationRule.create(tid, name, triggerType, triggerConditions, actionType, actionConfig, { priority: 11 });
      expect(result.isFailure).toBe(true);
    });

    it('fails with cooldown < 1', () => {
      const { tenantId: tid, name, triggerType, triggerConditions, actionType, actionConfig } = validArgs();
      const result = AutomationRule.create(tid, name, triggerType, triggerConditions, actionType, actionConfig, { cooldownMinutes: 0 });
      expect(result.isFailure).toBe(true);
    });

    it('uses defaults for optional fields', () => {
      const { tenantId: tid, name, triggerType, triggerConditions, actionType, actionConfig } = validArgs();
      const result = AutomationRule.create(tid, name, triggerType, triggerConditions, actionType, actionConfig);
      expect(result.value.targetScope).toBe('all_agents');
      expect(result.value.priority).toBe(5);
      expect(result.value.cooldownMinutes).toBe(30);
    });
  });

  describe('evaluateMetric()', () => {
    it('triggers when condition met', () => {
      const { tenantId: tid, name, triggerType, triggerConditions, actionType, actionConfig } = validArgs();
      const rule = AutomationRule.create(tid, name, triggerType, triggerConditions, actionType, actionConfig).value;
      expect(rule.evaluateMetric('cpu', 95)).toBe(true);
    });

    it('does not trigger when value below threshold', () => {
      const { tenantId: tid, name, triggerType, triggerConditions, actionType, actionConfig } = validArgs();
      const rule = AutomationRule.create(tid, name, triggerType, triggerConditions, actionType, actionConfig).value;
      expect(rule.evaluateMetric('cpu', 80)).toBe(false);
    });

    it('does not trigger for wrong metric', () => {
      const { tenantId: tid, name, triggerType, triggerConditions, actionType, actionConfig } = validArgs();
      const rule = AutomationRule.create(tid, name, triggerType, triggerConditions, actionType, actionConfig).value;
      expect(rule.evaluateMetric('memory', 95)).toBe(false);
    });

    it('does not trigger when inactive', () => {
      const { tenantId: tid, name, triggerType, triggerConditions, actionType, actionConfig } = validArgs();
      const rule = AutomationRule.create(tid, name, triggerType, triggerConditions, actionType, actionConfig).value;
      rule.deactivate();
      expect(rule.evaluateMetric('cpu', 95)).toBe(false);
    });

    it('does not trigger when in cooldown', () => {
      const { tenantId: tid, name, triggerType, triggerConditions, actionType, actionConfig } = validArgs();
      const rule = AutomationRule.create(tid, name, triggerType, triggerConditions, actionType, actionConfig).value;
      rule.recordTrigger();
      expect(rule.evaluateMetric('cpu', 95)).toBe(false);
    });
  });

  describe('operators', () => {
    it.each([
      ['<', 80, true],
      ['<', 90, false],
      ['>=', 90, true],
      ['<=', 90, true],
      ['==', 90, true],
      ['!=', 90, false],
      ['!=', 80, true],
    ] as const)('evaluates operator %s with value %d = %s', (op, val, expected) => {
      const rule = AutomationRule.create(
        tenantId, 'Test', 'metric_threshold',
        { metric: 'cpu', operator: op, value: 90 },
        'send_alert', {},
      ).value;
      expect(rule.evaluateMetric('cpu', val)).toBe(expected);
    });
  });

  describe('appliesTo()', () => {
    it('all_agents applies to any agent', () => {
      const rule = AutomationRule.create(tenantId, 'Test', 'metric_threshold', {}, 'send_alert', {}).value;
      expect(rule.appliesTo('any-agent')).toBe(true);
    });

    it('specific_agent matches target', () => {
      const rule = AutomationRule.create(tenantId, 'Test', 'metric_threshold', {}, 'send_alert', {}, {
        targetScope: 'specific_agent', targetIds: ['agent-1'],
      }).value;
      expect(rule.appliesTo('agent-1')).toBe(true);
      expect(rule.appliesTo('agent-2')).toBe(false);
    });

    it('group matches agent group', () => {
      const rule = AutomationRule.create(tenantId, 'Test', 'metric_threshold', {}, 'send_alert', {}, {
        targetScope: 'group', targetIds: ['group-a'],
      }).value;
      expect(rule.appliesTo('agent-1', ['group-a', 'group-b'])).toBe(true);
      expect(rule.appliesTo('agent-1', ['group-c'])).toBe(false);
    });
  });

  describe('state transitions', () => {
    it('recordTrigger increments count', () => {
      const rule = AutomationRule.create(tenantId, 'Test', 'metric_threshold', {}, 'send_alert', {}).value;
      rule.recordTrigger();
      expect(rule.triggerCount).toBe(1);
      expect(rule.lastTriggeredAt).toBeTruthy();
    });

    it('activate/deactivate toggles isActive', () => {
      const rule = AutomationRule.create(tenantId, 'Test', 'metric_threshold', {}, 'send_alert', {}).value;
      rule.deactivate();
      expect(rule.isActive).toBe(false);
      rule.activate();
      expect(rule.isActive).toBe(true);
    });
  });
});
