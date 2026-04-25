
import { PaymentGateway } from '../../domain/billing/ports/payment-gateway.port.ts';
import { Subscription, ChargeResult } from '../../domain/billing/entities.ts';

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

  async getSubscriptionDetails(externalId: string): Promise<Partial<Subscription>> {
    const stripe = await this.getStripe();
    const stripeSub = await stripe.subscriptions.retrieve(externalId);
    return {
      status: stripeSub.status as any,
      trialEnd: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : undefined,
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
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
}
