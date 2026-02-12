import { ValueObject } from '../shared/ValueObject';
import { Result } from '../shared/Result';
import { InvalidArgumentError } from '../shared/DomainError';

const SEMVER_REGEX = /^v?(\d+)\.(\d+)\.(\d+)(.*)$/;

export class AgentVersion extends ValueObject<string> {
  private readonly major: number;
  private readonly minor: number;
  private readonly patch: number;
  private readonly suffix: string;

  private constructor(value: string, major: number, minor: number, patch: number, suffix: string) {
    super(value);
    this.major = major;
    this.minor = minor;
    this.patch = patch;
    this.suffix = suffix;
  }

  static create(version: string): Result<AgentVersion, InvalidArgumentError> {
    if (!version) {
      return Result.failure(new InvalidArgumentError('AgentVersion', 'Version cannot be empty'));
    }
    const match = version.match(SEMVER_REGEX);
    if (!match) {
      return Result.failure(new InvalidArgumentError('AgentVersion', `Invalid format: ${version}. Expected: x.y.z`));
    }
    const [, maj, min, pat, suffix] = match;
    const normalized = `${maj}.${min}.${pat}`;
    return Result.success(new AgentVersion(normalized, Number(maj), Number(min), Number(pat), suffix || ''));
  }

  static zero(): AgentVersion {
    return new AgentVersion('0.0.0', 0, 0, 0, '');
  }

  isOlderThan(other: AgentVersion): boolean {
    return this.compareTo(other) < 0;
  }

  isNewerThan(other: AgentVersion): boolean {
    return this.compareTo(other) > 0;
  }

  compareTo(other: AgentVersion): number {
    if (this.major !== other.major) return this.major - other.major;
    if (this.minor !== other.minor) return this.minor - other.minor;
    return this.patch - other.patch;
  }

  get normalized(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  }

  get full(): string {
    return this.suffix ? `${this.normalized}${this.suffix}` : this.normalized;
  }
}
