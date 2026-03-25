/**
 * Deno-compatible domain types for the Hexagonal Architecture.
 *
 * AUTO-GENERATED — DO NOT EDIT MANUALLY.
 * Source of truth: src/domain/shared-kernel/shared-enums.ts
 * Regenerate with: npx tsx scripts/sync-shared-types.ts
 */

// ─── Platform Enums ─────────────────────────────────────
export enum Platform {
  WINDOWS = 'windows',
  LINUX = 'linux',
  MACOS = 'macos',
}

export enum UpdateChannel {
  STABLE = 'stable',
  BETA = 'beta',
  ALPHA = 'alpha',
}

export enum UpdateStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  APPLYING = 'applying',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
}

// --- Port interfaces (Deno-only) -------------------------
export interface CheckForUpdateCommand {
  agentId: string;
  currentVersion: string;
  currentChecksum?: string;
  platform: Platform;
  channel: UpdateChannel;
}

export interface UpdateAvailableResult {
  updateAvailable: boolean;
  packageId?: string;
  targetVersion?: string;
  downloadUrl?: string;
  checksum?: string;
  reason?: 'upgrade' | 'hotfix';
}

export interface ScheduleUpdateCommand {
  agentId: string;
  packageId: string;
}

export interface ScheduleUpdateResult {
  updateId: string;
  status: UpdateStatus;
}

export interface ProcessUpdateStatusCommand {
  updateId: string;
  newStatus: 'downloading' | 'applying' | 'completed' | 'failed';
  errorMessage?: string;
}

export interface ProcessUpdateStatusResult {
  updateId: string;
  previousStatus: string;
  currentStatus: string;
}

// --- Domain Event ----------------------------------------
export interface DomainEvent {
  readonly eventType: string;
  readonly occurredOn: Date;
  readonly aggregateId: string;
  readonly payload: Record<string, unknown>;
}
