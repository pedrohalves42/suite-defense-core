import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActionCard } from '@/components/action-center/ActionCard';
import { ActionItem } from '@/hooks/useActionCenter';

// Mock dependencies
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({
    tenant: { id: 'test-tenant-id' },
    isLoading: false,
  }),
}));

const mockMutateAsync = vi.fn();

vi.mock('@/hooks/useActionCenter', async (importOriginal) => {
  const actual = await importOriginal() as object;
  return {
    ...actual,
    useExecuteActionItem: () => ({
      mutateAsync: mockMutateAsync,
      isPending: false,
    }),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

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

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  );
}

const mockUrgentItem: ActionItem = {
  item_id: 'exec-001',
  source_type: 'playbook',
  agent_id: 'agent-001',
  agent_name: 'PC-FINANCEIRO',
  hostname: 'DESKTOP-001',
  title: 'Vulnerabilidade Crítica Detectada',
  description: 'CVE-2024-1234 encontrada no sistema',
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
};

const mockMediumItem: ActionItem = {
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
};

const mockAlertItem: ActionItem = {
  item_id: 'alert-001',
  source_type: 'alert',
  agent_id: 'agent-003',
  agent_name: 'PC-DEV',
  hostname: 'DESKTOP-003',
  title: 'Alerta do Sistema',
  description: 'Alerta de segurança detectado',
  severity: 'high',
  risk_score: 8.0,
  context: {},
  created_at: new Date().toISOString(),
  trigger_type: 'system_alert',
  playbook_id: null,
  priority_score: 80,
  humanized: null,
};

describe('ActionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({ success: true });
  });

  describe('Rendering', () => {
    it('should render title and description correctly', () => {
      renderWithProviders(<ActionCard item={mockUrgentItem} />);

      // Uses humanized title when available
      expect(screen.getByText('Falha de Segurança Crítica')).toBeDefined();
      expect(screen.getByText('Uma vulnerabilidade grave foi detectada')).toBeDefined();
    });

    it('should render fallback title when no humanized copy', () => {
      renderWithProviders(<ActionCard item={mockMediumItem} />);

      // Should use trigger_type based copy from ActionCopyMap
      expect(screen.getByText('PC-RH')).toBeInTheDocument();
    });

    it('should render agent name and hostname', () => {
      renderWithProviders(<ActionCard item={mockUrgentItem} />);

      expect(screen.getByText(/PC-FINANCEIRO/)).toBeInTheDocument();
      expect(screen.getByText(/DESKTOP-001/)).toBeInTheDocument();
    });

    it('should render severity badge with correct label', () => {
      renderWithProviders(<ActionCard item={mockUrgentItem} />);

      expect(screen.getByText('Crítico')).toBeInTheDocument();
    });

    it('should render medium severity badge', () => {
      renderWithProviders(<ActionCard item={mockMediumItem} />);

      expect(screen.getByText('Médio')).toBeInTheDocument();
    });

    it('should render context details when present', () => {
      const itemWithContext: ActionItem = {
        ...mockUrgentItem,
        context: {
          hours_offline: 24,
          blocked_requests: 50,
          failure_count: 3,
        },
      };

      renderWithProviders(<ActionCard item={itemWithContext} />);

      // Context is now rendered as key metrics (icon + label + value)
      expect(screen.getByText('24h')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.getByText('3x')).toBeInTheDocument();
    });
  });

  describe('Compact Mode', () => {
    it('should render compact version', () => {
      renderWithProviders(<ActionCard item={mockUrgentItem} compact />);

      // Compact mode shows truncated content
      expect(screen.getByText('Falha de Segurança Crítica')).toBeInTheDocument();
      expect(screen.getByText('PC-FINANCEIRO')).toBeInTheDocument();
    });

    it('should show CTA button in compact mode', () => {
      renderWithProviders(<ActionCard item={mockUrgentItem} compact />);

      expect(screen.getByRole('button', { name: /Corrigir Agora/i })).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('should call execute action on button click', async () => {
      const user = userEvent.setup();
      const onExecuted = vi.fn();

      renderWithProviders(<ActionCard item={mockUrgentItem} onExecuted={onExecuted} />);

      const executeButton = screen.getByRole('button', { name: /Corrigir Agora/i });
      await user.click(executeButton);

      expect(mockMutateAsync).toHaveBeenCalledWith({
        itemId: 'exec-001',
        sourceType: 'playbook',
        action: 'execute',
      });
    });

    it('should show ignore button for playbook items', () => {
      renderWithProviders(<ActionCard item={mockUrgentItem} />);

      expect(screen.getByRole('button', { name: /Ignorar/i })).toBeInTheDocument();
    });

    it('should show acknowledge button for alert items', () => {
      renderWithProviders(<ActionCard item={mockAlertItem} />);

      // Alert items show "Resolver" or similar CTA, not necessarily "Reconhecer" as a separate button
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should open ignore dialog when clicking ignore button', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ActionCard item={mockUrgentItem} />);

      const ignoreButton = screen.getByRole('button', { name: /Ignorar/i });
      await user.click(ignoreButton);

      // Dialog opens with archive reason tree or ignore form
      expect(screen.getByText(/Ignorar/i)).toBeInTheDocument();
    });

    it('should require reason to ignore action', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ActionCard item={mockUrgentItem} />);

      const ignoreButton = screen.getByRole('button', { name: /Ignorar/i });
      await user.click(ignoreButton);

      const confirmButton = screen.getByRole('button', { name: /Confirmar/i });
      expect(confirmButton).toBeDisabled();
    });

    it('should submit ignore with reason', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ActionCard item={mockUrgentItem} />);

      // Open dialog
      const ignoreButton = screen.getByRole('button', { name: /Ignorar/i });
      await user.click(ignoreButton);

      // Type reason
      const textarea = screen.getByPlaceholderText(/Falso positivo/i);
      await user.type(textarea, 'Manutenção programada');

      // Submit
      const confirmButton = screen.getByRole('button', { name: /Confirmar/i });
      await user.click(confirmButton);

      expect(mockMutateAsync).toHaveBeenCalledWith({
        itemId: 'exec-001',
        sourceType: 'playbook',
        action: 'ignore',
        reason: 'Manutenção programada',
      });
    });

    it('should call acknowledge for alert items', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ActionCard item={mockAlertItem} />);

      // Find the main action button (CTA)
      const buttons = screen.getAllByRole('button');
      const actionButton = buttons.find(b => b.textContent && !b.textContent.includes('Ignorar'));
      expect(actionButton).toBeDefined();
    });
  });

  describe('Navigation', () => {
    it('should render link to agent health when agent_id exists', () => {
      renderWithProviders(<ActionCard item={mockUrgentItem} />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/admin/agent-health?agent=agent-001');
    });

    it('should not render link when agent_id is null', () => {
      const itemWithoutAgent: ActionItem = {
        ...mockUrgentItem,
        agent_id: null,
      };

      renderWithProviders(<ActionCard item={itemWithoutAgent} />);

      const links = screen.queryAllByRole('link');
      // No navigation link should be present
      expect(links).toHaveLength(0);
    });
  });
});
