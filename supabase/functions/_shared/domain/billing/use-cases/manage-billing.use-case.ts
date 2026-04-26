
import { BillingRepository } from '../ports/billing-repository.port.ts';
import { PaymentGateway } from '../ports/payment-gateway.port.ts';
import { handleExceptionWithContext } from '../../../error-handler.ts';
import { fetchWithTimeout } from '../../../fetch-with-timeout.ts';

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
      handleExceptionWithContext(
        error,
        traceId || crypto.randomUUID(),
        'ManageBillingUseCase.getInvoices',
        start,
        { tenantId }
      );
      return { invoices: [], error: 'Erro ao buscar faturas.' };
    }
  }

  async createPortalSession(tenantId: string, returnUrl: string, traceId?: string) {
    const start = Date.now();
    try {
      const subscription = await this.billingRepo.getSubscriptionByTenantId(tenantId);
      if (!subscription?.stripeCustomerId) throw new Error('No Stripe customer found');
      const url = await this.paymentGateway.createPortalSession(subscription.stripeCustomerId, returnUrl);
      return { url };
    } catch (error) {
      handleExceptionWithContext(
        error,
        traceId || crypto.randomUUID(),
        'ManageBillingUseCase.createPortalSession',
        start,
        { tenantId }
      );
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
      handleExceptionWithContext(
        error,
        params.traceId || crypto.randomUUID(),
        'ManageBillingUseCase.createCheckoutSession',
        start,
        { tenantId: params.tenantId }
      );
      throw error;
    }
  }

  async createCustomTrial(data: {
    email: string;
    companyName: string;
    trialDays: number;
    notes?: string;
    createdBy: string;
    traceId?: string;
  }) {
    const start = Date.now();
    try {
       // logic for user creation and trial setup
       // This needs interaction with auth.admin which is usually in the repository or a separate service
       // For this consolidation, we'll implement it through the repository
       const trial = await this.billingRepo.createCustomTrial({
         email: data.email,
         company_name: data.companyName,
         trial_days: data.trialDays,
         notes: data.notes,
         created_by: data.createdBy,
         status: 'active'
       });
       return trial;
    } catch (error) {
      handleExceptionWithContext(
        error,
        data.traceId || crypto.randomUUID(),
        'ManageBillingUseCase.createCustomTrial',
        start
      );
      throw error;
    }
  }

  async sendTrialReminder(data: {
    tenantId: string;
    tenantName: string;
    ownerEmail: string;
    daysRemaining: number;
    traceId?: string;
  }) {
    const start = Date.now();
    try {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      // ADR-045: Using fetchWithTimeout for resilience
      await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/notification-router`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'X-Trace-ID': data.traceId || crypto.randomUUID()
        },
        body: JSON.stringify({ 
          action: 'trial-reminder', 
          payload: { 
            tenant_id: data.tenantId, 
            tenant_name: data.tenantName, 
            email: data.ownerEmail,
            days_remaining: data.daysRemaining 
          } 
        }),
      });

      return { success: true };
    } catch (error) {
      handleExceptionWithContext(
        error,
        data.traceId || crypto.randomUUID(),
        'ManageBillingUseCase.sendTrialReminder',
        start,
        { tenantId: data.tenantId }
      );
      throw error;
    }
  }
}
