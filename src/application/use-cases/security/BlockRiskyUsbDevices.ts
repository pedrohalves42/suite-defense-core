import type { UsbDeviceRepository } from '@/application/ports/output/UsbDeviceRepository';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { DeviceType } from '@/domain/entities/UsbDevice';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { TenantId } from '@/domain/value-objects/TenantId';
import { Result } from '@/domain/shared/Result';
import { ApplicationError } from '@/domain/shared/ApplicationError';
import { UsbDeviceAutoBlockedEvent } from '@/domain/events/SecurityEvents';

export interface UsbBlockPolicy {
  riskThreshold: number;           // 0-100, block if risk >= this
  blockStorageDevices: boolean;    // auto-block all storage devices
  blockedVendorIds: string[];      // vendor IDs to block
  allowSerialNumbers: string[];    // whitelisted serial numbers
}

export interface BlockRiskyUsbInput {
  agentId: AgentId;
  tenantId: TenantId;
  policy: UsbBlockPolicy;
}

export interface BlockRiskyUsbOutput {
  devicesEvaluated: number;
  devicesBlocked: number;
  blockedDeviceIds: string[];
}

export class BlockRiskyUsbDevices {
  constructor(
    private readonly usbRepo: UsbDeviceRepository,
    private readonly eventDispatcher: DomainEventDispatcher,
  ) {}

  async execute(input: BlockRiskyUsbInput): Promise<Result<BlockRiskyUsbOutput, ApplicationError>> {
    const devices = await this.usbRepo.findByAgent(input.agentId);
    const blocked: string[] = [];

    for (const device of devices) {
      if (device.isBlocked) continue;

      // Check whitelist
      if (device.serialNumber && input.policy.allowSerialNumbers.includes(device.serialNumber)) {
        continue;
      }

      let shouldBlock = false;
      let reason = '';

      // Policy: block all storage devices
      if (input.policy.blockStorageDevices && device.deviceType === DeviceType.STORAGE) {
        shouldBlock = true;
        reason = 'Storage devices are blocked by policy';
      }

      // Policy: vendor blacklist
      if (device.vendorId && input.policy.blockedVendorIds.includes(device.vendorId)) {
        shouldBlock = true;
        reason = `Vendor ${device.vendorId} is blocked by policy`;
      }

      // Risk-based blocking
      if (!shouldBlock) {
        const riskScore = this.calculateRiskScore(device);
        if (riskScore >= input.policy.riskThreshold) {
          shouldBlock = true;
          reason = `Risk score ${riskScore} exceeds threshold ${input.policy.riskThreshold}`;
        }
      }

      if (shouldBlock) {
        device.block(reason);
        await this.usbRepo.save(device);
        blocked.push(device.deviceId);

        await this.eventDispatcher.dispatch(
          new UsbDeviceAutoBlockedEvent(
            device.id,
            device.agentId.value,
            device.deviceId,
            device.deviceType,
            reason,
          ),
        );
      }
    }

    return Result.success({
      devicesEvaluated: devices.length,
      devicesBlocked: blocked.length,
      blockedDeviceIds: blocked,
    });
  }

  private calculateRiskScore(device: { vendorId?: string; productId?: string; serialNumber?: string; deviceType: DeviceType; deviceName?: string }): number {
    let score = 0;

    if (!device.vendorId || !device.productId) score += 40;
    if (device.deviceType === DeviceType.STORAGE) score += 30;
    if (!device.serialNumber) score += 20;
    if (device.deviceName?.match(/hack|exploit|malware|rubber|ducky/i)) score += 50;

    return Math.min(score, 100);
  }
}
