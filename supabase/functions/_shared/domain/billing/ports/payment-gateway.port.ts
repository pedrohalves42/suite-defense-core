
import { Subscription, ChargeResult } from '../entities.ts';

export interface PaymentGateway {
  charge(subscription: Subscription, amount: number): Promise<ChargeResult>;
  getSubscriptionDetails(externalId: string): Promise<Partial<Subscription>>;
  createPortalSession(customerId: string, returnUrl: string): Promise<string>;
}
