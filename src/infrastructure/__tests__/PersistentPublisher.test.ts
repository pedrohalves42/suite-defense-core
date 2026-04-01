/**
 * Tests for PersistentDomainEventPublisher and createDomainEventDispatcher factory.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DomainEvent } from '@/domain/shared/DomainEvent';

// Mock supabase client for PersistentDomainEventPublisher
const mockInvoke = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => mockInvoke(...args) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

import { PersistentDomainEventPublisher } from '../events/PersistentDomainEventPublisher';

const makeEvent = (type = 'agent.created', extras: Record<string, unknown> = {}): DomainEvent => ({
  eventType: type,
  aggregateId: crypto.randomUUID(),
  occurredOn: new Date(),
  ...extras,
});

describe('PersistentDomainEventPublisher', () => {
  let publisher: PersistentDomainEventPublisher;

  beforeEach(() => {
    vi.clearAllMocks();
    publisher = new PersistentDomainEventPublisher();
  });

  it('dispatch calls ops-gateway edge function', async () => {
    await publisher.dispatch(makeEvent());
    expect(mockInvoke).toHaveBeenCalledWith('ops-gateway', expect.objectContaining({
      body: expect.objectContaining({ action: 'sync:log-domain-event' }),
    }));
  });

  it('dispatch does not throw on invoke error', async () => {
    mockInvoke.mockResolvedValueOnce({ error: { message: 'invoke fail' } });
    await expect(publisher.dispatch(makeEvent())).resolves.toBeUndefined();
  });

  it('dispatch does not throw on unexpected error', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('network'));
    await expect(publisher.dispatch(makeEvent())).resolves.toBeUndefined();
  });

  it('dispatchAll skips empty array', async () => {
    await publisher.dispatchAll([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('dispatchAll sends batch', async () => {
    await publisher.dispatchAll([makeEvent('a'), makeEvent('b')]);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('dispatchAll does not throw on error', async () => {
    mockInvoke.mockResolvedValueOnce({ error: { message: 'batch fail' } });
    await expect(publisher.dispatchAll([makeEvent()])).resolves.toBeUndefined();
  });

  it('infers aggregate type from event type', async () => {
    await publisher.dispatch(makeEvent('job.completed'));
    const body = mockInvoke.mock.calls[0][1].body;
    expect(body.payload.aggregate_type).toBe('job');
  });

  it('infers agent aggregate type', async () => {
    await publisher.dispatch(makeEvent('agent.heartbeat'));
    const body = mockInvoke.mock.calls[0][1].body;
    expect(body.payload.aggregate_type).toBe('agent');
  });

  it('infers update aggregate type', async () => {
    await publisher.dispatch(makeEvent('update.deployed'));
    const body = mockInvoke.mock.calls[0][1].body;
    expect(body.payload.aggregate_type).toBe('update_package');
  });

  it('extracts tenantId from event (string)', async () => {
    await publisher.dispatch(makeEvent('agent.test', { tenantId: 'tenant-123' }));
    const body = mockInvoke.mock.calls[0][1].body;
    expect(body.payload.tenant_id).toBe('tenant-123');
  });

  it('extracts tenantId from event (value object)', async () => {
    await publisher.dispatch(makeEvent('agent.test', { tenantId: { value: 'vo-tenant' } }));
    const body = mockInvoke.mock.calls[0][1].body;
    expect(body.payload.tenant_id).toBe('vo-tenant');
  });

  it('handles missing tenantId', async () => {
    await publisher.dispatch(makeEvent('unknown.event'));
    const body = mockInvoke.mock.calls[0][1].body;
    expect(body.payload.tenant_id).toBeNull();
  });
});

// ── createDomainEventDispatcher factory ──────────────────────────
describe('createDomainEventDispatcher', () => {
  it('returns a singleton composite dispatcher', async () => {
    // Dynamically import to get the factory (after mocks are set)
    const { createDomainEventDispatcher } = await import('../events/createDomainEventDispatcher');
    const a = createDomainEventDispatcher();
    const b = createDomainEventDispatcher();
    expect(a).toBe(b); // singleton
  });
});
