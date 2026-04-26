import { assertEquals } from "https://deno.land/std@0.203.0/testing/asserts.ts";
import { spy } from "https://deno.land/std@0.203.0/testing/mock.ts";
import { RunScheduledChecksUseCase } from "../use-cases/run-scheduled-checks.ts";

function createMockRepo() {
  return {
    listActiveChecks: spy(() => Promise.resolve([
      { id: 'check-1', name: 'check-one', check_type: 'rpc' },
      { id: 'check-2', name: 'check-two', check_type: 'rpc' }
    ])),
    rpc: spy((name: string) => Promise.resolve({ success: true, name })),
    saveCheckResult: spy(() => Promise.resolve()),
    logScheduledJobRun: spy(() => Promise.resolve()),
  } as any;
}

Deno.test("RunScheduledChecksUseCase - should execute all active rpc checks", async () => {
  const repo = createMockRepo();
  const useCase = new RunScheduledChecksUseCase(repo);
  
  const result = await useCase.execute("test-req");
  
  assertEquals(result.success, true);
  assertEquals(result.results.length, 2);
  assertEquals(repo.listActiveChecks.calls.length, 1);
  assertEquals(repo.rpc.calls.length, 2);
  assertEquals(repo.saveCheckResult.calls.length, 2);
});

Deno.test("RunScheduledChecksUseCase - should log error and continue if a check fails", async () => {
  const repo = createMockRepo();
  repo.rpc = spy((name: string) => {
    if (name === 'check_one') return Promise.reject(new Error("RPC Failed"));
    return Promise.resolve({ success: true });
  });

  const useCase = new RunScheduledChecksUseCase(repo);
  const result = await useCase.execute("test-req");

  assertEquals(result.results.length, 2);
  assertEquals(result.results[0].status, 'error');
  assertEquals(result.results[1].status, 'success');
  assertEquals(repo.logScheduledJobRun.calls.length, 1);
});
