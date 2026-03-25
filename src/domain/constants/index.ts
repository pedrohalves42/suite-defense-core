/**
 * Domain constants — re-exports from the canonical shared kernel
 * plus entity-level enums for convenience.
 */

// Canonical shared enums (single source of truth)
export { Platform, UpdateChannel, UpdateStatus } from '../shared-kernel/shared-enums';

// Re-export entity-level enums for convenience
export { AgentState, AgentStatus, OsType } from '../entities/Agent';
export { JobType, JobStatus, JobPriority } from '../entities/Job';

/**
 * Agent operational FSM states (PowerShell agent runtime).
 * Distinct from AgentState (lifecycle) — these track runtime behavior.
 */
export enum AgentOperationalState {
  INITIALIZING = 'INITIALIZING',
  AUTHENTICATING = 'AUTHENTICATING',
  SYNCING = 'SYNCING',
  ENFORCING = 'ENFORCING',
  DEGRADED = 'DEGRADED',
  SAFE_MODE = 'SAFE_MODE',
}
