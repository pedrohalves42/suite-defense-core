import { TenantId } from '../value-objects/TenantId';
import { Result } from '../shared/Result';
import { InvalidArgumentError, BusinessRuleViolationError } from '../shared/DomainError';

export type TriggerType = 'metric_threshold' | 'security_event' | 'process_anomaly' | 'vulnerability';
export type ActionType = 'create_job' | 'send_alert' | 'quarantine' | 'run_playbook';
export type TargetScope = 'all_agents' | 'group' | 'specific_agent';

export interface TriggerCondition {
  metric?: string;
  operator?: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value?: number;
  durationMinutes?: number;
  eventType?: string;
  severity?: string;
}

export interface ActionConfig {
  jobType?: string;
  playbookId?: string;
  alertChannel?: string;
  params?: Record<string, unknown>;
}

export interface AutomationRuleProps {
  id: string;
  tenantId: TenantId;
  name: string;
  description?: string;
  isActive: boolean;
  triggerType: TriggerType;
  triggerConditions: TriggerCondition;
  actionType: ActionType;
  actionConfig: ActionConfig;
  targetScope: TargetScope;
  targetIds: string[];
  cooldownMinutes: number;
  lastTriggeredAt?: Date | null;
  triggerCount: number;
  priority: number;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AutomationRule entity.
 * Defines conditions and actions for automated responses.
 */
export class AutomationRule {
  private props: AutomationRuleProps;

  private constructor(props: AutomationRuleProps) {
    this.props = props;
  }

  static create(
    tenantId: TenantId,
    name: string,
    triggerType: TriggerType,
    triggerConditions: TriggerCondition,
    actionType: ActionType,
    actionConfig: ActionConfig,
    options?: {
      description?: string;
      targetScope?: TargetScope;
      targetIds?: string[];
      cooldownMinutes?: number;
      priority?: number;
      createdBy?: string;
    }
  ): Result<AutomationRule, InvalidArgumentError> {
    if (!name || name.trim().length < 3) {
      return Result.failure(new InvalidArgumentError('AutomationRule', 'Name must be at least 3 characters'));
    }

    const priority = options?.priority ?? 5;
    if (priority < 1 || priority > 10) {
      return Result.failure(new InvalidArgumentError('AutomationRule', 'Priority must be 1-10'));
    }

    const cooldown = options?.cooldownMinutes ?? 30;
    if (cooldown < 1) {
      return Result.failure(new InvalidArgumentError('AutomationRule', 'Cooldown must be >= 1 minute'));
    }

    return Result.success(new AutomationRule({
      id: crypto.randomUUID(),
      tenantId,
      name: name.trim(),
      description: options?.description,
      isActive: true,
      triggerType,
      triggerConditions,
      actionType,
      actionConfig,
      targetScope: options?.targetScope ?? 'all_agents',
      targetIds: options?.targetIds ?? [],
      cooldownMinutes: cooldown,
      lastTriggeredAt: null,
      triggerCount: 0,
      priority,
      createdBy: options?.createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  static reconstitute(props: AutomationRuleProps): AutomationRule {
    return new AutomationRule(props);
  }

  get id(): string { return this.props.id; }
  get tenantId(): TenantId { return this.props.tenantId; }
  get name(): string { return this.props.name; }
  get description(): string | undefined { return this.props.description; }
  get isActive(): boolean { return this.props.isActive; }
  get triggerType(): TriggerType { return this.props.triggerType; }
  get triggerConditions(): TriggerCondition { return this.props.triggerConditions; }
  get actionType(): ActionType { return this.props.actionType; }
  get actionConfig(): ActionConfig { return this.props.actionConfig; }
  get targetScope(): TargetScope { return this.props.targetScope; }
  get targetIds(): string[] { return this.props.targetIds; }
  get cooldownMinutes(): number { return this.props.cooldownMinutes; }
  get lastTriggeredAt(): Date | null | undefined { return this.props.lastTriggeredAt; }
  get triggerCount(): number { return this.props.triggerCount; }
  get priority(): number { return this.props.priority; }
  get createdBy(): string | undefined { return this.props.createdBy; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  /**
   * Check if the rule is in cooldown period.
   */
  isInCooldown(): boolean {
    if (!this.props.lastTriggeredAt) return false;
    const cooldownMs = this.props.cooldownMinutes * 60 * 1000;
    return Date.now() - this.props.lastTriggeredAt.getTime() < cooldownMs;
  }

  /**
   * Evaluate whether a metric value triggers this rule.
   */
  evaluateMetric(metricName: string, value: number): boolean {
    if (!this.props.isActive) return false;
    if (this.isInCooldown()) return false;
    if (this.props.triggerConditions.metric !== metricName) return false;

    const threshold = this.props.triggerConditions.value;
    if (threshold === undefined) return false;

    switch (this.props.triggerConditions.operator) {
      case '>': return value > threshold;
      case '<': return value < threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      case '!=': return value !== threshold;
      default: return false;
    }
  }

  /**
   * Record that this rule was triggered.
   */
  recordTrigger(): void {
    this.props.lastTriggeredAt = new Date();
    this.props.triggerCount += 1;
    this.props.updatedAt = new Date();
  }

  activate(): void {
    this.props.isActive = true;
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
    this.props.isActive = false;
    this.props.updatedAt = new Date();
  }

  /**
   * Check if this rule applies to a given agent.
   */
  appliesTo(agentId: string, agentGroupIds?: string[]): boolean {
    if (this.props.targetScope === 'all_agents') return true;
    if (this.props.targetScope === 'specific_agent') {
      return this.props.targetIds.includes(agentId);
    }
    if (this.props.targetScope === 'group' && agentGroupIds) {
      return this.props.targetIds.some(id => agentGroupIds.includes(id));
    }
    return false;
  }
}
