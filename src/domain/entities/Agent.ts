import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';
import { AgentVersion } from '../value-objects/AgentVersion';
import { BusinessRuleViolationError } from '../shared/DomainError';

// ─── Agent Lifecycle States ─────────────────────────────
export enum AgentLifecycleState {
  ENROLLED = 'enrolled',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  DECOMMISSIONED = 'decommissioned',
}

export enum AgentStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  DEGRADED = 'degraded',
}

export enum OsType {
  WINDOWS = 'windows',
  LINUX = 'linux',
  MACOS = 'macos',
}

// ─── FSM Transition Table ───────────────────────────────
const LIFECYCLE_TRANSITIONS: Record<AgentLifecycleState, AgentLifecycleState[]> = {
  [AgentLifecycleState.ENROLLED]: [AgentLifecycleState.ACTIVE, AgentLifecycleState.DECOMMISSIONED],
  [AgentLifecycleState.ACTIVE]: [AgentLifecycleState.INACTIVE, AgentLifecycleState.SUSPENDED, AgentLifecycleState.DECOMMISSIONED],
  [AgentLifecycleState.INACTIVE]: [AgentLifecycleState.ACTIVE, AgentLifecycleState.SUSPENDED, AgentLifecycleState.DECOMMISSIONED],
  [AgentLifecycleState.SUSPENDED]: [AgentLifecycleState.ACTIVE, AgentLifecycleState.DECOMMISSIONED],
  [AgentLifecycleState.DECOMMISSIONED]: [],
};

// ─── Agent Props ────────────────────────────────────────
export interface AgentProps {
  id: AgentId;
  tenantId: TenantId;
  name: string;
  osType: OsType;
  state: AgentLifecycleState;
  status: AgentStatus;
  version: AgentVersion | null;
  lastHeartbeatAt: Date | null;
  hmacSecret: string | null;
  lightModeEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Heartbeat Threshold ────────────────────────────────
const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Agent entity (Aggregate Root).
 * Manages agent lifecycle through FSM transitions and domain invariants.
 */
export class Agent {
  private props: AgentProps;

  private constructor(props: AgentProps) {
    this.props = props;
  }

  /**
   * Factory: Create a new agent upon enrollment.
   */
  static create(params: {
    tenantId: TenantId;
    name: string;
    osType: OsType;
    hmacSecret?: string | null;
  }): Agent {
    if (!params.name || params.name.trim().length === 0) {
      throw new BusinessRuleViolationError('Agent name cannot be empty');
    }

    return new Agent({
      id: AgentId.generate(),
      tenantId: params.tenantId,
      name: params.name.trim(),
      osType: params.osType,
      state: AgentLifecycleState.ENROLLED,
      status: AgentStatus.OFFLINE,
      version: null,
      lastHeartbeatAt: null,
      hmacSecret: params.hmacSecret ?? null,
      lightModeEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * Reconstitute from persistence.
   */
  static reconstitute(props: AgentProps): Agent {
    return new Agent(props);
  }

  // ─── Getters ────────────────────────────────────────────
  get id(): AgentId { return this.props.id; }
  get tenantId(): TenantId { return this.props.tenantId; }
  get name(): string { return this.props.name; }
  get osType(): OsType { return this.props.osType; }
  get state(): AgentLifecycleState { return this.props.state; }
  get status(): AgentStatus { return this.props.status; }
  get version(): AgentVersion | null { return this.props.version; }
  get lastHeartbeatAt(): Date | null { return this.props.lastHeartbeatAt; }
  get hmacSecret(): string | null { return this.props.hmacSecret; }
  get lightModeEnabled(): boolean { return this.props.lightModeEnabled; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  // ─── FSM Methods ────────────────────────────────────────

  /**
   * Check if a lifecycle transition is allowed.
   */
  canTransitionTo(newState: AgentLifecycleState): boolean {
    return LIFECYCLE_TRANSITIONS[this.props.state].includes(newState);
  }

  /**
   * Transition to a new lifecycle state (with validation).
   */
  transitionTo(newState: AgentLifecycleState): void {
    if (!this.canTransitionTo(newState)) {
      throw new BusinessRuleViolationError(
        `Cannot transition agent from ${this.props.state} to ${newState}`
      );
    }
    this.props.state = newState;
    this.props.updatedAt = new Date();
  }

  /**
   * Activate the agent (from enrolled or inactive).
   */
  activate(): void {
    this.transitionTo(AgentLifecycleState.ACTIVE);
    this.props.status = AgentStatus.ONLINE;
  }

  /**
   * Suspend the agent (admin action).
   */
  suspend(): void {
    this.transitionTo(AgentLifecycleState.SUSPENDED);
  }

  /**
   * Decommission the agent (terminal state).
   */
  decommission(): void {
    this.transitionTo(AgentLifecycleState.DECOMMISSIONED);
    this.props.status = AgentStatus.OFFLINE;
  }

  // ─── Heartbeat & Status ─────────────────────────────────

  /**
   * Determine if agent is offline based on last heartbeat.
   */
  isOffline(now: Date = new Date()): boolean {
    if (!this.props.lastHeartbeatAt) return true;
    return now.getTime() - this.props.lastHeartbeatAt.getTime() > OFFLINE_THRESHOLD_MS;
  }

  /**
   * Record a heartbeat from the agent.
   */
  recordHeartbeat(version?: AgentVersion): void {
    if (this.props.state === AgentLifecycleState.DECOMMISSIONED) {
      throw new BusinessRuleViolationError('Cannot record heartbeat for decommissioned agent');
    }

    this.props.lastHeartbeatAt = new Date();
    this.props.status = AgentStatus.ONLINE;
    this.props.updatedAt = new Date();

    if (version) {
      this.props.version = version;
    }

    // Auto-activate enrolled agents on first heartbeat
    if (this.props.state === AgentLifecycleState.ENROLLED) {
      this.props.state = AgentLifecycleState.ACTIVE;
    }

    // Re-activate inactive agents on heartbeat
    if (this.props.state === AgentLifecycleState.INACTIVE) {
      this.props.state = AgentLifecycleState.ACTIVE;
    }
  }

  /**
   * Mark agent as degraded (partial functionality).
   */
  markDegraded(): void {
    if (this.props.state === AgentLifecycleState.DECOMMISSIONED) return;
    this.props.status = AgentStatus.DEGRADED;
    this.props.updatedAt = new Date();
  }

  /**
   * Evaluate and update offline status based on heartbeat threshold.
   */
  evaluateConnectivity(now: Date = new Date()): void {
    if (this.isOffline(now) && this.props.status !== AgentStatus.OFFLINE) {
      this.props.status = AgentStatus.OFFLINE;
      if (this.props.state === AgentLifecycleState.ACTIVE) {
        this.props.state = AgentLifecycleState.INACTIVE;
      }
      this.props.updatedAt = new Date();
    }
  }

  // ─── Light Mode ─────────────────────────────────────────

  enableLightMode(): void {
    this.props.lightModeEnabled = true;
    this.props.updatedAt = new Date();
  }

  disableLightMode(): void {
    this.props.lightModeEnabled = false;
    this.props.updatedAt = new Date();
  }

  // ─── Terminal State Check ─────────────────────────────
  isTerminal(): boolean {
    return this.props.state === AgentLifecycleState.DECOMMISSIONED;
  }
}
