
import { BillingRepository } from '../ports/billing-repository.port.ts';
import { PaymentGateway } from '../ports/payment-gateway.port.ts';
import { handleExceptionWithContext } from '../../../error-handler.ts';

export class ManageBillingUseCase {
  constructor(
    private billingRepo: BillingRepository,
    private paymentGateway: PaymentGateway
  ) {}

  async getInvoices(tenantId: string, traceId?: string) {
    const start = Date.now();
    try {
      const subscription = await this.billingRepo.getSubscriptionByTenantId(tenantId);
      if (!subscription?.stripeCustomerId) return { invoices: [] };
      
      const invoices = await this.paymentGateway.listInvoices(subscription.stripeCustomerId);
      return { invoices };
    } catch (error) {
      await handleExceptionWithContext(error, {
        traceId: traceId || crypto.randomUUID(),
        tenantId,
        operation: 'ManageBillingUseCase.getInvoices',
        latency: Date.now() - start
      });
      return { invoices: [], error: 'Erro ao buscar faturas.' };
    }
  }

  async createPortalSession(tenantId: string, returnUrl: string, traceId?: string) {
    const start = Date.now();
    try {
      const subscription = await this.billingRepo.getSubscriptionByTenantId(tenantId);
      if (!subscription?.stripeCustomerId) {
         throw new Error('No Stripe customer found');
      }
      const url = await this.paymentGateway.createPortalSession(subscription.stripeCustomerId, returnUrl);
      return { url };
    } catch (error) {
      await handleExceptionWithContext(error, {
        traceId: traceId || crypto.randomUUID(),
        tenantId,
        operation: 'ManageBillingUseCase.createPortalSession',
        latency: Date.now() - start
      });
      throw error;
    }
  }

  async createCheckoutSession(params: {
    tenantId: string;
    email: string;
    planName: string;
    extraDevices: number;
    successUrl: string;
    cancelUrl: string;
    traceId?: string;
  }) {
    const start = Date.now();
    try {
      let customerId = await this.paymentGateway.getCustomerByEmail(params.email);
      if (!customerId) {
        customerId = await this.paymentGateway.createCustomer(params.email);
      }

      const planMappings = await this.billingRepo.getPlanMappingsByLogicalPlan(params.planName);
      const baseMapping = planMappings.find(m => m.plan_type === 'base');
      const addonMapping = planMappings.find(m => m.plan_type === 'addon');

      if (!baseMapping) throw new Error('Base plan price not found');

      const lineItems = [{ price: baseMapping.stripe_price_id, quantity: 1 }];
      if (params.extraDevices > 0 && addonMapping) {
        lineItems.push({ price: addonMapping.stripe_price_id, quantity: params.extraDevices });
      }

      const url = await this.paymentGateway.createCheckoutSession({
        customerId,
        lineItems,
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        metadata: { tenant_id: params.tenantId, plan_name: params.planName },
        subscriptionMetadata: { tenant_id: params.tenantId, plan_name: params.planName }
      });

      return { url };
    } catch (error) {
      await handleExceptionWithContext(error, {
        traceId: params.traceId || crypto.randomUUID(),
        tenantId: params.tenantId,
        operation: 'ManageBillingUseCase.createCheckoutSession',
        latency: Date.now() - start
      });
      throw error;
    }
  }
}
