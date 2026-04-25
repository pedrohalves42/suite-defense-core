
import { Subscription, BillingPlan } from '../entities.ts';

export interface BillingRepository {
  getSubscriptionByTenantId(tenantId: string): Promise<Subscription | null>;
  updateSubscription(tenantId: string, data: Partial<Subscription>): Promise<void>;
  getPlanById(planId: string): Promise<BillingPlan | null>;
  getPlanByName(name: string): Promise<BillingPlan | null>;
  logEvent(tenantId: string, eventType: string, metadata: Record<string, unknown>): Promise<void>;
}
