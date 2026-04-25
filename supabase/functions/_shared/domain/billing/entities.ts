
export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive';
  deviceQuantity: number;
  addonDevices: number;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  trialEnd?: Date;
  currentPeriodEnd?: Date;
  metadata?: Record<string, unknown>;
}

export interface ChargeResult {
  success: boolean;
  transactionId?: string;
  amount?: number;
  currency?: string;
  error?: string;
}

export interface BillingPlan {
  id: string;
  name: string;
  pricePerDevice: number;
  maxDevices: number;
  stripePriceId?: string;
}
