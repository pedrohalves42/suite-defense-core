import { AutomationRule, TriggerType, ActionType, TargetScope } from '../../../../domain/entities/AutomationRule';
import { TenantId } from '../../../../domain/value-objects/TenantId';

/**
 * Maps between AutomationRule domain entity and Supabase database rows.
 */
export class AutomationRuleMapper {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static toDomain(row: any): AutomationRule {
    const conditions = row.trigger_conditions || {};
    const actionConfig = row.action_config || {};

    return AutomationRule.reconstitute({
      id: row.id,
      tenantId: TenantId.create(row.tenant_id).value,
      name: row.name,
      description: row.description,
      isActive: row.is_active,
      triggerType: row.trigger_type as TriggerType,
      triggerConditions: {
        metric: conditions.metric,
        operator: conditions.operator,
        value: conditions.value,
        durationMinutes: conditions.duration_minutes,
        eventType: conditions.event_type || conditions.eventType,
        severity: conditions.severity,
      },
      actionType: row.action_type as ActionType,
      actionConfig: {
        jobType: actionConfig.job_type || actionConfig.jobType,
        playbookId: actionConfig.playbook_id || actionConfig.playbookId,
        alertChannel: actionConfig.alert_channel || actionConfig.alertChannel,
        params: actionConfig.params,
      },
      targetScope: (row.target_scope || 'all_agents') as TargetScope,
      targetIds: row.target_ids || [],
      cooldownMinutes: row.cooldown_minutes ?? 30,
      lastTriggeredAt: row.last_triggered_at ? new Date(row.last_triggered_at) : null,
      triggerCount: row.trigger_count ?? 0,
      priority: row.priority ?? 5,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  static toPersistence(entity: AutomationRule): Record<string, unknown> {
    return {
      id: entity.id,
      tenant_id: entity.tenantId.toString(),
      name: entity.name,
      description: entity.description || null,
      is_active: entity.isActive,
      trigger_type: entity.triggerType,
      trigger_conditions: {
        metric: entity.triggerConditions.metric,
        operator: entity.triggerConditions.operator,
        value: entity.triggerConditions.value,
        duration_minutes: entity.triggerConditions.durationMinutes,
        event_type: entity.triggerConditions.eventType,
        severity: entity.triggerConditions.severity,
      },
      action_type: entity.actionType,
      action_config: {
        job_type: entity.actionConfig.jobType,
        playbook_id: entity.actionConfig.playbookId,
        alert_channel: entity.actionConfig.alertChannel,
        params: entity.actionConfig.params,
      },
      target_scope: entity.targetScope,
      target_ids: entity.targetIds,
      cooldown_minutes: entity.cooldownMinutes,
      last_triggered_at: entity.lastTriggeredAt?.toISOString() || null,
      trigger_count: entity.triggerCount,
      priority: entity.priority,
      created_by: entity.createdBy || null,
    };
  }
}
