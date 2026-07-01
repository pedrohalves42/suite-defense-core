import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.203.0/testing/mock.ts";
import { ChargeSubscriptionUseCase } from "../use-cases/charge-subscription.use-case.ts";
import type { Subscription, BillingPlan, ChargeResult } from "../entities.ts";
import type { BillingRepository } from "../ports/billing-repository.port.ts";
import type { PaymentGateway } from "../ports/payment-gateway.port.ts";

function createMockBillingRepo() {
  const subscription: Subscription = {
    id: 'sub-1',
    tenantId: 'tenant-1',
    planId: 'plan-1',
    status: 'active',
    deviceQuantity: 10,
    addonDevices: 0
  };

  const plan: BillingPlan = {
    id: 'plan-1',
    name: 'Pro',
    pricePerDevice: 10,
    maxDevices: 100
  };

  return {
    getSubscriptionByTenantId: spy((_id: string) => Promise.resolve(subscription)),
    getPlanById: spy((_id: string) => Promise.resolve(plan)),
    logEvent: spy(() => Promise.resolve()),
    updateSubscription: spy(() => Promise.resolve()),
  } as unknown as BillingRepository;
}

function createMockPaymentGateway() {
  return {
    charge: spy((_sub: Subscription, amount: number) => 
      Promise.resolve({ success: true, transactionId: 'tx-123', amount } as ChargeResult)
    ),
  } as unknown as PaymentGateway;
}

Deno.test("ChargeSubscriptionUseCase - should charge successfully and log event", async () => {
  const repo = createMockBillingRepo();
  const gateway = createMockPaymentGateway();
  const useCase = new ChargeSubscriptionUseCase(repo, gateway);
  
  const result = await useCase.execute("tenant-1");
  
  assertEquals(result.success, true);
  assertEquals(result.transactionId, 'tx-123');
  
  // Verify interactions
  // @ts-expect-error: mock spy — repo methods are wrapped with Deno.spy
  assertEquals(repo.getSubscriptionByTenantId.calls.length, 1);
  // @ts-expect-error: mock spy — gateway.charge is wrapped with Deno.spy
  assertEquals(gateway.charge.calls.length, 1);
  // @ts-expect-error: mock spy — repo methods are wrapped with Deno.spy
  assertEquals(repo.logEvent.calls.length, 1);
  // @ts-expect-error: mock spy — repo methods are wrapped with Deno.spy
  assertEquals(repo.updateSubscription.calls.length, 1);
});

Deno.test("ChargeSubscriptionUseCase - should handle payment failure", async () => {
  const repo = createMockBillingRepo();
  const gateway = {
    charge: spy(() => Promise.resolve({ success: false, error: 'Card declined' }))
  } as unknown as PaymentGateway;
  
  const useCase = new ChargeSubscriptionUseCase(repo, gateway);
  const result = await useCase.execute("tenant-1");
  
  assertEquals(result.success, false);
  assertEquals(result.error, 'Card declined');
  
  // @ts-ignore
  assertEquals(repo.logEvent.calls[0].args[1], 'subscription_charge_failed');
  // @ts-ignore
  assertEquals(repo.updateSubscription.calls[0].args[1].status, 'past_due');
});
