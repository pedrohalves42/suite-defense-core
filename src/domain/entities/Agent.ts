import { Entity } from '../shared/Entity';
import { AGENT_STATUS_THRESHOLDS } from '@/lib/agent-status-constants';
import { Result } from '../shared/Result';
import { DomainError, BusinessRuleViolationError } from '../shared/DomainError';
import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';
import { AgentVersion } from '../value-objects/AgentVersion';
import { HmacSecret } from '../value-objects/HmacSecret';
import { LightModeConfig } from './LightModeConfig';
import { AgentStateChangedEvent } from '../events/AgentEvents';

// ─── Agent Lifecycle States ─────────────────────────────
export enum AgentState {
  ENROLLED = 'enrolled',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  DECOMMISSIONED = 'decommissioned',
}

export enum AgentStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance',
}

export enum OsType {
  WINDOWS = 'windows',
  LINUX = 'linux',
  MACOS = 'macos',
}

// ─── FSM Transition Table ───────────────────────────────
const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  [AgentState.ENROLLED]: [AgentState.ACTIVE, AgentState.SUSPENDED],
  [AgentState.ACTIVE]: [AgentState.INACTIVE, AgentState.SUSPENDED, AgentState.DECOMMISSIONED],
  [AgentState.INACTIVE]: [AgentState.ACTIVE, AgentState.SUSPENDED, AgentState.DECOMMISSIONED],
  [AgentState.SUSPENDED]: [AgentState.ACTIVE, AgentState.DECOMMISSIONED],
  [AgentState.DECOMMISSIONED]: [],
};

// ─── Create Props ───────────────────────────────────────
export interface CreateAgentProps {
  tenantId: TenantId;
  name: string;
  osType: string;
  version?: AgentVersion;
}

// ─── Reconstitution Props ───────────────────────────────
export interface AgentProps {
  id: string;
  tenantId: string;
  name: string;
  osType: string;
  state: string;
  status: string;
  lastSeen: string | null;
  version: string | null;
  hmacSecret: string;
  lightModeConfig?: any;
}

/**
 * Agent entity (Aggregate Root).
 * Manages agent lifecycle through FSM transitions with domain event collection.
 */
export class Agent extends Entity<AgentId> {
  private _state: AgentState;
  private _status: AgentStatus;
  private _lastSeen: Date;
  private _version: AgentVersion;
  private _hmacSecret: HmacSecret;
  private _lightModeConfig: LightModeConfig | null;
  private _tenantId: TenantId;
  private _name: string;
  private _osType: string;

  private constructor(
    id: AgentId,
    tenantId: TenantId,
    name: string,
    osType: string,
    state: AgentState,
    status: AgentStatus,
    lastSeen: Date,
    version: AgentVersion,
    hmacSecret: HmacSecret
  ) {
    super(id);
    this._tenantId = tenantId;
    this._name = name;
    this._osType = osType;
    this._state = state;
    this._status = status;
    this._lastSeen = lastSeen;
    this._version = version;
    this._hmacSecret = hmacSecret;
    this._lightModeConfig = null;
  }

  static create(props: CreateAgentProps): Result<Agent, DomainError> {
    if (!props.name || props.name.trim().length === 0) {
      return Result.failure(new DomainError('Agent name is required'));
    }

    const agentId = AgentId.generate();
    const hmacSecret = HmacSecret.generate();

    return Result.success(new Agent(
      agentId,
      props.tenantId,
      props.name.trim(),
      props.osType,
      AgentState.ENROLLED,
      AgentStatus.OFFLINE,
      new Date(),
      props.version || AgentVersion.zero(),
      hmacSecret
    ));
  }

  static reconstitute(props: AgentProps): Agent {
    const agent = new Agent(
      AgentId.create(props.id).value,
      TenantId.create(props.tenantId).value,
      props.name,
      props.osType,
      props.state as AgentState,
      props.status as AgentStatus,
      new Date(props.lastSeen ?? Date.now()),
      props.version
        ? (AgentVersion.create(props.version).isSuccess
            ? AgentVersion.create(props.version).value
            : AgentVersion.zero())
        : AgentVersion.zero(),
      props.hmacSecret
        ? (HmacSecret.create(props.hmacSecret).isSuccess
            ? HmacSecret.create(props.hmacSecret).value
            : HmacSecret.generate())
        : HmacSecret.generate()
    );

    if (props.lightModeConfig) {
      agent._lightModeConfig = LightModeConfig.reconstitute(props.lightModeConfig);
    }

    return agent;
  }

  // ─── FSM Methods ────────────────────────────────────────

  canTransitionTo(newState: AgentState): boolean {
    return VALID_TRANSITIONS[this._state].includes(newState);
  }

  transitionTo(newState: AgentState): Result<void, DomainError> {
    if (!this.canTransitionTo(newState)) {
      return Result.failure(new DomainError(
        `Cannot transition from ${this._state} to ${newState}`
      ));
    }

    const oldState = this._state;
    this._state = newState;
    this.addDomainEvent(new AgentStateChangedEvent(this.id.value, oldState, newState));

    return Result.success(undefined);
  }

  // ─── Heartbeat & Status ─────────────────────────────────

  updateHeartbeat(): void {
    this._lastSeen = new Date();
    this._status = AgentStatus.ONLINE;
  }

  markOffline(): void {
    this._status = AgentStatus.OFFLINE;
  }

  isOffline(): boolean {
    const thresholdMs = AGENT_STATUS_THRESHOLDS.OFFLINE_MIN_MINUTES * 60 * 1000;
    const cutoff = new Date(Date.now() - thresholdMs);
    return this._lastSeen < cutoff;
  }

  // ─── Light Mode ─────────────────────────────────────────

  isInLightMode(): boolean {
    return this._lightModeConfig?.isActive ?? false;
  }

  activateLightMode(durationMinutes: number, reason: string): void {
    if (!this._lightModeConfig) {
      const configResult = LightModeConfig.create(this.id);
      if (configResult.isSuccess) {
        this._lightModeConfig = configResult.value;
      }
    }
    if (this._lightModeConfig) {
      this._lightModeConfig.activate(reason, []);
    }
  }

  deactivateLightMode(): void {
    if (this._lightModeConfig) {
      this._lightModeConfig.deactivate();
    }
  }

  // ─── Terminal State ─────────────────────────────────────

  isTerminal(): boolean {
    return this._state === AgentState.DECOMMISSIONED;
  }

  // ─── Getters ────────────────────────────────────────────

  get tenantId(): TenantId { return this._tenantId; }
  get name(): string { return this._name; }
  get osType(): string { return this._osType; }
  get state(): AgentState { return this._state; }
  get status(): AgentStatus { return this._status; }
  get lastSeen(): Date { return this._lastSeen; }
  get version(): AgentVersion { return this._version; }
  get hmacSecret(): HmacSecret { return this._hmacSecret; }
  get lightModeConfig(): LightModeConfig | null { return this._lightModeConfig; }
}
