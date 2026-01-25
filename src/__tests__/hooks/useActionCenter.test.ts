import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Create mock functions before vi.mock calls
const mockInvoke = vi.fn();
const mockRemoveChannel = vi.fn();

// Create a chainable channel mock
function createMockChannel() {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {};
  mock.on = vi.fn(() => mock);
  mock.subscribe = vi.fn(() => mock);
  return mock;
}

const mockChannel = createMockChannel();

// Mock dependencies
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({
    tenant: { id: 'test-tenant-id' },
    loading: false,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (name: string, options: unknown) => mockInvoke(name, options),
    },
    channel: () => mockChannel,
    removeChannel: (channel: unknown) => mockRemoveChannel(channel),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { useActionCenter, useExecuteActionItem, useActionCenterCount, ActionCenterFeed } from '@/hooks/useActionCenter';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockFeedData: ActionCenterFeed = {
  urgent: [
    {
      item_id: 'exec-001',
      source_type: 'playbook',
      agent_id: 'agent-001',
      agent_name: 'PC-FINANCEIRO',
      hostname: 'DESKTOP-001',
      title: 'Vulnerabilidade Crítica Detectada',
      description: 'CVE-2024-1234 encontrada',
      severity: 'critical',
      risk_score: 9.5,
      context: { vulnerability_type: 'CVE-2024-1234' },
      created_at: new Date().toISOString(),
      trigger_type: 'vulnerability_critical',
      playbook_id: 'playbook-001',
      priority_score: 100,
      humanized: {
        title: 'Falha de Segurança Crítica',
        description: 'Uma vulnerabilidade grave foi detectada',
        cta: 'Corrigir Agora',
      },
    },
  ],
  recommended: [
    {
      item_id: 'exec-002',
      source_type: 'playbook',
      agent_id: 'agent-002',
      agent_name: 'PC-RH',
      hostname: 'DESKTOP-002',
      title: 'Processo Suspeito',
      description: 'Processo desconhecido detectado',
      severity: 'medium',
      risk_score: 6.0,
      context: { process_name: 'unknown.exe' },
      created_at: new Date().toISOString(),
      trigger_type: 'suspicious_process',
      playbook_id: 'playbook-002',
      priority_score: 60,
      humanized: null,
    },
  ],
  informational: [
    {
      item_id: 'exec-003',
      source_type: 'playbook',
      agent_id: 'agent-003',
      agent_name: 'PC-DEV',
      hostname: 'DESKTOP-003',
      title: 'Auditoria Semanal',
      description: 'Verificação periódica concluída',
      severity: 'low',
      risk_score: 2.0,
      context: { audit_type: 'security_scan' },
      created_at: new Date().toISOString(),
      trigger_type: 'weekly_audit',
      playbook_id: 'playbook-003',
      priority_score: 20,
      humanized: null,
    },
  ],
  healthy_count: 15,
  offline_count: 0,
  total_agents: 15,
  generated_at: new Date().toISOString(),
};

describe('useActionCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should fetch action center feed successfully', async () => {
    mockInvoke.mockResolvedValue({ data: mockFeedData, error: null });

    const { result } = renderHook(() => useActionCenter(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockFeedData);
    expect(mockInvoke).toHaveBeenCalledWith('action-center-feed', {
      method: 'GET',
      headers: {
        'x-tenant-id': 'test-tenant-id',
      },
    });
  });

  it('should handle empty feed response', async () => {
    const emptyFeed: ActionCenterFeed = {
      urgent: [],
      recommended: [],
      informational: [],
      healthy_count: 10,
      offline_count: 0,
      total_agents: 10,
      generated_at: new Date().toISOString(),
    };

    mockInvoke.mockResolvedValue({ data: emptyFeed, error: null });

    const { result } = renderHook(() => useActionCenter(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.urgent).toHaveLength(0);
    expect(result.current.data?.recommended).toHaveLength(0);
    expect(result.current.data?.informational).toHaveLength(0);
    expect(result.current.data?.healthy_count).toBe(10);
  });

  it('should handle fetch error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('Network error') });

    const { result } = renderHook(() => useActionCenter(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('should categorize items correctly', async () => {
    mockInvoke.mockResolvedValue({ data: mockFeedData, error: null });

    const { result } = renderHook(() => useActionCenter(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.urgent).toHaveLength(1);
    expect(result.current.data?.urgent[0].severity).toBe('critical');
    expect(result.current.data?.recommended).toHaveLength(1);
    expect(result.current.data?.recommended[0].severity).toBe('medium');
    expect(result.current.data?.informational).toHaveLength(1);
    expect(result.current.data?.informational[0].severity).toBe('low');
  });

  it('should setup realtime subscription', async () => {
    mockInvoke.mockResolvedValue({ data: mockFeedData, error: null });

    renderHook(() => useActionCenter(), {
      wrapper: createWrapper(),
    });

    // Verify channel subscription is set up
    expect(mockChannel.on).toHaveBeenCalled();
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });
});

describe('useExecuteActionItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute action successfully', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });

    const { result } = renderHook(() => useExecuteActionItem(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      itemId: 'exec-001',
      sourceType: 'playbook',
      action: 'execute',
    });

    expect(mockInvoke).toHaveBeenCalledWith('action-center-feed', {
      method: 'POST',
      headers: {
        'x-tenant-id': 'test-tenant-id',
      },
      body: {
        item_id: 'exec-001',
        source_type: 'playbook',
        action: 'execute',
        reason: undefined,
      },
    });
  });

  it('should ignore action with reason', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });

    const { result } = renderHook(() => useExecuteActionItem(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      itemId: 'exec-001',
      sourceType: 'playbook',
      action: 'ignore',
      reason: 'Falso positivo',
    });

    expect(mockInvoke).toHaveBeenCalledWith('action-center-feed', {
      method: 'POST',
      headers: {
        'x-tenant-id': 'test-tenant-id',
      },
      body: {
        item_id: 'exec-001',
        source_type: 'playbook',
        action: 'ignore',
        reason: 'Falso positivo',
      },
    });
  });

  it('should acknowledge alert', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });

    const { result } = renderHook(() => useExecuteActionItem(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      itemId: 'alert-001',
      sourceType: 'alert',
      action: 'acknowledge',
    });

    expect(mockInvoke).toHaveBeenCalledWith('action-center-feed', {
      method: 'POST',
      headers: {
        'x-tenant-id': 'test-tenant-id',
      },
      body: {
        item_id: 'alert-001',
        source_type: 'alert',
        action: 'acknowledge',
        reason: undefined,
      },
    });
  });

  it('should handle mutation error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('Execution failed') });

    const { result } = renderHook(() => useExecuteActionItem(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({
        itemId: 'exec-001',
        sourceType: 'playbook',
        action: 'execute',
      })
    ).rejects.toThrow('Execution failed');
  });
});

describe('useActionCenterCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return correct counts', async () => {
    mockInvoke.mockResolvedValue({ data: mockFeedData, error: null });

    const { result } = renderHook(() => useActionCenterCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.urgentCount).toBe(1);
    });

    expect(result.current.urgentCount).toBe(1);
    expect(result.current.recommendedCount).toBe(1);
    expect(result.current.totalCount).toBe(2);
  });

  it('should return zero counts when no data', async () => {
    const emptyFeed: ActionCenterFeed = {
      urgent: [],
      recommended: [],
      informational: [],
      healthy_count: 0,
      offline_count: 0,
      total_agents: 0,
      generated_at: new Date().toISOString(),
    };
    mockInvoke.mockResolvedValue({ data: emptyFeed, error: null });

    const { result } = renderHook(() => useActionCenterCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.urgentCount).toBe(0);
    });

    expect(result.current.urgentCount).toBe(0);
    expect(result.current.recommendedCount).toBe(0);
    expect(result.current.totalCount).toBe(0);
  });
});
