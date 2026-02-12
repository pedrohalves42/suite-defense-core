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
