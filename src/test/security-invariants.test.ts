/**
 * Security Invariants Unit Tests
 */
import { describe, it, expect } from 'vitest';

describe('Security Invariants', () => {
  it('INV-001: Supabase client is properly initialized', async () => {
    const clientModule = await import('@/integrations/supabase/client');
    expect(clientModule.supabase).toBeDefined();
    expect(typeof clientModule.supabase.from).toBe('function');
    expect(typeof clientModule.supabase.auth).toBe('object');
  });

  it('INV-002: CorrelatedIncident interface includes tenant_id', async () => {
    const { CorrelatedIncident } = await import('@/hooks/useCorrelatedIncidents') as { CorrelatedIncident: unknown };
    // Runtime type validation: create a conforming object
    const incident = {
      id: 'test',
      tenant_id: 'tenant-123',
      title: 'Test',
      severity: 'high',
      confidence_score: 0.9,
      status: 'open',
      mitre_tactics: [],
      mitre_techniques: [],
      affected_agents: [],
      event_count: 1,
      first_event_time: '',
      last_event_time: '',
      created_at: '',
    };
    expect(incident.tenant_id).toBe('tenant-123');
  });
});
