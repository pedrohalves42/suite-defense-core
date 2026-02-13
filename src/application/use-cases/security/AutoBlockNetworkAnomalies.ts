import { Result } from '@/domain/shared/Result';
import { ApplicationError } from '@/domain/shared/ApplicationError';
import { NetworkAnomaly, type NetworkBlockPolicy, type DetectNetworkAnomalyProps } from '@/domain/entities/NetworkAnomaly';
import { NetworkAnomalyDetectedEvent } from '@/domain/events/SecurityEvents';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { TenantId } from '@/domain/value-objects/TenantId';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';

// ─── Port: Network Anomaly Repository ───────────────────

export interface NetworkAnomalyRepository {
  save(anomaly: NetworkAnomaly): Promise<void>;
}

// ─── Input/Output ───────────────────────────────────────

export interface AutoBlockNetworkInput {
  agentId: AgentId;
  tenantId: TenantId;
  connections: DetectNetworkAnomalyProps[];
  policy: NetworkBlockPolicy;
}

export interface AutoBlockNetworkOutput {
  connectionsAnalyzed: number;
  anomaliesDetected: number;
  blockedCount: number;
  monitoredCount: number;
  blockedConnections: string[];
}

// ─── Use Case ───────────────────────────────────────────

export class AutoBlockNetworkAnomalies {
  constructor(
    private readonly anomalyRepo: NetworkAnomalyRepository,
    private readonly eventDispatcher: DomainEventDispatcher,
  ) {}

  async execute(input: AutoBlockNetworkInput): Promise<Result<AutoBlockNetworkOutput, ApplicationError>> {
    const blocked: string[] = [];
    let monitored = 0;
    let anomaliesDetected = 0;

    for (const conn of input.connections) {
      const result = NetworkAnomaly.detect(conn);
      if (result.isFailure) continue;

      const anomaly = result.value;
      anomaliesDetected++;

      if (anomaly.shouldBlock(input.policy)) {
        anomaly.block(`Auto-block: ${anomaly.anomalyType} (confidence: ${anomaly.confidence}%)`);
        blocked.push(`${anomaly.destinationIp}:${anomaly.destinationPort}`);
      } else if (anomaly.confidence >= input.policy.monitorThreshold) {
        monitored++;
      }

      await this.anomalyRepo.save(anomaly);

      await this.eventDispatcher.dispatch(new NetworkAnomalyDetectedEvent(
        anomaly.id.value,
        input.agentId.value,
        `${anomaly.destinationIp}:${anomaly.destinationPort}`,
        anomaly.confidence / 100,
      ));
    }

    return Result.success({
      connectionsAnalyzed: input.connections.length,
      anomaliesDetected,
      blockedCount: blocked.length,
      monitoredCount: monitored,
      blockedConnections: blocked,
    });
  }
}
