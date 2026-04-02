import { describe, it, expect } from 'vitest';
import { PatchOrchestrator, type PatchInfo, type DeploymentConfig } from '@/domain/services/PatchOrchestrator';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';
import { DeploymentType } from '@/domain/entities/PatchDeployment';

describe('PatchOrchestrator', () => {
  const orchestrator = new PatchOrchestrator();

  const mkPatch = (overrides: Partial<PatchInfo> = {}): PatchInfo => ({
    id: 'p1',
    name: 'Security Update',
    version: '1.0.0',
    platform: 'windows',
    severity: 'medium',
    downloadUrl: 'https://example.com/patch.msu',
    ...overrides,
  });

  const mkConfig = (overrides: Partial<DeploymentConfig> = {}): DeploymentConfig => ({
    strategy: DeploymentType.IMMEDIATE,
    batchSize: 10,
    batchDelayMinutes: 0,
    requiresApproval: false,
    ...overrides,
  });

  const mkAgentIds = (count: number) =>
    Array.from({ length: count }, (_, i) => AgentId.create(`agent-${i}`));

  const tenantId = TenantId.create('tenant-1');

  it('returns no_compatible_agents when empty target list', () => {
    const result = orchestrator.orchestrate(mkPatch(), [], tenantId, mkConfig());
    expect(result.status).toBe('no_compatible_agents');
    expect(result.totalDeployments).toBe(0);
  });

  it('creates deployments for each agent', () => {
    const agents = mkAgentIds(3);
    const result = orchestrator.orchestrate(mkPatch(), agents, tenantId, mkConfig());
    expect(result.status).toBe('deploying');
    expect(result.totalDeployments).toBe(3);
    expect(result.deployments).toHaveLength(3);
  });

  it('requires approval when config.requiresApproval is true', () => {
    const agents = mkAgentIds(2);
    const result = orchestrator.orchestrate(
      mkPatch(),
      agents,
      tenantId,
      mkConfig({ requiresApproval: true }),
    );
    expect(result.status).toBe('approval_required');
    expect(result.pendingApprovals).toBe(2);
    expect(result.deployments).toHaveLength(0);
  });

  it('requires approval for critical patches with >10 agents', () => {
    const agents = mkAgentIds(11);
    const result = orchestrator.orchestrate(
      mkPatch({ severity: 'critical' }),
      agents,
      tenantId,
      mkConfig(),
    );
    expect(result.status).toBe('approval_required');
  });

  it('allows critical patches with <=10 agents without approval', () => {
    const agents = mkAgentIds(5);
    const result = orchestrator.orchestrate(
      mkPatch({ severity: 'critical' }),
      agents,
      tenantId,
      mkConfig(),
    );
    expect(result.status).toBe('deploying');
  });

  it('batches agents correctly', () => {
    const agents = mkAgentIds(25);
    const result = orchestrator.orchestrate(
      mkPatch(),
      agents,
      tenantId,
      mkConfig({ batchSize: 10 }),
    );
    expect(result.totalDeployments).toBe(25);
  });

  describe('generatePatchScript', () => {
    it('generates Windows script', () => {
      const script = orchestrator.generatePatchScript(mkPatch());
      expect(script).toContain('wusa.exe');
      expect(script).toContain('PATCH_SUCCESS');
      expect(script).toContain(mkPatch().downloadUrl);
    });

    it('handles missing downloadUrl', () => {
      const script = orchestrator.generatePatchScript(mkPatch({ downloadUrl: undefined }));
      expect(script).toContain('$PatchUrl = ""');
    });

    it('returns unsupported message for non-windows', () => {
      const script = orchestrator.generatePatchScript(mkPatch({ platform: 'linux' }));
      expect(script).toContain('Unsupported platform');
    });
  });
});
