
import { BillingRepository } from '../../../domain/billing/ports/billing-repository.port.ts';
import { Subscription, BillingPlan } from '../../../domain/billing/entities.ts';
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export class SupabaseBillingRepository implements BillingRepository {
  constructor(private supabase: SupabaseClient) {}

  async getSubscriptionByTenantId(tenantId: string): Promise<Subscription | null> {
    const { data, error } = await this.supabase
      .from('tenant_subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      tenantId: data.tenant_id,
      planId: data.plan_id,
      status: data.status,
      deviceQuantity: data.device_quantity,
      addonDevices: data.addon_devices,
      stripeSubscriptionId: data.stripe_subscription_id,
      stripeCustomerId: data.stripe_customer_id,
      trialEnd: data.trial_end ? new Date(data.trial_end) : undefined,
      currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end) : undefined,
      metadata: data.metadata,
    };
  }

  async updateSubscription(tenantId: string, data: Partial<Subscription>): Promise<void> {
    const updatePayload: any = {};
    if (data.status) updatePayload.status = data.status;
    if (data.deviceQuantity !== undefined) updatePayload.device_quantity = data.deviceQuantity;
    if (data.addonDevices !== undefined) updatePayload.addon_devices = data.addonDevices;
    if (data.currentPeriodEnd) updatePayload.current_period_end = data.currentPeriodEnd.toISOString();
    
    await this.supabase
      .from('tenant_subscriptions')
      .update(updatePayload)
      .eq('tenant_id', tenantId);
  }

  async getPlanById(planId: string): Promise<BillingPlan | null> {
    const { data, error } = await this.supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      name: data.name,
      pricePerDevice: data.price_per_device,
      maxDevices: data.max_devices,
      stripePriceId: data.stripe_price_id,
    };
  }

  async getPlanByName(name: string): Promise<BillingPlan | null> {
    const { data, error } = await this.supabase
      .from('subscription_plans')
      .select('*')
      .eq('name', name)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      name: data.name,
      pricePerDevice: data.price_per_device,
      maxDevices: data.max_devices,
      stripePriceId: data.stripe_price_id,
    };
  }

  async logEvent(tenantId: string, eventType: string, metadata: Record<string, unknown>): Promise<void> {
    await this.supabase
      .from('subscription_events')
      .insert({
        tenant_id: tenantId,
        event_type: eventType,
        metadata: metadata,
      });
  }
}
