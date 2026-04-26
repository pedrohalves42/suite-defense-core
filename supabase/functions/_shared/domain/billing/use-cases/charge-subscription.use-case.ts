
import { BillingRepository } from '../ports/billing-repository.port.ts';
import { PaymentGateway } from '../ports/payment-gateway.port.ts';
import { ChargeResult, Subscription } from '../entities.ts';

export class ChargeSubscriptionUseCase {
  constructor(
    private billingRepo: BillingRepository,
    private paymentGateway: PaymentGateway
  ) {}

  async execute(tenantId: string): Promise<ChargeResult> {
    const subscription = await this.billingRepo.getSubscriptionByTenantId(tenantId);
    
    if (!subscription) {
      return { success: false, error: 'Subscription not found' };
    }

    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return { success: false, error: `Invalid subscription status: ${subscription.status}` };
    }

    const plan = await this.billingRepo.getPlanById(subscription.planId);
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }

    // Business logic: Calculate total amount
    const extraDevices = subscription.addonDevices || 0;
    const totalAmount = (subscription.deviceQuantity * plan.pricePerDevice);

    const result = await this.paymentGateway.charge(subscription, totalAmount);

    if (result.success) {
      await this.billingRepo.logEvent(tenantId, 'subscription_charged', {
        amount: totalAmount,
        transactionId: result.transactionId,
        deviceQuantity: subscription.deviceQuantity
      });
      
      const newPeriodEnd = new Date();
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1); // Default to monthly for now

      await this.billingRepo.updateSubscription(tenantId, {
        status: 'active',
        currentPeriodEnd: newPeriodEnd
      });
    } else {
      await this.billingRepo.logEvent(tenantId, 'subscription_charge_failed', {
        error: result.error,
        amount: totalAmount
      });
      
      await this.billingRepo.updateSubscription(tenantId, { status: 'past_due' });
    }

    return result;
  }

  async checkSubscription(tenantId: string): Promise<any> {
    const subscription = await this.billingRepo.getSubscriptionByTenantId(tenantId);
    
    if (!subscription?.stripeSubscriptionId) {
      // Logic for free or manual plans
      const planName = subscription?.metadata?.plan_name as string || 'free';
      const baseDevices = this.getBaseDevicesForPlan(planName);
      const installedAgents = await this.billingRepo.countActiveAgents(tenantId);
      
      const response = {
        subscribed: ['active', 'trialing', 'pro', 'enterprise', 'custom'].includes(planName),
        plan_name: planName,
        base_devices: baseDevices,
        addon_devices: subscription?.addonDevices || 0,
        total_devices: baseDevices + (subscription?.addonDevices || 0),
        device_quantity: subscription?.deviceQuantity || 0,
        installed_agents: installedAgents,
        status: subscription?.status || 'inactive',
      };

      if (['enterprise', 'custom', 'pro'].includes(planName)) {
         return { ...response, subscribed: true };
      }

      return response;
    }

    // Stripe Plan logic
    const stripeDetails = await this.paymentGateway.getSubscriptionDetails(subscription.stripeSubscriptionId);
    const addonPriceIds = await this.billingRepo.getAddonPriceIds();
    
    // In a real scenario, we'd fetch stripe items and compare with addonPriceIds
    // For now we trust local cache but update status from Stripe
    await this.billingRepo.updateSubscription(tenantId, {
      status: stripeDetails.status,
      trialEnd: stripeDetails.trialEnd,
      currentPeriodEnd: stripeDetails.currentPeriodEnd
    });

    const plan = await this.billingRepo.getPlanById(subscription.planId);
    const installedAgents = await this.billingRepo.countActiveAgents(tenantId);

    return {
      subscribed: ['active', 'trialing'].includes(stripeDetails.status || ''),
      plan_name: plan?.name || 'unknown',
      status: stripeDetails.status,
      device_quantity: subscription.deviceQuantity,
      installed_agents: installedAgents,
      trial_end: stripeDetails.trialEnd,
      current_period_end: stripeDetails.currentPeriodEnd
    };
  }

  private getBaseDevicesForPlan(planName: string): number {
    const map: Record<string, number> = {
      starter_compliance: 10, starter: 10, business: 30,
      scale: 100, enterprise: 1000, pro: 30, free: 2,
    };
    return map[planName] || 2;
  }
}
