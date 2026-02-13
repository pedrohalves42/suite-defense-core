import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';
import { Result } from '../shared/Result';
import { DomainError, InvalidArgumentError } from '../shared/DomainError';

// ── Enums ──

export enum CertStore {
  PERSONAL = 'personal',
  ROOT = 'root',
  INTERMEDIATE = 'intermediate',
}

// ── Props ──

export interface CertificateProps {
  id: string;
  agentId: AgentId;
  tenantId: TenantId;
  certStore: CertStore;
  subject: string;
  issuer?: string;
  thumbprint: string;
  serialNumber?: string;
  validFrom?: Date;
  validUntil?: Date;
  keyUsage: string[];
  isSelfSigned: boolean;
  collectedAt: Date;
  createdAt: Date;
}

export interface CreateCertificateProps {
  agentId: AgentId;
  tenantId: TenantId;
  certStore: CertStore;
  subject: string;
  issuer?: string;
  thumbprint: string;
  serialNumber?: string;
  validFrom?: Date;
  validUntil?: Date;
  keyUsage?: string[];
  isSelfSigned?: boolean;
}

// ── Entity ──

export class Certificate {
  private props: CertificateProps;

  private constructor(props: CertificateProps) {
    this.props = props;
  }

  static create(input: CreateCertificateProps): Result<Certificate, DomainError> {
    if (!input.subject) {
      return Result.failure(new InvalidArgumentError('Certificate', 'subject is required'));
    }
    if (!input.thumbprint) {
      return Result.failure(new InvalidArgumentError('Certificate', 'thumbprint is required'));
    }

    return Result.success(new Certificate({
      id: crypto.randomUUID(),
      agentId: input.agentId,
      tenantId: input.tenantId,
      certStore: input.certStore,
      subject: input.subject,
      issuer: input.issuer,
      thumbprint: input.thumbprint,
      serialNumber: input.serialNumber,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      keyUsage: input.keyUsage ?? [],
      isSelfSigned: input.isSelfSigned ?? false,
      collectedAt: new Date(),
      createdAt: new Date(),
    }));
  }

  static reconstitute(props: CertificateProps): Certificate {
    return new Certificate(props);
  }

  get isExpired(): boolean {
    if (!this.props.validUntil) return false;
    return this.props.validUntil < new Date();
  }

  get daysUntilExpiry(): number {
    if (!this.props.validUntil) return Infinity;
    const diff = this.props.validUntil.getTime() - Date.now();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  get isExpiringSoon(): boolean {
    return this.daysUntilExpiry <= 30 && this.daysUntilExpiry > 0;
  }

  get id(): string { return this.props.id; }
  get agentId(): AgentId { return this.props.agentId; }
  get tenantId(): TenantId { return this.props.tenantId; }
  get certStore(): CertStore { return this.props.certStore; }
  get subject(): string { return this.props.subject; }
  get issuer(): string | undefined { return this.props.issuer; }
  get thumbprint(): string { return this.props.thumbprint; }
  get serialNumber(): string | undefined { return this.props.serialNumber; }
  get validFrom(): Date | undefined { return this.props.validFrom; }
  get validUntil(): Date | undefined { return this.props.validUntil; }
  get keyUsage(): string[] { return this.props.keyUsage; }
  get isSelfSigned(): boolean { return this.props.isSelfSigned; }
  get collectedAt(): Date { return this.props.collectedAt; }
  get createdAt(): Date { return this.props.createdAt; }
}
