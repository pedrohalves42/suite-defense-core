import { assertEquals } from "https://deno.land/std@0.203.0/testing/asserts.ts";
import { spy } from "https://deno.land/std@0.203.0/testing/mock.ts";
import { ChargeSubscriptionUseCase } from "../use-cases/charge-subscription.use-case.ts";

function createMockBillingRepo() {
  return {
    getSubscriptionByTenantId: spy(() => Promise.resolve({
      tenantId: 'tenant-1',
      planId: 'plan-pro',
      status: 'active',
      deviceQuantity: 10
    })),
    getPlanById: spy(() => Promise.resolve({
      id: 'plan-pro',
      name: 'Pro',
      pricePerDevice: 5
    })),
    logEvent: spy(() => Promise.resolve()),
    updateSubscription: spy(() => Promise.resolve()),
  } as any;
}

function createMockPaymentGateway() {
  return {
    charge: spy(() => Promise.resolve({
      success: true,
      transactionId: 'txn-123'
    })),
  } as any;
}

Deno.test("ChargeSubscriptionUseCase - should successfully charge active subscription", async () => {
  const repo = createMockBillingRepo();
  const gateway = createMockPaymentGateway();
  const useCase = new ChargeSubscriptionUseCase(repo, gateway);
  
  const result = await useCase.execute("tenant-1");
  
  assertEquals(result.success, true);
  assertEquals(repo.getSubscriptionByTenantId.calls.length, 1);
  assertEquals(repo.getPlanById.calls.length, 1);
  assertEquals(gateway.charge.calls.length, 1);
  assertEquals(repo.updateSubscription.calls.length, 1);
  assertEquals(repo.logEvent.calls.length, 1);
  
  // Verify amount charged (10 devices * $5 = $50)
  const chargeCall = gateway.charge.calls[0];
  assertEquals(chargeCall.args[1], 50);
});

Deno.test("ChargeSubscriptionUseCase - should handle payment failure", async () => {
  const repo = createMockBillingRepo();
  const gateway = createMockPaymentGateway();
  gateway.charge = spy(() => Promise.resolve({
    success: false,
    error: 'Insufficient funds'
  }));

  const useCase = new ChargeSubscriptionUseCase(repo, gateway);
  const result = await useCase.execute("tenant-1");

  assertEquals(result.success, false);
  assertEquals(repo.updateSubscription.calls.length, 1);
  assertEquals(repo.updateSubscription.calls[0].args[1].status, 'past_due');
  assertEquals(repo.logEvent.calls[0].args[1], 'subscription_charge_failed');
});
