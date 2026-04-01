import { describe, it, expect } from 'vitest';
import { CpuMetrics, MemoryMetrics, DiskMetrics, HardwareMetrics } from '@/domain/entities/HardwareMetrics';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';

const agentId = AgentId.create('agent-1').value;
const tenantId = TenantId.create('tenant-1').value;

describe('HardwareMetrics', () => {
  describe('CpuMetrics', () => {
    it('creates valid CPU metrics', () => {
      const r = CpuMetrics.create({ usagePercent: 50, cores: 4 });
      expect(r.isSuccess).toBe(true);
      expect(r.value.isCritical).toBe(false);
      expect(r.value.isWarning).toBe(false);
    });

    it('detects critical CPU', () => {
      expect(CpuMetrics.create({ usagePercent: 95, cores: 4 }).value.isCritical).toBe(true);
    });

    it('detects warning CPU', () => {
      expect(CpuMetrics.create({ usagePercent: 80, cores: 4 }).value.isWarning).toBe(true);
    });

    it('fails with invalid usage', () => {
      expect(CpuMetrics.create({ usagePercent: -1, cores: 4 }).isFailure).toBe(true);
      expect(CpuMetrics.create({ usagePercent: 101, cores: 4 }).isFailure).toBe(true);
    });

    it('fails with 0 cores', () => {
      expect(CpuMetrics.create({ usagePercent: 50, cores: 0 }).isFailure).toBe(true);
    });
  });

  describe('MemoryMetrics', () => {
    it('creates valid memory metrics', () => {
      const r = MemoryMetrics.create({ totalGb: 16, usedGb: 8, freeGb: 8, usagePercent: 50 });
      expect(r.isSuccess).toBe(true);
    });

    it('fails with invalid usage', () => {
      expect(MemoryMetrics.create({ totalGb: 16, usedGb: 8, freeGb: 8, usagePercent: 101 }).isFailure).toBe(true);
    });

    it('fails with negative total', () => {
      expect(MemoryMetrics.create({ totalGb: -1, usedGb: 0, freeGb: 0, usagePercent: 0 }).isFailure).toBe(true);
    });
  });

  describe('HardwareMetrics entity', () => {
    const createMetrics = (cpuUsage = 50, memUsage = 50, diskUsage = 50) => {
      const cpu = CpuMetrics.create({ usagePercent: cpuUsage, cores: 4 }).value;
      const mem = MemoryMetrics.create({ totalGb: 16, usedGb: 8, freeGb: 8, usagePercent: memUsage }).value;
      const disk = DiskMetrics.create({ totalGb: 500, usedGb: 250, freeGb: 250, usagePercent: diskUsage }).value;
      return HardwareMetrics.create(agentId, tenantId, cpu, mem, disk, 3600, 'Windows 10', 'PC-01');
    };

    it('creates successfully', () => {
      const r = createMetrics();
      expect(r.isSuccess).toBe(true);
      expect(r.value.hostname).toBe('PC-01');
    });

    it('calculates health score', () => {
      const hw = createMetrics(50, 50, 50).value;
      // (50*0.4 + 50*0.35 + 50*0.25) = 50
      expect(hw.healthScore).toBe(50);
    });

    it('detects critical metrics', () => {
      expect(createMetrics(95, 50, 50).value.hasCriticalMetrics).toBe(true);
    });

    it('detects warning metrics', () => {
      expect(createMetrics(80, 50, 50).value.hasWarningMetrics).toBe(true);
    });

    it('no warnings for low usage', () => {
      const hw = createMetrics(30, 30, 30).value;
      expect(hw.hasCriticalMetrics).toBe(false);
      expect(hw.hasWarningMetrics).toBe(false);
    });

    it('fails with negative uptime', () => {
      const cpu = CpuMetrics.create({ usagePercent: 50, cores: 4 }).value;
      const mem = MemoryMetrics.create({ totalGb: 16, usedGb: 8, freeGb: 8, usagePercent: 50 }).value;
      const disk = DiskMetrics.create({ totalGb: 500, usedGb: 250, freeGb: 250, usagePercent: 50 }).value;
      expect(HardwareMetrics.create(agentId, tenantId, cpu, mem, disk, -1, 'Win', 'PC').isFailure).toBe(true);
    });
  });
});
