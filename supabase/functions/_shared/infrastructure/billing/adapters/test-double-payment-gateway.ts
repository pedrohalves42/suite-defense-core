
import { PaymentGateway } from '../../../domain/billing/ports/payment-gateway.port.ts';
import { Subscription, ChargeResult, Invoice } from '../../../domain/billing/entities.ts';

export class TestDoublePaymentGateway implements PaymentGateway {
  public shouldFail = false;

  async charge(_subscription: Subscription, amount: number): Promise<ChargeResult> {
    if (this.shouldFail) {
      return { success: false, error: 'Simulated failure' };
    }
    return {
      success: true,
      transactionId: 'test_tx_123',
      amount: amount,
      currency: 'usd'
    };
  }

  async getSubscriptionDetails(_externalId: string): Promise<Partial<Subscription> & { addonDevices?: number }> {
    return { status: 'active' };
  }

  async createPortalSession(_customerId: string, _returnUrl: string): Promise<string> {
    return 'https://test.stripe.com/portal';
  }

  async createCheckoutSession(_params: any): Promise<string> {
    return 'https://test.stripe.com/checkout';
  }

  async getCustomerByEmail(_email: string): Promise<string | null> {
    return 'cus_test123';
  }

  async createCustomer(_email: string): Promise<string> {
    return 'cus_test123';
  }

  async listInvoices(_customerId: string, _limit?: number): Promise<Invoice[]> {
    return [];
  }
}
