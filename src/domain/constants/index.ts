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

export enum AgentState {
  INITIALIZING = 'INITIALIZING',
  AUTHENTICATING = 'AUTHENTICATING',
  SYNCING = 'SYNCING',
  ENFORCING = 'ENFORCING',
  DEGRADED = 'DEGRADED',
  SAFE_MODE = 'SAFE_MODE',
}

// Re-export entity-level enums for convenience
export { AgentLifecycleState, AgentStatus, OsType } from '../entities/Agent';
export { JobType, JobStatus, JobPriority } from '../entities/Job';
