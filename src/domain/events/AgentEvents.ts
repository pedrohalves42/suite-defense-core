import type { DomainEvent } from '../shared/DomainEvent';

export class AgentEnrolledEvent implements DomainEvent {
  readonly eventType = 'agent.enrolled';
  readonly occurredOn = new Date();
  constructor(
    public readonly aggregateId: string,
    public readonly tenantId: string,
    public readonly agentName: string,
  ) {}
}

export class AgentActivatedEvent implements DomainEvent {
  readonly eventType = 'agent.activated';
  readonly occurredOn = new Date();
  constructor(
    public readonly aggregateId: string,
  ) {}
}

export class AgentDecommissionedEvent implements DomainEvent {
  readonly eventType = 'agent.decommissioned';
  readonly occurredOn = new Date();
  constructor(
    public readonly aggregateId: string,
    public readonly reason: string,
  ) {}
}

export class AgentHeartbeatReceivedEvent implements DomainEvent {
  readonly eventType = 'agent.heartbeat';
  readonly occurredOn = new Date();
  constructor(
    public readonly aggregateId: string,
    public readonly version: string | null,
  ) {}
}
