
export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive';
  deviceQuantity: number;
  addonDevices: number;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  trialEnd?: string; // Standardized as ISO string
  currentPeriodEnd?: string; // Standardized as ISO string
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

export interface Invoice {
  id: string;
  number: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: string;
  createdAt: number;
  dueDate: number | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

export interface CohortData {
  month: string;
  total: number;
  active: number;
  churned: number;
  retentionRate: number;
  monthsSinceCreation: number[];
}

export interface UnitEconomics {
  mrr: number;
  arr: number;
  arpa: number;
  cac: number;
  ltv: number;
  ltvCacRatio: number;
  paybackMonths: number;
  churnRate: number;
  grossMargin: number;
  activeCustomers: number;
}
