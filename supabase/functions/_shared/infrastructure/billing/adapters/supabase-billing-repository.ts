
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
      trialEnd: data.trial_end || undefined,
      currentPeriodEnd: data.current_period_end || undefined,
      metadata: data.metadata,
    };
  }

  async createSubscription(data: Partial<Subscription>): Promise<Subscription> {
    const { data: sub, error } = await this.supabase
      .from('tenant_subscriptions')
      .insert({
        tenant_id: data.tenantId,
        plan_id: data.planId,
        status: data.status,
        trial_end: data.trialEnd,
        current_period_start: new Date().toISOString(),
        current_period_end: data.currentPeriodEnd,
        device_quantity: data.deviceQuantity || 0,
        addon_devices: data.addonDevices || 0,
        stripe_customer_id: data.stripeCustomerId,
        stripe_subscription_id: data.stripeSubscriptionId,
        metadata: data.metadata,
      })
      .select().single();
      
    if (error) throw error;
    
    return {
      id: sub.id,
      tenantId: sub.tenant_id,
      planId: sub.plan_id,
      status: sub.status,
      deviceQuantity: sub.device_quantity,
      addonDevices: sub.addon_devices,
      stripeSubscriptionId: sub.stripe_subscription_id,
      stripeCustomerId: sub.stripe_customer_id,
      trialEnd: sub.trial_end || undefined,
      currentPeriodEnd: sub.current_period_end || undefined,
      metadata: sub.metadata,
    };
  }

  async updateSubscription(tenantId: string, data: Partial<Subscription>): Promise<void> {
    const updatePayload: any = {};
    if (data.status) updatePayload.status = data.status;
    if (data.deviceQuantity !== undefined) updatePayload.device_quantity = data.deviceQuantity;
    if (data.addonDevices !== undefined) updatePayload.addon_devices = data.addonDevices;
    if (data.currentPeriodEnd) updatePayload.current_period_end = data.currentPeriodEnd;
    if (data.trialEnd) updatePayload.trial_end = data.trialEnd;
    if (data.stripeCustomerId) updatePayload.stripe_customer_id = data.stripeCustomerId;
    if (data.stripeSubscriptionId) updatePayload.stripe_subscription_id = data.stripeSubscriptionId;
    
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

  async getPlanByStripePriceId(priceId: string): Promise<BillingPlan | null> {
    const { data, error } = await this.supabase
      .from('subscription_plans')
      .select('*')
      .eq('stripe_price_id', priceId)
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

  async getAddonPriceIds(): Promise<string[]> {
    const { data } = await this.supabase
      .from('stripe_plan_mapping')
      .select('stripe_price_id')
      .eq('plan_type', 'addon');
    return data?.map((m: any) => m.stripe_price_id) || [];
  }

  async getPlanMappingsByLogicalPlan(logicalPlan: string): Promise<any[]> {
    const { data } = await this.supabase
      .from('stripe_plan_mapping')
      .select('*')
      .eq('logical_plan', logicalPlan);
    return data || [];
  }

  async ensureTenantFeatures(tenantId: string, planName: string, deviceQuantity: number): Promise<void> {
    await this.supabase.rpc('ensure_tenant_features', {
      p_tenant_id: tenantId,
      p_plan_name: planName,
      p_device_quantity: deviceQuantity,
    });
  }

  async countActiveAgents(tenantId: string): Promise<number> {
    const { count } = await this.supabase
      .from('agents')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    return count || 0;
  }

  async getAllTenants(): Promise<Array<{ id: string; createdAt: string }>> {
    const { data, error } = await this.supabase
      .from('tenants')
      .select('id, created_at')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data.map((t: any) => ({ id: t.id, createdAt: t.created_at }));
  }

  async getAllActiveSubscriptions(): Promise<Subscription[]> {
    const { data, error } = await this.supabase
      .from('tenant_subscriptions')
      .select('*')
      .in('status', ['active', 'trialing']);
    if (error) throw error;
    return data.map((s: any) => ({
      id: s.id,
      tenantId: s.tenant_id,
      planId: s.plan_id,
      status: s.status,
      deviceQuantity: s.device_quantity,
      addonDevices: s.addon_devices,
      stripeSubscriptionId: s.stripe_subscription_id,
      stripeCustomerId: s.stripe_customer_id,
      trialEnd: s.trial_end || undefined,
      currentPeriodEnd: s.current_period_end || undefined,
      metadata: s.metadata
    }));
  }

  async getMarketingCosts(): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('marketing_costs')
      .select('*');
    if (error) throw error;
    return data;
  }

  async getCanceledSubscriptions(since: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('tenant_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'canceled')
      .gte('updated_at', since);
    if (error) throw error;
    return count || 0;
  }

  async getCustomTrial(email: string): Promise<any | null> {
    const { data } = await this.supabase
      .from('custom_trials')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    return data;
  }

  async createCustomTrial(data: any): Promise<any> {
    const { data: trial, error } = await this.supabase
      .from('custom_trials')
      .insert(data)
      .select().single();
    if (error) throw error;
    return trial;
  }
}
