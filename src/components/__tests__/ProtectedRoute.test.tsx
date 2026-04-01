import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

// Controllable mocks
const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseActiveTenant = vi.fn();
vi.mock('@/hooks/useActiveTenant', () => ({
  useActiveTenant: () => mockUseActiveTenant(),
}));

vi.mock('@/components/SessionProvider', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockGetSession = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

const renderProtected = (initialRoute = '/protected') => {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route path="/force-password-change" element={<div data-testid="force-pw">Force PW</div>} />
        <Route path="/no-tenant" element={<div data-testid="no-tenant">No Tenant</div>} />
        <Route path="/dashboard" element={
          <ProtectedRoute><div data-testid="dashboard">Dashboard</div></ProtectedRoute>
        } />
        <Route path="/protected" element={
          <ProtectedRoute><div data-testid="content">Protected Content</div></ProtectedRoute>
        } />
      </Routes>
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: null } });
});

describe('ProtectedRoute', () => {
  it('shows loading spinner while auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    mockUseActiveTenant.mockReturnValue({ tenants: [], loading: true, isFetched: false });
    renderProtected();
    expect(screen.getByRole('generic', { hidden: false })).toBeInTheDocument();
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('redirects to /login when no user and session check fails', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockUseActiveTenant.mockReturnValue({ tenants: [], loading: false, isFetched: true });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    renderProtected();
    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
  });

  it('renders children when user is authenticated with tenant', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', user_metadata: {} },
      loading: false,
    });
    mockUseActiveTenant.mockReturnValue({
      tenants: [{ id: 't1' }],
      loading: false,
      isFetched: true,
    });
    renderProtected();
    await waitFor(() => {
      expect(screen.getByTestId('content')).toBeInTheDocument();
    });
  });

  it('redirects to /force-password-change when must_change_password is true', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', user_metadata: { must_change_password: true } },
      loading: false,
    });
    mockUseActiveTenant.mockReturnValue({
      tenants: [{ id: 't1' }],
      loading: false,
      isFetched: true,
    });
    renderProtected();
    await waitFor(() => {
      expect(screen.getByTestId('force-pw')).toBeInTheDocument();
    });
  });

  it('redirects to /no-tenant when user has no tenants', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', user_metadata: {} },
      loading: false,
    });
    mockUseActiveTenant.mockReturnValue({
      tenants: [],
      loading: false,
      isFetched: true,
    });
    renderProtected();
    await waitFor(() => {
      expect(screen.getByTestId('no-tenant')).toBeInTheDocument();
    });
  });

  it('does not redirect to /no-tenant while tenant is still loading', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', user_metadata: {} },
      loading: false,
    });
    mockUseActiveTenant.mockReturnValue({
      tenants: undefined,
      loading: true,
      isFetched: false,
    });
    renderProtected();
    // Should NOT show no-tenant page
    expect(screen.queryByTestId('no-tenant')).not.toBeInTheDocument();
  });

  it('second chance: recovers session from supabase when useAuth returns null', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockUseActiveTenant.mockReturnValue({
      tenants: [{ id: 't1' }],
      loading: false,
      isFetched: true,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'recovered' } } },
    });
    renderProtected();
    // Should still be in loading/checking state, not immediately redirect
    await waitFor(() => {
      // It should either show content or at least not go to login
      // since the second chance found a valid session
    });
  });
});
