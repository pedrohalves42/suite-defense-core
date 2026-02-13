import type { DomainEvent } from '../shared/DomainEvent';
import { DomainEventPublisher } from '../shared/DomainEvent';
import { SoarPlaybookTriggeredEvent } from '../events/SecurityEvents';

// ── Types ──

export enum TriggerType {
  VULNERABILITY_CRITICAL = 'vulnerability_critical',
  FILE_INTEGRITY_VIOLATION = 'file_integrity_violation',
  USB_DEVICE_RISKY = 'usb_device_risky',
  CERTIFICATE_EXPIRING = 'certificate_expiring',
  BEHAVIORAL_ANOMALY = 'behavioral_anomaly',
  NETWORK_ANOMALY = 'network_anomaly',
  ANTIVIRUS_OUTDATED = 'antivirus_outdated',
  PROCESS_SUSPICIOUS = 'process_suspicious',
}

export enum ActionType {
  CREATE_JOB = 'create_job',
  BLOCK_DEVICE = 'block_device',
  SEND_ALERT = 'send_alert',
  QUARANTINE = 'quarantine',
  LOG_EVIDENCE = 'log_evidence',
}

export enum PlaybookSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface SoarTrigger {
  type: TriggerType;
  agentId: string;
  tenantId: string;
  severity: PlaybookSeverity;
  data: Record<string, unknown>;
}

export interface PlaybookAction {
  type: ActionType;
  config: Record<string, unknown>;
  description: string;
}

export interface PlaybookRule {
  name: string;
  condition: (trigger: SoarTrigger) => boolean;
  actions: PlaybookAction[];
  failFast: boolean;
}

export interface PlaybookDefinition {
  id: string;
  name: string;
  description: string;
  triggerType: TriggerType;
  isActive: boolean;
  rules: PlaybookRule[];
  requiresApproval: boolean;
  autoApproveForCritical: boolean;
}

export interface ActionResult {
  action: PlaybookAction;
  success: boolean;
  output?: string;
  error?: string;
}

export interface PlaybookExecutionResult {
  playbookId: string;
  playbookName: string;
  executed: boolean;
  reason?: string;
  rulesTriggered: number;
  actionsExecuted: number;
  results: ActionResult[];
}

export interface SoarProcessingResult {
  trigger: SoarTrigger;
  playbooksEvaluated: number;
  executions: PlaybookExecutionResult[];
}

// ── Action Executor Port ──

export interface ActionExecutor {
  executeAction(action: PlaybookAction, trigger: SoarTrigger): Promise<ActionResult>;
}

// ── SOAR Engine ──

export class SoarEngine {
  private playbooks: PlaybookDefinition[] = [];

  constructor(
    private readonly actionExecutor: ActionExecutor,
  ) {}

  registerPlaybook(playbook: PlaybookDefinition): void {
    this.playbooks.push(playbook);
  }

  registerPlaybooks(playbooks: PlaybookDefinition[]): void {
    this.playbooks.push(...playbooks);
  }

  async processTrigger(trigger: SoarTrigger): Promise<SoarProcessingResult> {
    const matchingPlaybooks = this.playbooks.filter(
      pb => pb.isActive && pb.triggerType === trigger.type,
    );

    const executions: PlaybookExecutionResult[] = [];

    for (const playbook of matchingPlaybooks) {
      const result = await this.executePlaybook(playbook, trigger);
      executions.push(result);
    }

    return {
      trigger,
      playbooksEvaluated: matchingPlaybooks.length,
      executions,
    };
  }

  private async executePlaybook(
    playbook: PlaybookDefinition,
    trigger: SoarTrigger,
  ): Promise<PlaybookExecutionResult> {
    const matchingRules = playbook.rules.filter(rule => rule.condition(trigger));

    if (matchingRules.length === 0) {
      return {
        playbookId: playbook.id,
        playbookName: playbook.name,
        executed: false,
        reason: 'no_matching_rules',
        rulesTriggered: 0,
        actionsExecuted: 0,
        results: [],
      };
    }

    // Check approval requirement
    if (playbook.requiresApproval && !(playbook.autoApproveForCritical && trigger.severity === PlaybookSeverity.CRITICAL)) {
      return {
        playbookId: playbook.id,
        playbookName: playbook.name,
        executed: false,
        reason: 'approval_required',
        rulesTriggered: matchingRules.length,
        actionsExecuted: 0,
        results: [],
      };
    }

    const results: ActionResult[] = [];

    for (const rule of matchingRules) {
      for (const action of rule.actions) {
        const result = await this.actionExecutor.executeAction(action, trigger);
        results.push(result);

        if (!result.success && rule.failFast) {
          break;
        }
      }
    }

    DomainEventPublisher.publish(new SoarPlaybookTriggeredEvent(
      playbook.id,
      playbook.name,
      trigger.type,
      results.filter(r => r.success).length,
    ));

    return {
      playbookId: playbook.id,
      playbookName: playbook.name,
      executed: true,
      rulesTriggered: matchingRules.length,
      actionsExecuted: results.length,
      results,
    };
  }

  getActivePlaybooks(): PlaybookDefinition[] {
    return this.playbooks.filter(pb => pb.isActive);
  }

  getPlaybooksByTrigger(type: TriggerType): PlaybookDefinition[] {
    return this.playbooks.filter(pb => pb.isActive && pb.triggerType === type);
  }
}
