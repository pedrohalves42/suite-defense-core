import { AgentVersion } from '../value-objects/AgentVersion';
import { UpdateChecksum } from '../value-objects/UpdateChecksum';
import { UpdatePackageId } from '../value-objects/UpdatePackageId';
import { Platform, UpdateChannel } from '../constants';
import { BusinessRuleViolationError } from '../shared/DomainError';

export interface UpdatePackageProps {
  id: UpdatePackageId;
  version: AgentVersion;
  platform: Platform;
  channel: UpdateChannel;
  checksum: UpdateChecksum;
  scriptContent: string;
  size: number;
  releaseNotes: string;
  isActive: boolean;
  signatureBase64?: string | null;
  signedAt?: Date | null;
  signedBy?: string | null;
  minVersion?: AgentVersion | null;
  maxVersion?: AgentVersion | null;
  createdAt: Date;
}

/**
 * UpdatePackage aggregate root.
 * Represents a versioned script package that can be delivered to agents.
 */
export class UpdatePackage {
  private props: UpdatePackageProps;

  private constructor(props: UpdatePackageProps) {
    this.props = props;
  }

  static create(props: UpdatePackageProps): UpdatePackage {
    if (!props.scriptContent || props.scriptContent.length < 1000) {
      throw new BusinessRuleViolationError('Script content must be at least 1000 characters');
    }
    return new UpdatePackage(props);
  }

  static reconstitute(props: UpdatePackageProps): UpdatePackage {
    return new UpdatePackage(props);
  }

  get id(): UpdatePackageId { return this.props.id; }
  get version(): AgentVersion { return this.props.version; }
  get platform(): Platform { return this.props.platform; }
  get channel(): UpdateChannel { return this.props.channel; }
  get checksum(): UpdateChecksum { return this.props.checksum; }
  get scriptContent(): string { return this.props.scriptContent; }
  get size(): number { return this.props.size; }
  get releaseNotes(): string { return this.props.releaseNotes; }
  get isActive(): boolean { return this.props.isActive; }
  get signatureBase64(): string | null | undefined { return this.props.signatureBase64; }
  get signedAt(): Date | null | undefined { return this.props.signedAt; }
  get signedBy(): string | null | undefined { return this.props.signedBy; }
  get minVersion(): AgentVersion | null | undefined { return this.props.minVersion; }
  get maxVersion(): AgentVersion | null | undefined { return this.props.maxVersion; }
  get createdAt(): Date { return this.props.createdAt; }

  /**
   * Check if this package is compatible with the agent's current version.
   */
  isCompatibleWith(currentVersion: AgentVersion): boolean {
    if (this.props.minVersion && currentVersion.isOlderThan(this.props.minVersion)) {
      return false;
    }
    if (this.props.maxVersion && currentVersion.isNewerThan(this.props.maxVersion)) {
      return false;
    }
    return true;
  }

  /**
   * Check if this package represents an upgrade for the given version.
   */
  isUpgradeFor(currentVersion: AgentVersion): boolean {
    return this.props.version.isNewerThan(currentVersion);
  }

  /**
   * Check if this package is a hotfix (same version, different checksum).
   */
  isHotfixFor(currentVersion: AgentVersion, currentChecksum: UpdateChecksum): boolean {
    return this.props.version.compareTo(currentVersion) === 0 
      && !this.props.checksum.matches(currentChecksum);
  }

  deactivate(): void {
    this.props.isActive = false;
  }

  activate(): void {
    this.props.isActive = true;
  }
}
