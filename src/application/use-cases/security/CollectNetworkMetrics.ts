import type { NetworkMetricsRepository } from '@/application/ports/output/NetworkMetricsRepository';
import type { AgentRepository } from '@/application/ports/output/AgentRepository';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { NetworkMetrics, type CreateNetworkMetricsProps } from '@/domain/entities/NetworkMetrics';
import type { AgentId } from '@/domain/value-objects/AgentId';
import { Result } from '@/domain/shared/Result';
import { ApplicationError } from '@/domain/shared/ApplicationError';
import { NetworkAnomalyDetectedEvent } from '@/domain/events/SecurityEvents';

export interface CollectNetworkMetricsInput {
  agentId: AgentId;
  interfaces: Array<{
    interfaceName: string;
    bytesSent: number;
    bytesReceived: number;
    packetsSent?: number;
    packetsReceived?: number;
    errorsSent?: number;
    errorsReceived?: number;
    connectionsActive?: number;
    connectionsListening?: number;
  }>;
}

export interface CollectNetworkMetricsOutput {
  metricsCollected: number;
  anomaliesDetected: number;
  highErrorInterfaces: string[];
}

export class CollectNetworkMetrics {
  constructor(
    private readonly metricsRepo: NetworkMetricsRepository,
    private readonly agentRepo: AgentRepository,
    private readonly eventDispatcher: DomainEventDispatcher,
  ) {}

  async execute(input: CollectNetworkMetricsInput): Promise<Result<CollectNetworkMetricsOutput, ApplicationError>> {
    const agent = await this.agentRepo.findById(input.agentId);
    if (!agent) {
      return Result.failure(new ApplicationError('Agent not found', 'AGENT_NOT_FOUND'));
    }

    const metrics: NetworkMetrics[] = [];
    const highErrorInterfaces: string[] = [];

    for (const iface of input.interfaces) {
      const createResult = NetworkMetrics.create({
        agentId: input.agentId,
        tenantId: agent.tenantId,
        interfaceName: iface.interfaceName,
        bytesSent: iface.bytesSent,
        bytesReceived: iface.bytesReceived,
        packetsSent: iface.packetsSent,
        packetsReceived: iface.packetsReceived,
        errorsSent: iface.errorsSent,
        errorsReceived: iface.errorsReceived,
        connectionsActive: iface.connectionsActive,
        connectionsListening: iface.connectionsListening,
      });

      if (createResult.isSuccess) {
        const m = createResult.value;
        metrics.push(m);

        // Detect high error rate anomaly
        if (m.hasHighErrorRate) {
          highErrorInterfaces.push(m.interfaceName);

          await this.eventDispatcher.dispatch(
            new NetworkAnomalyDetectedEvent(
              m.id,
              m.agentId.value,
              m.interfaceName,
              m.errorRate,
            ),
          );
        }
      }
    }

    if (metrics.length > 0) {
      await this.metricsRepo.saveBatch(metrics);
    }

    return Result.success({
      metricsCollected: metrics.length,
      anomaliesDetected: highErrorInterfaces.length,
      highErrorInterfaces,
    });
  }
}
