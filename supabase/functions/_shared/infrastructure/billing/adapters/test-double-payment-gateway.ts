
import { PaymentGateway } from '../../../domain/billing/ports/payment-gateway.port.ts';
import { Subscription, ChargeResult } from '../../../domain/billing/entities.ts';

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

  async getSubscriptionDetails(_externalId: string): Promise<Partial<Subscription>> {
    return { status: 'active' };
  }

  async createPortalSession(_customerId: string, _returnUrl: string): Promise<string> {
    return 'https://test.stripe.com/portal';
  }
}
