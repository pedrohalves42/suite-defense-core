import { describe, it, expect } from 'vitest';
import { NetworkAnomaly, NetworkAnomalyType, AnomalySeverity } from '@/domain/entities/NetworkAnomaly';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';

const agentId = AgentId.create('agent-1').value;
const tenantId = TenantId.create('tenant-1').value;

const baseProps = () => ({
  agentId, tenantId,
  sourceIp: '192.168.1.1',
  destinationIp: '10.0.0.1',
  destinationPort: 443,
  protocol: 'TCP',
  bytesTransferred: 1000,
  isKnownMalicious: false,
  uniquePortsConnected: 5,
  isOutbound: false,
});

describe('NetworkAnomaly', () => {
  describe('detect()', () => {
    it('detects known malicious IP', () => {
      const r = NetworkAnomaly.detect({ ...baseProps(), isKnownMalicious: true });
      expect(r.isSuccess).toBe(true);
      expect(r.value.anomalyType).toBe(NetworkAnomalyType.KNOWN_MALICIOUS_IP);
      expect(r.value.severity).toBe(AnomalySeverity.CRITICAL);
    });

    it('detects port scanning', () => {
      const r = NetworkAnomaly.detect({ ...baseProps(), uniquePortsConnected: 150 });
      expect(r.value.anomalyType).toBe(NetworkAnomalyType.PORT_SCANNING);
      expect(r.value.severity).toBe(AnomalySeverity.HIGH);
    });

    it('detects data exfiltration', () => {
      const r = NetworkAnomaly.detect({
        ...baseProps(), isOutbound: true, bytesTransferred: 100_000_000,
      });
      expect(r.value.anomalyType).toBe(NetworkAnomalyType.DATA_EXFILTRATION);
      expect(r.value.severity).toBe(AnomalySeverity.CRITICAL);
    });

    it('detects high volume unusual port', () => {
      const r = NetworkAnomaly.detect({
        ...baseProps(), bytesTransferred: 2_000_000, destinationPort: 50000,
      });
      expect(r.value.anomalyType).toBe(NetworkAnomalyType.HIGH_VOLUME_UNUSUAL_PORT);
    });

    it('detects unusual protocol usage', () => {
      const r = NetworkAnomaly.detect({
        ...baseProps(), protocol: 'ICMP', bytesTransferred: 20_000,
      });
      expect(r.value.anomalyType).toBe(NetworkAnomalyType.UNUSUAL_PROTOCOL_USAGE);
    });

    it('defaults to unusual traffic pattern', () => {
      const r = NetworkAnomaly.detect(baseProps());
      expect(r.value.anomalyType).toBe(NetworkAnomalyType.UNUSUAL_TRAFFIC_PATTERN);
      expect(r.value.severity).toBe(AnomalySeverity.LOW);
    });
  });

  describe('shouldBlock()', () => {
    const policy = {
      blockThreshold: 80,
      monitorThreshold: 50,
      blockedAnomalyTypes: [NetworkAnomalyType.PORT_SCANNING],
    };

    it('always blocks known malicious IP', () => {
      const anomaly = NetworkAnomaly.detect({ ...baseProps(), isKnownMalicious: true }).value;
      expect(anomaly.shouldBlock(policy)).toBe(true);
    });

    it('blocks when confidence >= threshold', () => {
      const anomaly = NetworkAnomaly.detect({
        ...baseProps(), isKnownMalicious: true, bytesTransferred: 50_000_000,
      }).value;
      expect(anomaly.shouldBlock(policy)).toBe(true);
    });

    it('blocks configured anomaly types', () => {
      const anomaly = NetworkAnomaly.detect({ ...baseProps(), uniquePortsConnected: 150 }).value;
      expect(anomaly.shouldBlock(policy)).toBe(true);
    });

    it('does not block already blocked', () => {
      const anomaly = NetworkAnomaly.detect({ ...baseProps(), isKnownMalicious: true }).value;
      anomaly.block('test');
      expect(anomaly.shouldBlock(policy)).toBe(false);
    });
  });

  describe('block()', () => {
    it('sets blocked and reason', () => {
      const anomaly = NetworkAnomaly.detect(baseProps()).value;
      anomaly.block('Policy violation');
      expect(anomaly.blocked).toBe(true);
      expect(anomaly.blockReason).toBe('Policy violation');
    });
  });
});
