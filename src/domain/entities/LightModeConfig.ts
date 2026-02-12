import { AgentId } from '../value-objects/AgentId';
import { Result } from '../shared/Result';
import { InvalidArgumentError, BusinessRuleViolationError } from '../shared/DomainError';

/**
 * Default media processes that indicate streaming/video activity.
 */
export const DEFAULT_MEDIA_PROCESSES = [
  'chrome', 'firefox', 'msedge', 'vlc', 'obs64', 'obs',
  'teams', 'zoom', 'discord', 'spotify', 'mpc-hc64',
  'wmplayer', 'brave', 'opera',
];

export interface LightModeThresholds {
  cpuThresholdPercent: number;
  networkThresholdMbps: number;
  mediaProcesses: string[];
  durationMinutes: number;
  reducedIntervalSeconds: number;
}

export interface LightModeConfigProps {
  id: string;
  agentId: AgentId;
  isActive: boolean;
  activatedAt: Date | null;
  expiresAt: Date | null;
  reason: string;
  collectionIntervalSeconds: number;
  skipProcessCollection: boolean;
  skipNetworkCollection: boolean;
  compressPayloads: boolean;
  thresholds: LightModeThresholds;
  activeMediaProcesses: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * LightModeConfig entity.
 * Controls adaptive collection behavior when media/streaming is detected.
 * The agent reduces its footprint to avoid impacting user experience.
 */
export class LightModeConfig {
  private props: LightModeConfigProps;

  private constructor(props: LightModeConfigProps) {
    this.props = props;
  }

  static create(
    agentId: AgentId,
    thresholds?: Partial<LightModeThresholds>
  ): Result<LightModeConfig, InvalidArgumentError> {
    if (!agentId) {
      return Result.failure(new InvalidArgumentError('LightModeConfig', 'AgentId is required'));
    }

    const defaults: LightModeThresholds = {
      cpuThresholdPercent: 50,
      networkThresholdMbps: 10,
      mediaProcesses: [...DEFAULT_MEDIA_PROCESSES],
      durationMinutes: 15,
      reducedIntervalSeconds: 600,
    };

    const merged = { ...defaults, ...thresholds };

    if (merged.cpuThresholdPercent < 0 || merged.cpuThresholdPercent > 100) {
      return Result.failure(new InvalidArgumentError('LightModeConfig', 'CPU threshold must be 0-100'));
    }
    if (merged.networkThresholdMbps < 0) {
      return Result.failure(new InvalidArgumentError('LightModeConfig', 'Network threshold must be >= 0'));
    }
    if (merged.durationMinutes < 1) {
      return Result.failure(new InvalidArgumentError('LightModeConfig', 'Duration must be >= 1 minute'));
    }
    if (merged.reducedIntervalSeconds < 60) {
      return Result.failure(new InvalidArgumentError('LightModeConfig', 'Reduced interval must be >= 60 seconds'));
    }

    return Result.success(new LightModeConfig({
      id: crypto.randomUUID(),
      agentId,
      isActive: false,
      activatedAt: null,
      expiresAt: null,
      reason: '',
      collectionIntervalSeconds: 60,
      skipProcessCollection: false,
      skipNetworkCollection: false,
      compressPayloads: false,
      thresholds: merged,
      activeMediaProcesses: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  static reconstitute(props: LightModeConfigProps): LightModeConfig {
    return new LightModeConfig(props);
  }

  // ── Getters ──

  get id(): string { return this.props.id; }
  get agentId(): AgentId { return this.props.agentId; }
  get isActive(): boolean { return this.props.isActive; }
  get activatedAt(): Date | null { return this.props.activatedAt; }
  get expiresAt(): Date | null { return this.props.expiresAt; }
  get reason(): string { return this.props.reason; }
  get collectionIntervalSeconds(): number { return this.props.collectionIntervalSeconds; }
  get skipProcessCollection(): boolean { return this.props.skipProcessCollection; }
  get skipNetworkCollection(): boolean { return this.props.skipNetworkCollection; }
  get compressPayloads(): boolean { return this.props.compressPayloads; }
  get thresholds(): LightModeThresholds { return this.props.thresholds; }
  get activeMediaProcesses(): string[] { return this.props.activeMediaProcesses; }

  // ── Domain Logic ──

  /**
   * Evaluate whether light mode should activate based on current system state.
   * Returns true if activation conditions are met.
   */
  shouldActivate(
    activeProcessNames: string[],
    cpuPercent: number,
    networkMbps: number
  ): boolean {
    if (this.props.isActive) return false;

    // Check thresholds
    if (cpuPercent < this.props.thresholds.cpuThresholdPercent) return false;
    if (networkMbps < this.props.thresholds.networkThresholdMbps) return false;

    // Check for media processes
    const normalizedActive = new Set(
      activeProcessNames.map(n => n.toLowerCase().replace('.exe', ''))
    );
    const mediaProcesses = this.props.thresholds.mediaProcesses.map(p => p.toLowerCase());

    return mediaProcesses.some(mp => normalizedActive.has(mp));
  }

  /**
   * Activate light mode with reduced collection settings.
   */
  activate(reason: string, detectedMediaProcesses: string[]): void {
    if (this.props.isActive) return;

    this.props.isActive = true;
    this.props.activatedAt = new Date();
    this.props.expiresAt = new Date(
      Date.now() + this.props.thresholds.durationMinutes * 60 * 1000
    );
    this.props.reason = reason;
    this.props.activeMediaProcesses = detectedMediaProcesses;

    // Apply reduced collection settings
    this.props.collectionIntervalSeconds = this.props.thresholds.reducedIntervalSeconds;
    this.props.skipProcessCollection = true;
    this.props.skipNetworkCollection = true;
    this.props.compressPayloads = true;

    this.props.updatedAt = new Date();
  }

  /**
   * Deactivate light mode and restore normal settings.
   */
  deactivate(): void {
    if (!this.props.isActive) return;

    this.props.isActive = false;
    this.props.activatedAt = null;
    this.props.expiresAt = null;
    this.props.reason = '';
    this.props.activeMediaProcesses = [];

    // Restore normal collection settings
    this.props.collectionIntervalSeconds = 60;
    this.props.skipProcessCollection = false;
    this.props.skipNetworkCollection = false;
    this.props.compressPayloads = false;

    this.props.updatedAt = new Date();
  }

  /**
   * Check if light mode has expired and deactivate if so.
   * Returns true if it was expired and deactivated.
   */
  checkExpiration(): boolean {
    if (!this.props.isActive || !this.props.expiresAt) return false;

    if (new Date() >= this.props.expiresAt) {
      this.deactivate();
      return true;
    }

    return false;
  }

  /**
   * Remaining minutes before light mode expires.
   */
  get remainingMinutes(): number {
    if (!this.props.isActive || !this.props.expiresAt) return 0;
    const remaining = this.props.expiresAt.getTime() - Date.now();
    return Math.max(0, Math.ceil(remaining / 60000));
  }
}
