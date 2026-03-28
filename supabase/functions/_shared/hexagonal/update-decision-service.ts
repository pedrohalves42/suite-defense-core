/**
 * Hexagonal Update Decision Service
 * 
 * Encapsulates the domain logic for determining whether an agent needs
 * an update, and what kind (upgrade vs hotfix). Used by both
 * serve-agent-update and heartbeat Edge Functions.
 * 
 * This service is a thin adapter that doesn't touch authentication,
 * HMAC, rollout policies, or legacy compatibility ? those remain in
 * the calling Edge Functions.
 */

import { logger } from '../logger.ts';

// ??? Types ??????????????????????????????????????????????
export interface AgentUpdateContext {
  agentId: string;
  agentName: string;
  currentVersion: string | null;
  currentScriptSha256?: string | null;
  platform: string;
}

export interface ReleaseInfo {
  version: string;
  scriptContent: string;
  sha256: string;
  releaseNotes?: string | null;
  signatureBase64?: string | null;
  signedAt?: string | null;
  signedBy?: string | null;
  createdAt?: string;
}

export type UpdateDecision =
  | { action: 'no_update'; reason: string }
  | { action: 'upgrade'; release: ReleaseInfo; fromVersion: string; toVersion: string }
  | { action: 'hotfix'; release: ReleaseInfo; version: string; reason: string };

// ??? Version Normalization ??????????????????????????????
export function normalizeVersion(v: string | null | undefined): string {
  return v?.replace(/^v/i, '').replace(/-.*$/, '') || '';
}

// ??? SHA256 Calculation ?????????????????????????????????
export function normalizeForWindows(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
}

export async function calculateSha256(content: string): Promise<string> {
  const normalized = normalizeForWindows(content);
  const bytes = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ??? Decision Service ???????????????????????????????????
export class UpdateDecisionService {
  /**
   * Determines if an agent needs an update based on version and checksum comparison.
   * 
   * Pure domain logic ? no DB calls, no auth, no side effects.
   */
  async evaluate(
    agent: AgentUpdateContext,
    release: ReleaseInfo,
    options?: {
      /** Skip version check for legacy agents that need forced delivery */
      forceLegacyDelivery?: boolean;
      /** Max age in ms for "recent release" heuristic when agent has no SHA256 */
      recentReleaseThresholdMs?: number;
    },
  ): Promise<UpdateDecision> {
    const currentNorm = normalizeVersion(agent.currentVersion);
    const releaseNorm = normalizeVersion(release.version);

    // Legacy agent bypass
    if (options?.forceLegacyDelivery) {
      logger.info('[UpdateDecision] Legacy agent ? forcing delivery', {
        agentName: agent.agentName,
        currentVersion: agent.currentVersion,
        targetVersion: release.version,
      });
      return {
        action: 'upgrade',
        release,
        fromVersion: agent.currentVersion || '0.0.0',
        toVersion: release.version,
      };
    }

    // Different version ? upgrade
    if (releaseNorm !== currentNorm) {
      return {
        action: 'upgrade',
        release,
        fromVersion: agent.currentVersion || '0.0.0',
        toVersion: release.version,
      };
    }

    // Same version ? check for hotfix via SHA256
    const releaseSha256 = await calculateSha256(release.scriptContent);

    if (agent.currentScriptSha256) {
      // Agent sends SHA256 ? compare directly
      if (agent.currentScriptSha256.toLowerCase() !== releaseSha256.toLowerCase()) {
        logger.warn('[UpdateDecision] SHA256 mismatch ? hotfix detected', {
          agentName: agent.agentName,
          version: release.version,
          agentSha256: agent.currentScriptSha256.substring(0, 16) + '...',
          releaseSha256: releaseSha256.substring(0, 16) + '...',
        });
        return {
          action: 'hotfix',
          release,
          version: release.version,
          reason: 'SHA256 mismatch on same version',
        };
      }

      // Version + SHA match ? up to date
      return { action: 'no_update', reason: 'version_and_sha256_match' };
    }

    // No SHA256 header ? check if release is recent
    const threshold = options?.recentReleaseThresholdMs ?? 24 * 60 * 60 * 1000;
    if (release.createdAt) {
      const releaseAge = Date.now() - new Date(release.createdAt).getTime();
      if (releaseAge < threshold) {
        logger.info('[UpdateDecision] Recent release ? delivering without SHA256', {
          agentName: agent.agentName,
          releaseAge: Math.round(releaseAge / 1000 / 60) + ' minutes',
        });
        return {
          action: 'hotfix',
          release,
          version: release.version,
          reason: 'Recent release without agent SHA256 header',
        };
      }
    }

    return { action: 'no_update', reason: 'version_match_no_sha256_not_recent' };
  }
}

// Singleton for convenience
export const updateDecisionService = new UpdateDecisionService();
