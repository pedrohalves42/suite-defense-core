import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';
import { Result } from '../shared/Result';
import { DomainError, InvalidArgumentError } from '../shared/DomainError';

// ── Enums ──

export enum IntegrityStatus {
  VALID = 'valid',
  MODIFIED = 'modified',
  MISSING = 'missing',
  EXTRA = 'extra',
  UNKNOWN = 'unknown',
}

export enum ScanType {
  CRITICAL_FILES = 'critical_files',
  SYSTEM_BINS = 'system_bins',
  LOGS = 'logs',
}

export enum FileIntegritySeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// ── Props ──

export interface FileIntegrityCheckProps {
  id: string;
  agentId: AgentId;
  tenantId: TenantId;
  filePath: string;
  expectedHash: string | null;
  actualHash: string;
  status: IntegrityStatus;
  scanType: ScanType;
  severity: FileIntegritySeverity;
  fileSize?: number;
  modifiedAt?: Date;
  collectedAt: Date;
  createdAt: Date;
}

export interface CreateFileIntegrityCheckProps {
  agentId: AgentId;
  tenantId: TenantId;
  filePath: string;
  expectedHash: string | null;
  actualHash: string;
  scanType: ScanType;
  fileSize?: number;
  modifiedAt?: Date;
}

// ── Entity ──

export class FileIntegrityCheck {
  private props: FileIntegrityCheckProps;

  private constructor(props: FileIntegrityCheckProps) {
    this.props = props;
  }

  static create(input: CreateFileIntegrityCheckProps): Result<FileIntegrityCheck, DomainError> {
    if (!input.filePath) {
      return Result.failure(new InvalidArgumentError('FileIntegrityCheck', 'filePath is required'));
    }
    if (!input.actualHash) {
      return Result.failure(new InvalidArgumentError('FileIntegrityCheck', 'actualHash is required'));
    }

    const status = FileIntegrityCheck.determineStatus(input.expectedHash, input.actualHash);
    const severity = FileIntegrityCheck.calculateSeverity(status, input.scanType);

    return Result.success(new FileIntegrityCheck({
      id: crypto.randomUUID(),
      agentId: input.agentId,
      tenantId: input.tenantId,
      filePath: input.filePath,
      expectedHash: input.expectedHash,
      actualHash: input.actualHash,
      status,
      scanType: input.scanType,
      severity,
      fileSize: input.fileSize,
      modifiedAt: input.modifiedAt,
      collectedAt: new Date(),
      createdAt: new Date(),
    }));
  }

  static reconstitute(props: FileIntegrityCheckProps): FileIntegrityCheck {
    return new FileIntegrityCheck(props);
  }

  private static determineStatus(expected: string | null, actual: string): IntegrityStatus {
    if (!expected) return IntegrityStatus.UNKNOWN;
    return expected === actual ? IntegrityStatus.VALID : IntegrityStatus.MODIFIED;
  }

  private static calculateSeverity(status: IntegrityStatus, scanType: ScanType): FileIntegritySeverity {
    if (status === IntegrityStatus.VALID) return FileIntegritySeverity.INFO;
    switch (scanType) {
      case ScanType.CRITICAL_FILES: return FileIntegritySeverity.CRITICAL;
      case ScanType.SYSTEM_BINS: return FileIntegritySeverity.HIGH;
      case ScanType.LOGS: return FileIntegritySeverity.MEDIUM;
      default: return FileIntegritySeverity.LOW;
    }
  }

  get id(): string { return this.props.id; }
  get agentId(): AgentId { return this.props.agentId; }
  get tenantId(): TenantId { return this.props.tenantId; }
  get filePath(): string { return this.props.filePath; }
  get expectedHash(): string | null { return this.props.expectedHash; }
  get actualHash(): string { return this.props.actualHash; }
  get status(): IntegrityStatus { return this.props.status; }
  get scanType(): ScanType { return this.props.scanType; }
  get severity(): FileIntegritySeverity { return this.props.severity; }
  get fileSize(): number | undefined { return this.props.fileSize; }
  get modifiedAt(): Date | undefined { return this.props.modifiedAt; }
  get collectedAt(): Date { return this.props.collectedAt; }
  get createdAt(): Date { return this.props.createdAt; }

  get isViolation(): boolean {
    return this.props.status !== IntegrityStatus.VALID && this.props.status !== IntegrityStatus.UNKNOWN;
  }
}
