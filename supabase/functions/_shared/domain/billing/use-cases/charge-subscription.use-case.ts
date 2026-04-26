
import { BillingRepository } from '../ports/billing-repository.port.ts';
import { PaymentGateway } from '../ports/payment-gateway.port.ts';
import { ChargeResult, Subscription } from '../entities.ts';
import { handleExceptionWithContext } from '../../../error-handler.ts';

export class ChargeSubscriptionUseCase {
  constructor(
    private billingRepo: BillingRepository,
    private paymentGateway: PaymentGateway
  ) {}

  async execute(tenantId: string, traceId?: string): Promise<ChargeResult> {
    const start = Date.now();
    try {
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

      const totalAmount = (subscription.deviceQuantity * plan.pricePerDevice);
      const result = await this.paymentGateway.charge(subscription, totalAmount);

      if (result.success) {
        await this.billingRepo.logEvent(tenantId, 'subscription_charged', {
          amount: totalAmount,
          transactionId: result.transactionId,
          deviceQuantity: subscription.deviceQuantity
        });
        
        const newPeriodEnd = new Date();
        newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

        await this.billingRepo.updateSubscription(tenantId, {
          status: 'active',
          currentPeriodEnd: newPeriodEnd.toISOString()
        });
      } else {
        await this.billingRepo.logEvent(tenantId, 'subscription_charge_failed', {
          error: result.error,
          amount: totalAmount
        });
        
        await this.billingRepo.updateSubscription(tenantId, { status: 'past_due' });
      }

      return result;

    } catch (error) {
      handleExceptionWithContext(
        error,
        traceId || crypto.randomUUID(),
        'ChargeSubscriptionUseCase.execute',
        start,
        { tenantId }
      );
      return { success: false, error: 'Erro interno ao processar cobrança.' };
    }
  }
}

export class CheckSubscriptionUseCase {
  constructor(
    private billingRepo: BillingRepository,
    private paymentGateway: PaymentGateway
  ) {}

  async execute(tenantId: string, traceId?: string): Promise<any> {
    const start = Date.now();
    try {
      const subscription = await this.billingRepo.getSubscriptionByTenantId(tenantId);
      
      if (!subscription?.stripeSubscriptionId) {
        const planName = (subscription?.metadata?.plan_name as string) || 'free';
        const installedAgents = await this.billingRepo.countActiveAgents(tenantId);
        const baseDevices = this.getBaseDevicesForPlan(planName);
        
        return {
          subscribed: ['active', 'trialing', 'pro', 'enterprise', 'custom'].includes(planName),
          plan_name: planName,
          device_quantity: subscription?.deviceQuantity || 0,
          installed_agents: installedAgents,
          total_devices: baseDevices + (subscription?.addonDevices || 0),
          status: subscription?.status || 'inactive',
        };
      }

      const stripeDetails = await this.paymentGateway.getSubscriptionDetails(subscription.stripeSubscriptionId);
      
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

    } catch (error) {
      handleExceptionWithContext(
        error,
        traceId || crypto.randomUUID(),
        'CheckSubscriptionUseCase.execute',
        start,
        { tenantId }
      );
      return { subscribed: false, status: 'error', error: 'Erro ao verificar assinatura.' };
    }
  }

  private getBaseDevicesForPlan(planName: string): number {
    const map: Record<string, number> = {
      starter_compliance: 10, starter: 10, business: 30,
      scale: 100, enterprise: 1000, pro: 30, free: 2,
    };
    return map[planName] || 2;
  }
}
