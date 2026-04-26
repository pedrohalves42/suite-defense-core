
import { PaymentGateway } from '../../../domain/billing/ports/payment-gateway.port.ts';
import { Subscription, ChargeResult } from '../../../domain/billing/entities.ts';

export class StripePaymentGateway implements PaymentGateway {
  private stripe: any;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async getStripe() {
    if (!this.stripe) {
      const { default: Stripe } = await import('https://esm.sh/stripe@18.5.0');
      this.stripe = new Stripe(this.apiKey, { apiVersion: '2025-08-27.basil' });
    }
    return this.stripe;
  }

  async charge(subscription: Subscription, amount: number): Promise<ChargeResult> {
    const stripe = await this.getStripe();
    try {
      if (!subscription.stripeCustomerId) {
        return { success: false, error: 'No Stripe Customer ID' };
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe expects cents
        currency: 'brl',
        customer: subscription.stripeCustomerId,
        confirm: true,
        off_session: true,
        payment_method_types: ['card'],
      });

      return {
        success: paymentIntent.status === 'succeeded',
        transactionId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async getSubscriptionDetails(externalId: string): Promise<Partial<Subscription> & { addonDevices?: number }> {
    const stripe = await this.getStripe();
    const stripeSub = await stripe.subscriptions.retrieve(externalId);
    
    // Logic to calculate addon devices from Stripe items if needed
    // This requires access to repository or shared knowledge of addon price IDs
    // For now returning basic details, addon logic will be in use case if it needs repo
    
    return {
      status: stripeSub.status as any,
      trialEnd: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : undefined,
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      // Items are available in stripeSub.items.data
    };
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<string> {
    const stripe = await this.getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return session.url;
  }

  async createCheckoutSession(params: {
    customerId: string;
    lineItems: Array<{ price: string; quantity: number }>;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    subscriptionMetadata: Record<string, string>;
    couponId?: string;
  }): Promise<string> {
    const stripe = await this.getStripe();
    const sessionParams: any = {
      customer: params.customerId,
      line_items: params.lineItems.map(item => ({
        price: item.price,
        quantity: item.quantity
      })),
      mode: 'subscription',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      subscription_data: {
        trial_period_days: 14,
        metadata: params.subscriptionMetadata
      },
      metadata: params.metadata
    };

    if (params.couponId) {
      sessionParams.discounts = [{ coupon: params.couponId }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return session.url;
  }

  async getCustomerByEmail(email: string): Promise<string | null> {
    const stripe = await this.getStripe();
    const customers = await stripe.customers.list({ email, limit: 1 });
    return customers.data.length > 0 ? customers.data[0].id : null;
  }

  async createCustomer(email: string): Promise<string> {
    const stripe = await this.getStripe();
    const customer = await stripe.customers.create({ email });
    return customer.id;
  }
}
