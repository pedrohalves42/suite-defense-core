import type { DomainEvent } from '../shared/DomainEvent';

export class UpdateAvailableEvent implements DomainEvent {
  readonly eventType = 'update.available';
  readonly occurredOn = new Date();
  constructor(
    public readonly aggregateId: string,
    public readonly availableVersion: string,
    public readonly platform: string
  ) {}
}

export class UpdateScheduledEvent implements DomainEvent {
  readonly eventType = 'update.scheduled';
  readonly occurredOn = new Date();
  constructor(
    public readonly aggregateId: string,
    public readonly packageId: string
  ) {}
}

export class UpdateDownloadStartedEvent implements DomainEvent {
  readonly eventType = 'update.download.started';
  readonly occurredOn = new Date();
  constructor(
    public readonly aggregateId: string,
    public readonly updateId: string
  ) {}
}

export class UpdateCompletedEvent implements DomainEvent {
  readonly eventType = 'update.completed';
  readonly occurredOn = new Date();
  constructor(
    public readonly aggregateId: string,
    public readonly updateId: string,
    public readonly newVersion: string
  ) {}
}

export class UpdateFailedEvent implements DomainEvent {
  readonly eventType = 'update.failed';
  readonly occurredOn = new Date();
  constructor(
    public readonly aggregateId: string,
    public readonly updateId: string,
    public readonly errorMessage: string
  ) {}
}

export class UpdateRolledBackEvent implements DomainEvent {
  readonly eventType = 'update.rolled_back';
  readonly occurredOn = new Date();
  constructor(
    public readonly aggregateId: string,
    public readonly updateId: string,
    public readonly reason: string
  ) {}
}
