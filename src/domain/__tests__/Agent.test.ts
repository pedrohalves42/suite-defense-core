import { describe, it, expect } from 'vitest';
import { Agent, AgentState, AgentStatus } from '../entities/Agent';
import { TenantId } from '../value-objects/TenantId';

const makeTenantId = () => TenantId.create(crypto.randomUUID()).value;

const makeAgent = (name = 'Test Agent') => {
  return Agent.create({
    tenantId: makeTenantId(),
    name,
    osType: 'windows',
  });
};

describe('Agent Entity', () => {
  describe('create', () => {
    it('creates with valid props', () => {
      const result = makeAgent();
      expect(result.isSuccess).toBe(true);
      expect(result.value.state).toBe(AgentState.ENROLLED);
      expect(result.value.status).toBe(AgentStatus.OFFLINE);
      expect(result.value.name).toBe('Test Agent');
    });

    it('trims name', () => {
      const result = makeAgent('  My Agent  ');
      expect(result.value.name).toBe('My Agent');
    });

    it('fails with empty name', () => {
      const result = makeAgent('');
      expect(result.isSuccess).toBe(false);
    });

    it('fails with whitespace-only name', () => {
      const result = makeAgent('   ');
      expect(result.isSuccess).toBe(false);
    });
  });

  describe('FSM transitions', () => {
    it('enrolled → active', () => {
      const agent = makeAgent().value;
      expect(agent.canTransitionTo(AgentState.ACTIVE)).toBe(true);
      const result = agent.transitionTo(AgentState.ACTIVE);
      expect(result.isSuccess).toBe(true);
      expect(agent.state).toBe(AgentState.ACTIVE);
    });

    it('enrolled → suspended', () => {
      const agent = makeAgent().value;
      expect(agent.transitionTo(AgentState.SUSPENDED).isSuccess).toBe(true);
    });

    it('enrolled → decommissioned is invalid', () => {
      const agent = makeAgent().value;
      expect(agent.canTransitionTo(AgentState.DECOMMISSIONED)).toBe(false);
      expect(agent.transitionTo(AgentState.DECOMMISSIONED).isSuccess).toBe(false);
    });

    it('decommissioned is terminal (no transitions out)', () => {
      const agent = makeAgent().value;
      agent.transitionTo(AgentState.ACTIVE);
      agent.transitionTo(AgentState.DECOMMISSIONED);
      expect(agent.isTerminal()).toBe(true);
      expect(agent.canTransitionTo(AgentState.ACTIVE)).toBe(false);
    });

    it('active → inactive → active round-trip', () => {
      const agent = makeAgent().value;
      agent.transitionTo(AgentState.ACTIVE);
      agent.transitionTo(AgentState.INACTIVE);
      expect(agent.state).toBe(AgentState.INACTIVE);
      agent.transitionTo(AgentState.ACTIVE);
      expect(agent.state).toBe(AgentState.ACTIVE);
    });

    it('emits AgentStateChangedEvent on transition', () => {
      const agent = makeAgent().value;
      agent.transitionTo(AgentState.ACTIVE);
      const events = agent.domainEvents;
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].eventType).toBe('AgentStateChanged');
    });
  });

  describe('heartbeat', () => {
    it('updateHeartbeat sets online', () => {
      const agent = makeAgent().value;
      expect(agent.status).toBe(AgentStatus.OFFLINE);
      agent.updateHeartbeat();
      expect(agent.status).toBe(AgentStatus.ONLINE);
    });

    it('markOffline sets offline', () => {
      const agent = makeAgent().value;
      agent.updateHeartbeat();
      agent.markOffline();
      expect(agent.status).toBe(AgentStatus.OFFLINE);
    });
  });

  describe('reconstitute', () => {
    it('reconstitutes from raw props', () => {
      const agent = Agent.reconstitute({
        id: crypto.randomUUID(),
        tenantId: crypto.randomUUID(),
        name: 'Reconstituted',
        osType: 'linux',
        state: 'active',
        status: 'online',
        lastSeen: new Date().toISOString(),
        version: '5.0.13',
        hmacSecret: 'a'.repeat(64),
      });
      expect(agent.name).toBe('Reconstituted');
      expect(agent.state).toBe(AgentState.ACTIVE);
      expect(agent.osType).toBe('linux');
    });
  });
});
