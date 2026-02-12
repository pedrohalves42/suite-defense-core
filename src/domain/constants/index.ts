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
