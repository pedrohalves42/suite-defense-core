import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';
import { Result } from '../shared/Result';
import { DomainError, InvalidArgumentError } from '../shared/DomainError';
import type { DomainEvent } from '../shared/DomainEvent';

// ── Enums ──

export enum DeviceType {
  STORAGE = 'storage',
  KEYBOARD = 'keyboard',
  MOUSE = 'mouse',
  OTHER = 'other',
}

// ── Domain Event ──

export class UsbDeviceBlockedEvent implements DomainEvent {
  readonly eventType = 'UsbDeviceBlocked';
  readonly occurredOn = new Date();

  constructor(
    readonly aggregateId: string,
    readonly agentId: string,
    readonly deviceId: string,
    readonly reason: string,
  ) {}
}

// ── Props ──

export interface UsbDeviceProps {
  id: string;
  agentId: AgentId;
  tenantId: TenantId;
  deviceId: string;
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
  deviceName?: string;
  deviceType: DeviceType;
  isBlocked: boolean;
  blockReason?: string;
  firstSeen: Date;
  lastSeen: Date;
  collectedAt: Date;
  createdAt: Date;
}

export interface CreateUsbDeviceProps {
  agentId: AgentId;
  tenantId: TenantId;
  deviceId: string;
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
  deviceName?: string;
  deviceType?: DeviceType;
}

// ── Entity ──

export class UsbDevice {
  private _domainEvents: DomainEvent[] = [];
  private props: UsbDeviceProps;

  private constructor(props: UsbDeviceProps) {
    this.props = props;
  }

  static create(input: CreateUsbDeviceProps): Result<UsbDevice, DomainError> {
    if (!input.deviceId) {
      return Result.failure(new InvalidArgumentError('UsbDevice', 'deviceId is required'));
    }

    return Result.success(new UsbDevice({
      id: crypto.randomUUID(),
      agentId: input.agentId,
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      vendorId: input.vendorId,
      productId: input.productId,
      serialNumber: input.serialNumber,
      deviceName: input.deviceName,
      deviceType: input.deviceType ?? DeviceType.OTHER,
      isBlocked: false,
      firstSeen: new Date(),
      lastSeen: new Date(),
      collectedAt: new Date(),
      createdAt: new Date(),
    }));
  }

  static reconstitute(props: UsbDeviceProps): UsbDevice {
    return new UsbDevice(props);
  }

  block(reason: string): void {
    this.props.isBlocked = true;
    this.props.blockReason = reason;
    this._domainEvents.push(new UsbDeviceBlockedEvent(
      this.props.id,
      this.props.agentId.value,
      this.props.deviceId,
      reason,
    ));
  }

  unblock(): void {
    this.props.isBlocked = false;
    this.props.blockReason = undefined;
  }

  updateLastSeen(): void {
    this.props.lastSeen = new Date();
  }

  get isStorageDevice(): boolean {
    return this.props.deviceType === DeviceType.STORAGE;
  }

  get id(): string { return this.props.id; }
  get agentId(): AgentId { return this.props.agentId; }
  get tenantId(): TenantId { return this.props.tenantId; }
  get deviceId(): string { return this.props.deviceId; }
  get vendorId(): string | undefined { return this.props.vendorId; }
  get productId(): string | undefined { return this.props.productId; }
  get serialNumber(): string | undefined { return this.props.serialNumber; }
  get deviceName(): string | undefined { return this.props.deviceName; }
  get deviceType(): DeviceType { return this.props.deviceType; }
  get isBlocked(): boolean { return this.props.isBlocked; }
  get blockReason(): string | undefined { return this.props.blockReason; }
  get firstSeen(): Date { return this.props.firstSeen; }
  get lastSeen(): Date { return this.props.lastSeen; }
  get collectedAt(): Date { return this.props.collectedAt; }
  get createdAt(): Date { return this.props.createdAt; }
  get domainEvents(): DomainEvent[] { return [...this._domainEvents]; }

  clearDomainEvents(): void { this._domainEvents = []; }
}
