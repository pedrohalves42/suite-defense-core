import type { CertificateRepository } from '@/application/ports/output/CertificateRepository';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import type { TenantId } from '@/domain/value-objects/TenantId';
import { Result } from '@/domain/shared/Result';
import { ApplicationError } from '@/domain/shared/ApplicationError';
import { CertificateExpiringSoonEvent, CertificateExpiredEvent } from '@/domain/events/SecurityEvents';

export interface MonitorCertificatesInput {
  tenantId: TenantId;
  warningDays: number;    // default 30
}

export interface MonitorCertificatesOutput {
  totalCertificates: number;
  expiredCount: number;
  expiringSoonCount: number;
  healthyCount: number;
  expiredSubjects: string[];
  expiringSoonSubjects: string[];
}

export class MonitorExpiringCertificates {
  constructor(
    private readonly certRepo: CertificateRepository,
    private readonly eventDispatcher: DomainEventDispatcher,
  ) {}

  async execute(input: MonitorCertificatesInput): Promise<Result<MonitorCertificatesOutput, ApplicationError>> {
    const expiringCerts = await this.certRepo.findExpiringByTenant(
      input.tenantId,
      input.warningDays,
    );

    const expiredSubjects: string[] = [];
    const expiringSoonSubjects: string[] = [];

    for (const cert of expiringCerts) {
      if (cert.isExpired) {
        expiredSubjects.push(cert.subject);

        await this.eventDispatcher.dispatch(
          new CertificateExpiredEvent(
            cert.id,
            cert.agentId.value,
            cert.subject,
            cert.thumbprint,
          ),
        );
      } else if (cert.isExpiringSoon) {
        expiringSoonSubjects.push(cert.subject);

        await this.eventDispatcher.dispatch(
          new CertificateExpiringSoonEvent(
            cert.id,
            cert.agentId.value,
            cert.subject,
            cert.daysUntilExpiry,
          ),
        );
      }
    }

    const healthyCount = expiringCerts.length - expiredSubjects.length - expiringSoonSubjects.length;

    return Result.success({
      totalCertificates: expiringCerts.length,
      expiredCount: expiredSubjects.length,
      expiringSoonCount: expiringSoonSubjects.length,
      healthyCount: Math.max(0, healthyCount),
      expiredSubjects,
      expiringSoonSubjects,
    });
  }
}
