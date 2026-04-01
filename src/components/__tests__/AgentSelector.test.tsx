import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentSelector } from '@/components/AgentSelector';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const mockUseActiveTenant = vi.fn();
vi.mock('@/hooks/useActiveTenant', () => ({
  useActiveTenant: () => mockUseActiveTenant(),
}));

const mockRpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('@/lib/agent-state-machine', () => ({
  deriveAgentState: () => 'healthy',
  getStateColorClasses: () => ({ bg: 'bg-green-500/10', text: 'text-green-500' }),
}));

const createWrapper = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AgentSelector', () => {
  it('shows skeleton while loading', () => {
    mockUseActiveTenant.mockReturnValue({ activeTenant: { id: 't1' }, loading: true });
    render(<AgentSelector value="" onValueChange={vi.fn()} />, { wrapper: createWrapper() });
    // When loading=true, query is disabled, showing skeleton
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows empty message when no agents', async () => {
    mockUseActiveTenant.mockReturnValue({ activeTenant: { id: 't1' }, loading: false });
    mockRpc.mockResolvedValue({ data: [], error: null });
    render(<AgentSelector value="" onValueChange={vi.fn()} />, { wrapper: createWrapper() });
    expect(await screen.findByText(/Nenhum computador encontrado/)).toBeInTheDocument();
  });

  it('shows error on RPC failure', async () => {
    mockUseActiveTenant.mockReturnValue({ activeTenant: { id: 't1' }, loading: false });
    mockRpc.mockResolvedValue({ data: null, error: new Error('RPC fail') });
    render(<AgentSelector value="" onValueChange={vi.fn()} />, { wrapper: createWrapper() });
    expect(await screen.findByText(/Erro ao carregar agentes/)).toBeInTheDocument();
  });
});
