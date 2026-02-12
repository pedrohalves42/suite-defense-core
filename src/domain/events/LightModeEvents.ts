import type { DomainEvent } from '../shared/DomainEvent';

export class LightModeActivatedEvent implements DomainEvent {
  readonly eventType = 'lightmode.activated';
  readonly occurredOn = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly agentId: string,
    public readonly mediaProcesses: string[],
    public readonly cpuPercent: number,
    public readonly networkMbps: number,
    public readonly durationMinutes: number
  ) {}
}

export class LightModeDeactivatedEvent implements DomainEvent {
  readonly eventType = 'lightmode.deactivated';
  readonly occurredOn = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly agentId: string,
    public readonly reason: 'expired' | 'manual' | 'conditions_cleared'
  ) {}
}

export class LightModeEvaluatedEvent implements DomainEvent {
  readonly eventType = 'lightmode.evaluated';
  readonly occurredOn = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly agentId: string,
    public readonly shouldActivate: boolean,
    public readonly cpuPercent: number,
    public readonly networkMbps: number,
    public readonly mediaProcessCount: number
  ) {}
}
