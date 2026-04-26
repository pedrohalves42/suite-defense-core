
import { IAgentReleaseRepository } from '../ports/agent-release.repository.ts';
import { Agent, Release, ForceUpdateOptions } from '../entities.ts';
import { normalizeVersion } from '../../../hexagonal/update-decision-service.ts';
import { logger } from '../../../logger.ts';

const MIN_FORCE_UPDATE_VERSION = '4.5.0';
const MAX_DELIVERY_ATTEMPTS = 50;
const AUTO_REMEDIATION_COOLDOWN_MS = 60 * 60 * 1000;
const AUTO_REMEDIATION_OVERRIDE_WINDOW_MS = 15 * 60 * 1000;
const AUTO_REMEDIATION_STATES = new Set(['SAFE_MODE', 'INITIALIZING']);

export class ForceUpdateUseCase {
  constructor(private readonly releaseRepo: IAgentReleaseRepository) {}

  async execute(
    agent: Agent,
    currentVersion: string,
    platform: string,
    agentState?: string | null
  ): Promise<{ 
    agent: Agent; 
    release: Release | null; 
    options: ForceUpdateOptions;
    shouldDeliver: boolean;
  }> {
    let workingAgent = { ...agent };
    let effectiveForceVersion = workingAgent.force_update_version;
    let effectiveForceReason = workingAgent.force_update_reason;
    let deliveryOptions: ForceUpdateOptions = {};
    let prefetchedRelease: Release | null = null;

    // 1. Self-heal if missing version but has timestamp
    if (!effectiveForceVersion && workingAgent.force_update_at) {
      const healed = await this.selfHeal(workingAgent, platform, currentVersion);
      if (healed) {
        effectiveForceVersion = healed.version;
        effectiveForceReason = healed.reason;
        prefetchedRelease = healed.release;
        workingAgent = {
          ...workingAgent,
          force_update_version: healed.version,
          force_update_reason: healed.reason,
        };
      }
    }

    // 2. Auto-arm remediation if needed
    if (!effectiveForceVersion) {
      const autoRemediation = await this.maybeAutoArm(
        workingAgent,
        currentVersion,
        platform,
        agentState
      );

      if (autoRemediation) {
        effectiveForceVersion = autoRemediation.version;
        effectiveForceReason = autoRemediation.reason;
        prefetchedRelease = autoRemediation.release;
        deliveryOptions = {
          omitPayloadSignature: autoRemediation.options.omitPayloadSignature,
          overrideSafeMode: autoRemediation.options.overrideSafeMode,
          overrideSafeModeExpiresAt: autoRemediation.options.overrideSafeModeExpiresAt,
        };
        workingAgent = {
          ...workingAgent,
          force_update_version: autoRemediation.version,
          force_update_reason: autoRemediation.reason,
          force_update_at: autoRemediation.forceUpdateAt,
          force_update_override_safe_mode: autoRemediation.options.overrideSafeMode ?? workingAgent.force_update_override_safe_mode,
          force_update_override_safe_mode_expires_at: autoRemediation.options.overrideSafeModeExpiresAt ?? workingAgent.force_update_override_safe_mode_expires_at,
        };
      }
    }

    if (!effectiveForceVersion) {
      return { agent: workingAgent, release: null, options: {}, shouldDeliver: false };
    }

    // 3. Validation
    const agentNorm = normalizeVersion(currentVersion);
    const minNorm = normalizeVersion(MIN_FORCE_UPDATE_VERSION);

    if (agentNorm && minNorm && agentNorm < minNorm) {
      logger.warn('Agent version too old for force_update, clearing flag', {
        agentName: workingAgent.agent_name,
        agentVersion: agentNorm,
        minRequired: MIN_FORCE_UPDATE_VERSION,
      });
      await this.releaseRepo.clearForceUpdateFlag(workingAgent.id, 'auto_cleared_version_too_old');
      return { agent: workingAgent, release: null, options: {}, shouldDeliver: false };
    }

    const currentNorm = normalizeVersion(currentVersion);
    const targetNorm = normalizeVersion(effectiveForceVersion);
    const sameVersionReported = !!currentNorm && !!targetNorm && currentNorm === targetNorm;

    const forceTriggeredAtMs = workingAgent.force_update_at ? new Date(workingAgent.force_update_at).getTime() : null;
    const lastAppliedMs = workingAgent.last_forced_update_applied ? new Date(workingAgent.last_forced_update_applied).getTime() : null;
    const staleSameVersionTrigger = sameVersionReported && lastAppliedMs !== null &&
      (forceTriggeredAtMs === null || forceTriggeredAtMs <= lastAppliedMs);

    if (staleSameVersionTrigger) {
      logger.warn('Stale same-version force_update detected after confirmed apply, clearing flag', {
        agentName: workingAgent.agent_name,
        version: currentVersion,
      });
      await this.releaseRepo.clearForceUpdateFlag(workingAgent.id, 'auto_cleared_already_applied');
      return { agent: workingAgent, release: null, options: {}, shouldDeliver: false };
    }

    if (workingAgent.force_update_delivered_count >= MAX_DELIVERY_ATTEMPTS) {
      logger.warn('Agent does not support force_update after max deliveries, clearing flag', {
        agentName: workingAgent.agent_name,
        deliveredCount: workingAgent.force_update_delivered_count,
      });
      await this.releaseRepo.clearForceUpdateFlag(workingAgent.id, null);
      return { agent: workingAgent, release: null, options: {}, shouldDeliver: false };
    }

    // 4. Final delivery prep
    if (!prefetchedRelease) {
      prefetchedRelease = await this.releaseRepo.getReleaseByVersion(effectiveForceVersion, platform);
    }

    if (!prefetchedRelease) {
      logger.warn('Force update version not found in agent_releases', {
        agentName: workingAgent.agent_name,
        targetVersion: effectiveForceVersion,
        platform,
      });
      return { agent: workingAgent, release: null, options: {}, shouldDeliver: false };
    }

    const deliveryAttempt = workingAgent.force_update_delivered_count + 1;
    const now = new Date().toISOString();
    
    const agentUpdate: Partial<Agent> = {
      force_update_delivered_count: deliveryAttempt,
      force_update_first_delivered_at: workingAgent.force_update_first_delivered_at || now,
    };

    await this.releaseRepo.updateAgentForceUpdate(workingAgent.id, agentUpdate);
    
    return {
      agent: { ...workingAgent, ...agentUpdate },
      release: prefetchedRelease,
      options: deliveryOptions,
      shouldDeliver: true
    };
  }

