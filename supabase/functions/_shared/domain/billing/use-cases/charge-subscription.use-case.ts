
import { BillingRepository } from '../ports/billing-repository.port.ts';
import { PaymentGateway } from '../ports/payment-gateway.port.ts';
import { ChargeResult } from '../entities.ts';

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
    const baseDevices = plan.maxDevices; // Or logic based on plan
    const extraDevices = subscription.addonDevices || 0;
    const totalAmount = (subscription.deviceQuantity * plan.pricePerDevice);

    const result = await this.paymentGateway.charge(subscription, totalAmount);

    if (result.success) {
      await this.billingRepo.logEvent(tenantId, 'subscription_charged', {
        amount: totalAmount,
        transactionId: result.transactionId,
        deviceQuantity: subscription.deviceQuantity
      });
      
      // Update local status if needed
      await this.billingRepo.updateSubscription(tenantId, {
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Example 30 days
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
}
