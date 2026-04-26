
import { Subscription, ChargeResult, Invoice } from '../entities.ts';

export interface PaymentGateway {
  charge(subscription: Subscription, amount: number): Promise<ChargeResult>;
  getSubscriptionDetails(externalId: string): Promise<Partial<Subscription> & { addonDevices?: number }>;
  createPortalSession(customerId: string, returnUrl: string): Promise<string>;
  createCheckoutSession(params: {
    customerId: string;
    lineItems: Array<{ price: string; quantity: number }>;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    subscriptionMetadata: Record<string, string>;
    couponId?: string;
  }): Promise<string>;
  getCustomerByEmail(email: string): Promise<string | null>;
  createCustomer(email: string): Promise<string>;
  listInvoices(customerId: string, limit?: number): Promise<Invoice[]>;
}
