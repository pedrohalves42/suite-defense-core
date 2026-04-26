
import { PaymentGateway } from '../../../domain/billing/ports/payment-gateway.port.ts';
import { Subscription, ChargeResult } from '../../../domain/billing/entities.ts';

export class ManualPaymentGateway implements PaymentGateway {
  async charge(_subscription: Subscription, amount: number): Promise<ChargeResult> {
    // Manual billing always "succeeds" or handles via different logic
    return {
      success: true,
      transactionId: `manual_${crypto.randomUUID()}`,
      amount: amount,
      currency: 'brl'
    };
  }

  async getSubscriptionDetails(_externalId: string): Promise<Partial<Subscription> & { addonDevices?: number }> {
    return {};
  }

  async createPortalSession(_customerId: string, _returnUrl: string): Promise<string> {
    throw new Error('Portal not available for manual billing');
  }

  async createCheckoutSession(_params: any): Promise<string> {
    throw new Error('Checkout not available for manual billing');
  }

  async getCustomerByEmail(_email: string): Promise<string | null> {
    return null;
  }

  async createCustomer(_email: string): Promise<string> {
    throw new Error('Customer creation not supported');
  }
}
