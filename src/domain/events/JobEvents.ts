import type { DomainEvent } from '../shared/DomainEvent';

export class JobCreatedEvent implements DomainEvent {
  readonly eventType = 'job.created';
  readonly occurredOn = new Date();
  constructor(
    public readonly aggregateId: string,
    public readonly agentId: string,
    public readonly jobType: string,
  ) {}
}

export class JobCompletedEvent implements DomainEvent {
  readonly eventType = 'job.completed';
  readonly occurredOn = new Date();
  constructor(
    public readonly aggregateId: string,
    public readonly agentId: string,
    public readonly exitCode: number,
  ) {}
}

export class JobFailedEvent implements DomainEvent {
  readonly eventType = 'job.failed';
  readonly occurredOn = new Date();
  constructor(
    public readonly aggregateId: string,
    public readonly agentId: string,
    public readonly reason: string,
  ) {}
}

export class JobTimedOutEvent implements DomainEvent {
  readonly eventType = 'job.timeout';
  readonly occurredOn = new Date();
  constructor(
    public readonly aggregateId: string,
    public readonly agentId: string,
  ) {}
}
