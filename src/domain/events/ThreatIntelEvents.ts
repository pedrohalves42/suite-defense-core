import type { DomainEvent } from '../shared/DomainEvent';

export class ThreatIndicatorMatchedEvent implements DomainEvent {
  readonly eventType = 'ThreatIndicatorMatched';
  readonly occurredOn = new Date();

  constructor(
    readonly aggregateId: string,
    readonly agentId: string,
    readonly indicatorType: string,
    readonly indicatorValue: string,
    readonly severity: string,
    readonly source: string,
  ) {}
}

export class ThreatFeedSyncCompletedEvent implements DomainEvent {
  readonly eventType = 'ThreatFeedSyncCompleted';
  readonly occurredOn = new Date();

  constructor(
    readonly aggregateId: string,
    readonly feedSource: string,
    readonly indicatorsNew: number,
    readonly indicatorsUpdated: number,
  ) {}
}
