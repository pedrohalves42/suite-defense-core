import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { ProcessAgentUpdatesUseCase } from '../use-cases.ts';
import type {
  VersionQueryPort,
  UpdateJobPort,
  ObservabilityPort,
  EventDispatcherPort,
  LatestVersionInfo,
  OutdatedAgentInfo,
} from '../ports.ts';
import { Platform, type DomainEvent } from '../types.ts';

// ─── In-memory test doubles ────────────────────────────
class FakeVersionQuery implements VersionQueryPort {
  latestVersions: LatestVersionInfo[] = [];
  outdatedAgents: OutdatedAgentInfo[] = [];

  async findLatestVersions() { return this.latestVersions; }
  async findOutdatedAgents(_p: Platform, _v: string) { return this.outdatedAgents; }
}

class FakeUpdateJob implements UpdateJobPort {
  pendingJobs = new Set<string>();
  createdJobs: Array<{ agentId: string; targetVersion: string }> = [];
  forceUpdates: Array<{ agentId: string; version: string }> = [];

  async hasPendingUpdateJob(agentId: string) { return this.pendingJobs.has(agentId); }
  async createUpdateJob(params: any) {
    this.createdJobs.push({ agentId: params.agentId, targetVersion: params.targetVersion });
    return 'job-' + this.createdJobs.length;
  }
  async setForceUpdateVersion(agentId: string, version: string, _reason: string) {
    this.forceUpdates.push({ agentId, version });
  }
}

class FakeObservability implements ObservabilityPort {
  logs: any[] = [];
  async logScheduledJobRun(params: any) { this.logs.push(params); }
}

class FakeEventDispatcher implements EventDispatcherPort {
  events: DomainEvent[] = [];
  async dispatch(event: DomainEvent) { this.events.push(event); }
}

// ─── Tests ──────────────────────────────────────────────
Deno.test('ProcessAgentUpdates returns empty when no latest versions', async () => {
  const useCase = new ProcessAgentUpdatesUseCase(
    new FakeVersionQuery(),
    new FakeUpdateJob(),
    new FakeObservability(),
    new FakeEventDispatcher(),
  );

  const result = await useCase.execute('test-req');
  assertEquals(result.success, true);
  assertEquals(result.totalJobsCreated, 0);
  assertEquals(result.platforms.length, 0);
});

Deno.test('ProcessAgentUpdates creates jobs for outdated agents', async () => {
  const vq = new FakeVersionQuery();
  vq.latestVersions = [{ platform: Platform.WINDOWS, version: '5.1.0' }];
  vq.outdatedAgents = [
    { id: 'a1', agentName: 'Agent1', agentVersion: '5.0.3', tenantId: 't1', platform: Platform.WINDOWS },
    { id: 'a2', agentName: 'Agent2', agentVersion: '5.0.2', tenantId: 't1', platform: Platform.WINDOWS },
  ];

  const uj = new FakeUpdateJob();
  const obs = new FakeObservability();
  const ed = new FakeEventDispatcher();

  const useCase = new ProcessAgentUpdatesUseCase(vq, uj, obs, ed);
  const result = await useCase.execute('test-req');

  assertEquals(result.success, true);
  assertEquals(result.totalJobsCreated, 2);
  assertEquals(uj.createdJobs.length, 2);
  assertEquals(uj.forceUpdates.length, 2);
  assertEquals(ed.events.length, 2);
});

Deno.test('ProcessAgentUpdates skips agents with pending jobs', async () => {
  const vq = new FakeVersionQuery();
  vq.latestVersions = [{ platform: Platform.WINDOWS, version: '5.1.0' }];
  vq.outdatedAgents = [
    { id: 'a1', agentName: 'Agent1', agentVersion: '5.0.3', tenantId: 't1', platform: Platform.WINDOWS },
  ];

  const uj = new FakeUpdateJob();
  uj.pendingJobs.add('a1');

  const useCase = new ProcessAgentUpdatesUseCase(vq, uj, new FakeObservability(), new FakeEventDispatcher());
  const result = await useCase.execute('test-req');

  assertEquals(result.totalJobsCreated, 0);
  assertEquals(uj.createdJobs.length, 0);
});

Deno.test('ProcessAgentUpdates logs observability on success', async () => {
  const vq = new FakeVersionQuery();
  vq.latestVersions = [{ platform: Platform.WINDOWS, version: '5.1.0' }];
  // No outdated agents — but latestVersions exists so observability fires
  const obs = new FakeObservability();
  const useCase = new ProcessAgentUpdatesUseCase(
    vq,
    new FakeUpdateJob(),
    obs,
    new FakeEventDispatcher(),
  );

  await useCase.execute('test-req');
  assertEquals(obs.logs.length, 1);
  assertEquals(obs.logs[0].success, true);
  assertEquals(obs.logs[0].jobKey, 'process-agent-updates');
});

Deno.test('ProcessAgentUpdates rejects downgrade (agent newer than target)', async () => {
  const vq = new FakeVersionQuery();
  vq.latestVersions = [{ platform: Platform.WINDOWS, version: 'v5.0.7' }];
  // Agent is at v5.0.8 but findOutdatedAgents returned it (simulating stale data)
  vq.outdatedAgents = [
    { id: 'a1', agentName: 'Agent1', agentVersion: 'v5.0.8', tenantId: 't1', platform: Platform.WINDOWS },
  ];

  const uj = new FakeUpdateJob();
  const useCase = new ProcessAgentUpdatesUseCase(vq, uj, new FakeObservability(), new FakeEventDispatcher());
  const result = await useCase.execute('test-req');

  // Should NOT create any jobs — v5.0.8 >= v5.0.7
  assertEquals(result.totalJobsCreated, 0);
  assertEquals(uj.createdJobs.length, 0);
});

Deno.test('ProcessAgentUpdates rejects same version (no-op)', async () => {
  const vq = new FakeVersionQuery();
  vq.latestVersions = [{ platform: Platform.WINDOWS, version: 'v5.0.8' }];
  vq.outdatedAgents = [
    { id: 'a1', agentName: 'Agent1', agentVersion: 'v5.0.8', tenantId: 't1', platform: Platform.WINDOWS },
  ];

  const uj = new FakeUpdateJob();
  const useCase = new ProcessAgentUpdatesUseCase(vq, uj, new FakeObservability(), new FakeEventDispatcher());
  const result = await useCase.execute('test-req');

  assertEquals(result.totalJobsCreated, 0);
  assertEquals(uj.createdJobs.length, 0);
});
