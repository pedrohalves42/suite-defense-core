import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SoarEngine,
  TriggerType,
  ActionType,
  PlaybookSeverity,
  type SoarTrigger,
  type PlaybookDefinition,
  type ActionExecutor,
  type ActionResult,
} from '@/domain/services/SoarEngine';

// Mock DomainEventPublisher to avoid side effects
vi.mock('@/domain/shared/DomainEvent', () => ({
  DomainEventPublisher: { publish: vi.fn() },
}));

const mkTrigger = (overrides: Partial<SoarTrigger> = {}): SoarTrigger => ({
  type: TriggerType.VULNERABILITY_CRITICAL,
  agentId: 'a1',
  tenantId: 't1',
  severity: PlaybookSeverity.CRITICAL,
  data: { cvssScore: 9.5 },
  ...overrides,
});

const mkPlaybook = (overrides: Partial<PlaybookDefinition> = {}): PlaybookDefinition => ({
  id: 'pb-test',
  name: 'Test Playbook',
  description: 'desc',
  triggerType: TriggerType.VULNERABILITY_CRITICAL,
  isActive: true,
  requiresApproval: false,
  autoApproveForCritical: true,
  rules: [
    {
      name: 'Always match',
      condition: () => true,
      actions: [
        { type: ActionType.LOG_EVIDENCE, config: {}, description: 'Log' },
        { type: ActionType.SEND_ALERT, config: {}, description: 'Alert' },
      ],
      failFast: false,
    },
  ],
  ...overrides,
});

describe('SoarEngine', () => {
  let engine: SoarEngine;
  let executor: ActionExecutor;

  beforeEach(() => {
    executor = {
      executeAction: vi.fn().mockResolvedValue({ action: {}, success: true } as ActionResult),
    };
    engine = new SoarEngine(executor);
  });

  it('executes matching playbook', async () => {
    engine.registerPlaybook(mkPlaybook());
    const result = await engine.processTrigger(mkTrigger());
    expect(result.playbooksEvaluated).toBe(1);
    expect(result.executions[0].executed).toBe(true);
    expect(result.executions[0].actionsExecuted).toBe(2);
    expect(executor.executeAction).toHaveBeenCalledTimes(2);
  });

  it('skips inactive playbooks', async () => {
    engine.registerPlaybook(mkPlaybook({ isActive: false }));
    const result = await engine.processTrigger(mkTrigger());
    expect(result.playbooksEvaluated).toBe(0);
  });

  it('skips playbooks with non-matching trigger type', async () => {
    engine.registerPlaybook(mkPlaybook({ triggerType: TriggerType.USB_DEVICE_RISKY }));
    const result = await engine.processTrigger(mkTrigger());
    expect(result.playbooksEvaluated).toBe(0);
  });

  it('returns no_matching_rules when conditions fail', async () => {
    engine.registerPlaybook(mkPlaybook({
      rules: [{ name: 'Never', condition: () => false, actions: [], failFast: false }],
    }));
    const result = await engine.processTrigger(mkTrigger());
    expect(result.executions[0].executed).toBe(false);
    expect(result.executions[0].reason).toBe('no_matching_rules');
  });

  it('requires approval for non-critical trigger', async () => {
    engine.registerPlaybook(mkPlaybook({
      requiresApproval: true,
      autoApproveForCritical: false,
    }));
    const result = await engine.processTrigger(mkTrigger());
    expect(result.executions[0].executed).toBe(false);
    expect(result.executions[0].reason).toBe('approval_required');
  });

  it('auto-approves for critical when autoApproveForCritical is true', async () => {
    engine.registerPlaybook(mkPlaybook({
      requiresApproval: true,
      autoApproveForCritical: true,
    }));
    const result = await engine.processTrigger(mkTrigger({ severity: PlaybookSeverity.CRITICAL }));
    expect(result.executions[0].executed).toBe(true);
  });

  it('failFast stops on first failure', async () => {
    (executor.executeAction as any)
      .mockResolvedValueOnce({ action: {}, success: false } as ActionResult)
      .mockResolvedValueOnce({ action: {}, success: true } as ActionResult);
    engine.registerPlaybook(mkPlaybook({
      rules: [{
        name: 'FailFast',
        condition: () => true,
        actions: [
          { type: ActionType.LOG_EVIDENCE, config: {}, description: 'Log' },
          { type: ActionType.SEND_ALERT, config: {}, description: 'Alert' },
        ],
        failFast: true,
      }],
    }));
    const result = await engine.processTrigger(mkTrigger());
    expect(result.executions[0].actionsExecuted).toBe(1);
  });

  it('getActivePlaybooks returns only active', () => {
    engine.registerPlaybook(mkPlaybook({ id: '1', isActive: true }));
    engine.registerPlaybook(mkPlaybook({ id: '2', isActive: false }));
    expect(engine.getActivePlaybooks()).toHaveLength(1);
  });

  it('getPlaybooksByTrigger filters correctly', () => {
    engine.registerPlaybooks([
      mkPlaybook({ id: '1', triggerType: TriggerType.VULNERABILITY_CRITICAL }),
      mkPlaybook({ id: '2', triggerType: TriggerType.USB_DEVICE_RISKY }),
    ]);
    const result = engine.getPlaybooksByTrigger(TriggerType.USB_DEVICE_RISKY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });
});
