import { describe, it, expect } from 'vitest';
import { CorrelatedIncident, IncidentEvent } from '@/hooks/useCorrelatedIncidents';

describe('useCorrelatedIncidents types', () => {
  it('CorrelatedIncident interface has required tenant_id field', () => {
    const incident: CorrelatedIncident = {
      id: 'test-id',
      tenant_id: 'tenant-123',
      title: 'Test Incident',
      severity: 'high',
      confidence_score: 0.95,
      status: 'open',
      mitre_tactics: ['TA0001'],
      mitre_techniques: ['T1566'],
      affected_agents: ['agent-1'],
      event_count: 5,
      first_event_time: '2026-01-01T00:00:00Z',
      last_event_time: '2026-01-01T01:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    };
    expect(incident.tenant_id).toBe('tenant-123');
    expect(incident.severity).toBe('high');
  });

  it('IncidentEvent has required fields for tenant isolation', () => {
    const event: IncidentEvent = {
      id: 'event-1',
      incident_id: 'inc-1',
      event_type: 'aggregated_event',
      event_summary: 'Burst detected',
      event_time: '2026-01-01T00:00:00Z',
      agent_id: 'agent-1',
      severity: 'critical',
      event_data: { count: 150, burst_type: 'possible_ransomware_burst' },
    };
    expect(event.event_type).toBe('aggregated_event');
    expect(event.event_data.count).toBe(150);
  });
});
