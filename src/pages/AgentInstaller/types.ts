export type Platform = 'windows' | 'linux' | 'macos';

export type BuildProgressStep = 'preparing' | 'dispatching' | 'compiling' | 'uploading' | 'completed';

export interface BuildProgressState {
  currentStep: BuildProgressStep;
  status: 'pending' | 'active' | 'completed' | 'error';
  message: string;
  githubRunUrl?: string;
}

export type ExeBuildStatus = 'idle' | 'building' | 'completed' | 'failed' | 'cached';

export interface PreviewCredentials {
  agentId?: string;
  expiresAt?: string;
}
