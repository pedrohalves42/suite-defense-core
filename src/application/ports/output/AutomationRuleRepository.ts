import { AutomationRule } from '../../../domain/entities/AutomationRule';
import { TenantId } from '../../../domain/value-objects/TenantId';

export interface AutomationRuleRepository {
  save(rule: AutomationRule): Promise<void>;
  update(rule: AutomationRule): Promise<void>;
  getById(id: string): Promise<AutomationRule | null>;
  getActiveByTenant(tenantId: TenantId): Promise<AutomationRule[]>;
  getByTriggerType(tenantId: TenantId, triggerType: string): Promise<AutomationRule[]>;
  delete(id: string): Promise<void>;
}
