import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DashboardErrorBoundary } from '@/components/dashboard/DashboardErrorBoundary';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import { TenantErrorBoundary } from '@/components/TenantErrorBoundary';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

// Suppress React error boundary console output
const originalError = console.error;
beforeEach(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Error: Uncaught')) return;
    if (typeof args[0] === 'string' && args[0].includes('The above error')) return;
    originalError.apply(console, args);
  };
  return () => { console.error = originalError; };
});

const ThrowingChild = ({ message = 'Test error' }: { message?: string }) => {
  throw new Error(message);
};

const SafeChild = () => <div data-testid="safe">OK</div>;

// ===== ErrorBoundary (Global) =====
describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(<ErrorBoundary><SafeChild /></ErrorBoundary>);
    expect(screen.getByTestId('safe')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument();
  });

  it('shows reload and go home buttons', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('Recarregar')).toBeInTheDocument();
    expect(screen.getByText('Voltar ao Inicio')).toBeInTheDocument();
  });

  it('calls window.location.reload on Recarregar click', () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock, href: '' },
      writable: true,
    });
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByText('Recarregar'));
    expect(reloadMock).toHaveBeenCalled();
  });

  it('navigates home on Voltar ao Inicio click', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: '/dashboard' },
      writable: true,
    });
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByText('Voltar ao Inicio'));
    expect(window.location.href).toBe('/');
  });

  it('shows error details in DEV mode', () => {
    // import.meta.env.DEV is true in test
    render(
      <ErrorBoundary>
        <ThrowingChild message="specific-error-msg" />
      </ErrorBoundary>
    );
    expect(screen.getByText(/specific-error-msg/)).toBeInTheDocument();
  });
});

// ===== DashboardErrorBoundary =====
describe('DashboardErrorBoundary', () => {
  it('renders children when no error', () => {
    render(<DashboardErrorBoundary section="test"><SafeChild /></DashboardErrorBoundary>);
    expect(screen.getByTestId('safe')).toBeInTheDocument();
  });

  it('renders error card with section name', () => {
    render(
      <DashboardErrorBoundary section="métricas">
        <ThrowingChild />
      </DashboardErrorBoundary>
    );
    expect(screen.getByText(/Erro ao carregar métricas/)).toBeInTheDocument();
  });

  it('renders default section text when not provided', () => {
    render(
      <DashboardErrorBoundary>
        <ThrowingChild />
      </DashboardErrorBoundary>
    );
    expect(screen.getByText(/esta seção/)).toBeInTheDocument();
  });

  it('shows error message', () => {
    render(
      <DashboardErrorBoundary section="x">
        <ThrowingChild message="dash-err" />
      </DashboardErrorBoundary>
    );
    expect(screen.getByText('dash-err')).toBeInTheDocument();
  });

  it('resets error on retry', () => {
    let shouldThrow = true;
    const MaybeThrow = () => {
      if (shouldThrow) throw new Error('fail');
      return <SafeChild />;
    };

    const { rerender } = render(
      <DashboardErrorBoundary section="test">
        <MaybeThrow />
      </DashboardErrorBoundary>
    );

    expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByText('Tentar novamente'));
    
    // After reset, the boundary re-renders children
    rerender(
      <DashboardErrorBoundary section="test">
        <MaybeThrow />
      </DashboardErrorBoundary>
    );
    expect(screen.getByTestId('safe')).toBeInTheDocument();
  });
});

// ===== RouteErrorBoundary =====
describe('RouteErrorBoundary', () => {
  it('renders children when no error', () => {
    render(<RouteErrorBoundary route="dashboard"><SafeChild /></RouteErrorBoundary>);
    expect(screen.getByTestId('safe')).toBeInTheDocument();
  });

  it('renders error UI with route name', () => {
    render(
      <RouteErrorBoundary route="agentes">
        <ThrowingChild />
      </RouteErrorBoundary>
    );
    expect(screen.getByText(/Erro ao carregar agentes/)).toBeInTheDocument();
  });

  it('shows Voltar and Tentar Novamente buttons', () => {
    render(
      <RouteErrorBoundary route="x">
        <ThrowingChild />
      </RouteErrorBoundary>
    );
    expect(screen.getByText('Voltar')).toBeInTheDocument();
    expect(screen.getByText('Tentar Novamente')).toBeInTheDocument();
  });

  it('calls history.back on Voltar', () => {
    const backMock = vi.fn();
    Object.defineProperty(window, 'history', {
      value: { ...window.history, back: backMock },
      writable: true,
    });
    render(
      <RouteErrorBoundary route="x">
        <ThrowingChild />
      </RouteErrorBoundary>
    );
    fireEvent.click(screen.getByText('Voltar'));
    expect(backMock).toHaveBeenCalled();
  });

  it('resets on Tentar Novamente', () => {
    let shouldThrow = true;
    const MaybeThrow = () => {
      if (shouldThrow) throw new Error('fail');
      return <SafeChild />;
    };

    render(
      <RouteErrorBoundary>
        <MaybeThrow />
      </RouteErrorBoundary>
    );

    shouldThrow = false;
    fireEvent.click(screen.getByText('Tentar Novamente'));
    expect(screen.getByTestId('safe')).toBeInTheDocument();
  });
});

// ===== TenantErrorBoundary =====
describe('TenantErrorBoundary', () => {
  it('renders children when no error', () => {
    render(<TenantErrorBoundary><SafeChild /></TenantErrorBoundary>);
    expect(screen.getByTestId('safe')).toBeInTheDocument();
  });

  it('shows tenant-specific message for tenant errors', () => {
    const TenantError = () => { throw new Error('tenant resolution failed'); };
    render(
      <TenantErrorBoundary>
        <TenantError />
      </TenantErrorBoundary>
    );
    expect(screen.getByText('Problema de Configuração')).toBeInTheDocument();
  });

  it('shows generic message for non-tenant errors', () => {
    render(
      <TenantErrorBoundary>
        <ThrowingChild message="random failure" />
      </TenantErrorBoundary>
    );
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument();
  });

  it('shows Recarregar Página and Limpar Cache buttons', () => {
    render(
      <TenantErrorBoundary>
        <ThrowingChild />
      </TenantErrorBoundary>
    );
    expect(screen.getByText('Recarregar Página')).toBeInTheDocument();
    expect(screen.getByText('Limpar Cache e Recarregar')).toBeInTheDocument();
  });

  it('clears localStorage on Limpar Cache', () => {
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    render(
      <TenantErrorBoundary>
        <ThrowingChild />
      </TenantErrorBoundary>
    );
    fireEvent.click(screen.getByText('Limpar Cache e Recarregar'));
    expect(removeItemSpy).toHaveBeenCalledWith('tenant_errors');
    expect(removeItemSpy).toHaveBeenCalledWith('context_decisions');
    expect(reloadMock).toHaveBeenCalled();
    removeItemSpy.mockRestore();
  });

  it('stores errors in localStorage', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    render(
      <TenantErrorBoundary>
        <ThrowingChild message="logged-error" />
      </TenantErrorBoundary>
    );
    expect(setItemSpy).toHaveBeenCalledWith(
      'tenant_errors',
      expect.stringContaining('logged-error')
    );
    setItemSpy.mockRestore();
  });

  it('shows technical details in collapsible', () => {
    render(
      <TenantErrorBoundary>
        <ThrowingChild message="detail-msg" />
      </TenantErrorBoundary>
    );
    expect(screen.getByText('Detalhes técnicos')).toBeInTheDocument();
    expect(screen.getByText('detail-msg')).toBeInTheDocument();
  });
});
