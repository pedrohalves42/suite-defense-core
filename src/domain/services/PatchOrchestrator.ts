import { PatchDeployment, DeploymentType, DeploymentPriority, type CreatePatchDeploymentProps } from '../entities/PatchDeployment';
import type { AgentId } from '../value-objects/AgentId';
import type { TenantId } from '../value-objects/TenantId';

// ─── Types ──────────────────────────────────────────────

export interface PatchInfo {
  id: string;
  name: string;
  version: string;
  platform: string;
  severity: string;
  downloadUrl?: string;
}

export interface DeploymentConfig {
  strategy: DeploymentType;
  batchSize: number;
  batchDelayMinutes: number;
  requiresApproval: boolean;
}

export interface PatchOrchestrationResult {
  status: 'deploying' | 'approval_required' | 'no_compatible_agents';
  totalDeployments: number;
  pendingApprovals: number;
  deployments: PatchDeployment[];
}

// ─── Service ────────────────────────────────────────────

export class PatchOrchestrator {
  /**
   * Creates deployment records for a patch across target agents.
   * This is a pure domain service—no I/O. The calling use case
   * is responsible for persisting deployments and creating jobs.
   */
  orchestrate(
    patch: PatchInfo,
    targetAgentIds: AgentId[],
    tenantId: TenantId,
    config: DeploymentConfig,
  ): PatchOrchestrationResult {
    if (targetAgentIds.length === 0) {
      return { status: 'no_compatible_agents', totalDeployments: 0, pendingApprovals: 0, deployments: [] };
    }

    // Check approval for critical patches or large batches
    if (config.requiresApproval || (patch.severity === 'critical' && targetAgentIds.length > 10)) {
      return {
        status: 'approval_required',
        totalDeployments: 0,
        pendingApprovals: targetAgentIds.length,
        deployments: [],
      };
    }

    // Create deployment for each target agent
    const deployments: PatchDeployment[] = [];

    const batches = this.createBatches(targetAgentIds, config.batchSize);

    for (const batch of batches) {
      for (const agentId of batch) {
        const deploymentResult = PatchDeployment.create({
          patchId: patch.id,
          patchName: patch.name,
          patchVersion: patch.version,
          agentId,
          tenantId,
          deploymentType: config.strategy,
          priority: this.mapSeverityToPriority(patch.severity),
        });

        if (deploymentResult.isSuccess) {
          deployments.push(deploymentResult.value);
        }
      }
    }

    return {
      status: 'deploying',
      totalDeployments: deployments.length,
      pendingApprovals: 0,
      deployments,
    };
  }

  private createBatches(agentIds: AgentId[], batchSize: number): AgentId[][] {
    const batches: AgentId[][] = [];
    for (let i = 0; i < agentIds.length; i += batchSize) {
      batches.push(agentIds.slice(i, i + batchSize));
    }
    return batches;
  }

  private mapSeverityToPriority(severity: string): DeploymentPriority {
    switch (severity) {
      case 'critical': return DeploymentPriority.URGENT;
      case 'high': return DeploymentPriority.HIGH;
      case 'medium': return DeploymentPriority.MEDIUM;
      default: return DeploymentPriority.LOW;
    }
  }

  /**
   * Generates a platform-appropriate patch deployment script.
   */
  generatePatchScript(patch: PatchInfo): string {
    if (patch.platform === 'windows') {
      return [
        `# Patch Deployment: ${patch.name} v${patch.version}`,
        `$PatchUrl = "${patch.downloadUrl ?? ''}"`,
        `$TempFile = "$env:TEMP\\patch_${patch.id}.msu"`,
        '',
        'try {',
        '  if ($PatchUrl) {',
        '    Invoke-WebRequest -Uri $PatchUrl -OutFile $TempFile -UseBasicParsing',
        '    $proc = Start-Process -FilePath "wusa.exe" -ArgumentList "$TempFile /quiet /norestart" -Wait -PassThru',
        '    if ($proc.ExitCode -eq 0 -or $proc.ExitCode -eq 3010) {',
        '      Write-Output "PATCH_SUCCESS"',
        '    } else {',
        '      Write-Output "PATCH_FAILED:$($proc.ExitCode)"',
        '    }',
        '  } else {',
        '    Write-Output "PATCH_SKIPPED:no_download_url"',
        '  }',
        '} catch {',
        '  Write-Output "PATCH_ERROR:$($_.Exception.Message)"',
        '} finally {',
        '  Remove-Item $TempFile -Force -ErrorAction SilentlyContinue',
        '}',
      ].join('\n');
    }

    return `# Unsupported platform: ${patch.platform}`;
  }
}
