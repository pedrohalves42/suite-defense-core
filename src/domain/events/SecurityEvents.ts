import type { DomainEvent } from '../shared/DomainEvent';

// ── File Integrity Events ──

export class FileIntegrityViolationDetectedEvent implements DomainEvent {
  readonly eventType = 'FileIntegrityViolationDetected';
  readonly occurredOn = new Date();

  constructor(
    readonly aggregateId: string,
    readonly agentId: string,
    readonly filePath: string,
    readonly severity: string,
    readonly scanType: string,
  ) {}
}

export class FileIntegrityRestoredEvent implements DomainEvent {
  readonly eventType = 'FileIntegrityRestored';
  readonly occurredOn = new Date();

  constructor(
    readonly aggregateId: string,
    readonly agentId: string,
    readonly filePath: string,
    readonly restoreMethod: string,
  ) {}
}

// ── USB Device Events ──

export class UsbDeviceAutoBlockedEvent implements DomainEvent {
  readonly eventType = 'UsbDeviceAutoBlocked';
  readonly occurredOn = new Date();

  constructor(
    readonly aggregateId: string,
    readonly agentId: string,
    readonly deviceId: string,
    readonly deviceType: string,
    readonly reason: string,
  ) {}
}

// ── Certificate Events ──

export class CertificateExpiringSoonEvent implements DomainEvent {
  readonly eventType = 'CertificateExpiringSoon';
  readonly occurredOn = new Date();

  constructor(
    readonly aggregateId: string,
    readonly agentId: string,
    readonly subject: string,
    readonly daysUntilExpiry: number,
  ) {}
}

export class CertificateExpiredEvent implements DomainEvent {
  readonly eventType = 'CertificateExpired';
  readonly occurredOn = new Date();

  constructor(
    readonly aggregateId: string,
    readonly agentId: string,
    readonly subject: string,
    readonly thumbprint: string,
  ) {}
}

// ── Behavioral Anomaly Events ──

export class BehavioralAnomalyDetectedEvent implements DomainEvent {
  readonly eventType = 'BehavioralAnomalyDetected';
  readonly occurredOn = new Date();

  constructor(
    readonly aggregateId: string,
    readonly agentId: string,
    readonly baselineType: string,
    readonly deviation: number,
    readonly severity: string,
  ) {}
}

// ── Network Events ──

export class NetworkAnomalyDetectedEvent implements DomainEvent {
  readonly eventType = 'NetworkAnomalyDetected';
  readonly occurredOn = new Date();

  constructor(
    readonly aggregateId: string,
    readonly agentId: string,
    readonly interfaceName: string,
    readonly errorRate: number,
  ) {}
}

// ── Compliance Events ──

export class ComplianceScoreChangedEvent implements DomainEvent {
  readonly eventType = 'ComplianceScoreChanged';
  readonly occurredOn = new Date();

  constructor(
    readonly aggregateId: string,
    readonly tenantId: string,
    readonly previousScore: number,
    readonly newScore: number,
  ) {}
}

// ── SOAR Events ──

export class SoarPlaybookTriggeredEvent implements DomainEvent {
  readonly eventType = 'SoarPlaybookTriggered';
  readonly occurredOn = new Date();

  constructor(
    readonly aggregateId: string,
    readonly playbookName: string,
    readonly triggerType: string,
    readonly actionsExecuted: number,
  ) {}
}