  private async selfHeal(agent: Agent, platform: string, currentVersion: string) {
    const latestRelease = await this.releaseRepo.getLatestActiveRelease(platform);
    if (!latestRelease?.version) return null;

    if (normalizeVersion(currentVersion) === normalizeVersion(latestRelease.version)) {
      await this.releaseRepo.clearForceUpdateFlag(agent.id, 'auto_cleared_version_matched_on_recovery');
      return null;
    }

    const reason = agent.force_update_reason || 'Recovered from pending force_update_at without version';
    await this.releaseRepo.updateAgentForceUpdate(agent.id, {
      force_update_version: latestRelease.version,
      force_update_reason: reason
    });

    return { version: latestRelease.version, reason, release: latestRelease };
  }

  private async maybeAutoArm(agent: Agent, currentVersion: string, platform: string, state?: string | null) {
    if (platform !== 'windows' || !currentVersion) return null;

    const agentState = state || agent.state || null;
    if (!agentState || !AUTO_REMEDIATION_STATES.has(agentState)) return null;

    const currentNorm = normalizeVersion(currentVersion);
    const minNorm = normalizeVersion(MIN_FORCE_UPDATE_VERSION);
    if (!currentNorm || !minNorm || currentNorm < minNorm) return null;

    const lastAppliedMs = agent.last_forced_update_applied ? new Date(agent.last_forced_update_applied).getTime() : null;
    if (lastAppliedMs !== null && Date.now() - lastAppliedMs < AUTO_REMEDIATION_COOLDOWN_MS) {
      return null;
    }

    const latestRelease = await this.releaseRepo.getLatestActiveRelease(platform);
    if (!latestRelease?.version) return null;

    const latestNorm = normalizeVersion(latestRelease.version);
    if (!latestNorm || latestNorm !== currentNorm) return null;

    const forceUpdateAt = new Date().toISOString();
    const overrideSafeModeExpiresAt = new Date(Date.now() + AUTO_REMEDIATION_OVERRIDE_WINDOW_MS).toISOString();
    const reason = 'Auto-remediation: re-deliver patched script to recover TOCTOU loop';

    await this.releaseRepo.updateAgentForceUpdate(agent.id, {
      force_update_version: latestRelease.version,
      force_update_reason: reason,
      force_update_at: forceUpdateAt,
      force_update_override_safe_mode: true,
      force_update_override_safe_mode_expires_at: overrideSafeModeExpiresAt,
    });

    return {
      version: latestRelease.version,
      reason,
      forceUpdateAt,
      release: latestRelease,
      options: {
        omitPayloadSignature: true,
        overrideSafeMode: true,
        overrideSafeModeExpiresAt
      }
    };
  }
}
