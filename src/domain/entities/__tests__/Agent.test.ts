import { describe, it, expect } from 'vitest';
import { Agent, AgentState, AgentStatus } from '../Agent';
import { TenantId } from '../../value-objects/TenantId';
import { AgentVersion } from '../../value-objects/AgentVersion';

function makeTenantId(): TenantId {
  return TenantId.create(crypto.randomUUID()).value;
}

describe('Agent Entity', () => {
  describe('create', () => {
    it('creates with valid data in ENROLLED state', () => {
      const result = Agent.create({
        tenantId: makeTenantId(),
        name: 'TestAgent',
        osType: 'windows',
      });

      expect(result.isSuccess).toBe(true);
      const agent = result.value;
      expect(agent.name).toBe('TestAgent');
      expect(agent.state).toBe(AgentState.ENROLLED);
      expect(agent.status).toBe(AgentStatus.OFFLINE);
      expect(agent.osType).toBe('windows');
    });

    it('rejects empty name', () => {
      const result = Agent.create({
        tenantId: makeTenantId(),
        name: '',
        osType: 'windows',
      });
      expect(result.isFailure).toBe(true);
    });

    it('trims name whitespace', () => {
      const result = Agent.create({
        tenantId: makeTenantId(),
        name: '  MyAgent  ',
        osType: 'linux',
      });
      expect(result.isSuccess).toBe(true);
      expect(result.value.name).toBe('MyAgent');
    });

    it('generates unique HMAC secret', () => {
      const a1 = Agent.create({ tenantId: makeTenantId(), name: 'A1', osType: 'windows' }).value;
      const a2 = Agent.create({ tenantId: makeTenantId(), name: 'A2', osType: 'windows' }).value;
      expect(a1.hmacSecret.value).not.toBe(a2.hmacSecret.value);
    });

    it('defaults version to 0.0.0', () => {
      const agent = Agent.create({
        tenantId: makeTenantId(),
        name: 'TestAgent',
        osType: 'windows',
      }).value;
      expect(agent.version.value).toBe('0.0.0');
    });

    it('accepts explicit version', () => {
      const version = AgentVersion.create('5.0.3').value;
      const agent = Agent.create({
        tenantId: makeTenantId(),
        name: 'TestAgent',
        osType: 'windows',
        version,
      }).value;
      expect(agent.version.value).toBe('5.0.3');
    });
  });

  describe('FSM transitions', () => {
    it('transitions ENROLLED → ACTIVE', () => {
      const agent = Agent.create({ tenantId: makeTenantId(), name: 'A', osType: 'windows' }).value;
      expect(agent.canTransitionTo(AgentState.ACTIVE)).toBe(true);
      const result = agent.transitionTo(AgentState.ACTIVE);
      expect(result.isSuccess).toBe(true);
      expect(agent.state).toBe(AgentState.ACTIVE);
    });

    it('transitions ACTIVE → INACTIVE', () => {
      const agent = Agent.create({ tenantId: makeTenantId(), name: 'A', osType: 'windows' }).value;
      agent.transitionTo(AgentState.ACTIVE);
      const result = agent.transitionTo(AgentState.INACTIVE);
      expect(result.isSuccess).toBe(true);
      expect(agent.state).toBe(AgentState.INACTIVE);
    });

    it('transitions ACTIVE → SUSPENDED', () => {
      const agent = Agent.create({ tenantId: makeTenantId(), name: 'A', osType: 'windows' }).value;
      agent.transitionTo(AgentState.ACTIVE);
      expect(agent.canTransitionTo(AgentState.SUSPENDED)).toBe(true);
      agent.transitionTo(AgentState.SUSPENDED);
      expect(agent.state).toBe(AgentState.SUSPENDED);
    });

    it('transitions SUSPENDED → DECOMMISSIONED', () => {
      const agent = Agent.create({ tenantId: makeTenantId(), name: 'A', osType: 'windows' }).value;
      agent.transitionTo(AgentState.ACTIVE);
      agent.transitionTo(AgentState.SUSPENDED);
      agent.transitionTo(AgentState.DECOMMISSIONED);
      expect(agent.state).toBe(AgentState.DECOMMISSIONED);
      expect(agent.isTerminal()).toBe(true);
    });

    it('rejects ENROLLED → DECOMMISSIONED (invalid)', () => {
      const agent = Agent.create({ tenantId: makeTenantId(), name: 'A', osType: 'windows' }).value;
      expect(agent.canTransitionTo(AgentState.DECOMMISSIONED)).toBe(false);
      const result = agent.transitionTo(AgentState.DECOMMISSIONED);
      expect(result.isFailure).toBe(true);
      expect(agent.state).toBe(AgentState.ENROLLED);
    });

    it('rejects transitions from DECOMMISSIONED', () => {
      const agent = Agent.create({ tenantId: makeTenantId(), name: 'A', osType: 'windows' }).value;
      agent.transitionTo(AgentState.ACTIVE);
      agent.transitionTo(AgentState.DECOMMISSIONED);
      const result = agent.transitionTo(AgentState.ACTIVE);
      expect(result.isFailure).toBe(true);
    });

    it('records domain events on transitions', () => {
      const agent = Agent.create({ tenantId: makeTenantId(), name: 'A', osType: 'windows' }).value;
      agent.transitionTo(AgentState.ACTIVE);
      expect(agent.domainEvents.length).toBe(1);
      expect(agent.domainEvents[0].eventType).toBe('agent.state_changed');
    });
  });

  describe('heartbeat & status', () => {
    it('marks agent as online on heartbeat', () => {
      const agent = Agent.create({ tenantId: makeTenantId(), name: 'A', osType: 'windows' }).value;
      expect(agent.status).toBe(AgentStatus.OFFLINE);
      agent.updateHeartbeat();
      expect(agent.status).toBe(AgentStatus.ONLINE);
    });

    it('detects offline agents (no recent heartbeat)', () => {
      const agent = Agent.create({ tenantId: makeTenantId(), name: 'A', osType: 'windows' }).value;
      // last_seen is set to creation time, which is "now", so not offline yet
      expect(agent.isOffline()).toBe(false);
    });

    it('markOffline sets status', () => {
      const agent = Agent.create({ tenantId: makeTenantId(), name: 'A', osType: 'windows' }).value;
      agent.updateHeartbeat();
      expect(agent.status).toBe(AgentStatus.ONLINE);
      agent.markOffline();
      expect(agent.status).toBe(AgentStatus.OFFLINE);
    });
  });

  describe('reconstitute', () => {
    it('reconstitutes from DB props', () => {
      const agent = Agent.reconstitute({
        id: crypto.randomUUID(),
        tenantId: crypto.randomUUID(),
        name: 'ReconAgent',
        osType: 'linux',
        state: 'active',
        status: 'online',
        lastSeen: new Date().toISOString(),
        version: '5.0.3',
        hmacSecret: 'a'.repeat(64),
      });

      expect(agent.name).toBe('ReconAgent');
      expect(agent.state).toBe(AgentState.ACTIVE);
      expect(agent.status).toBe(AgentStatus.ONLINE);
      expect(agent.version.value).toBe('5.0.3');
    });
  });

  describe('equality', () => {
    it('agents with same id are equal', () => {
      const id = crypto.randomUUID();
      const a1 = Agent.reconstitute({ id, tenantId: crypto.randomUUID(), name: 'A', osType: 'windows', state: 'enrolled', status: 'offline', lastSeen: null, version: null, hmacSecret: 'a'.repeat(64) });
      const a2 = Agent.reconstitute({ id, tenantId: crypto.randomUUID(), name: 'B', osType: 'linux', state: 'active', status: 'online', lastSeen: null, version: '1.0.0', hmacSecret: 'b'.repeat(64) });
      expect(a1.equals(a2)).toBe(true);
    });
  });
});
