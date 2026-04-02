import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminMFAGuard } from '@/components/auth/AdminMFAGuard';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseUserRole = vi.fn();
vi.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => mockUseUserRole(),
}));

const mockListFactors = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: () => mockListFactors(),
      },
    },
  },
}));

const renderGuard = (initialRoute = '/admin') => {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/admin" element={
          <AdminMFAGuard>
            <div data-testid="admin-content">Admin</div>
          </AdminMFAGuard>
        } />
        <Route path="/admin/setup-mfa-required" element={<div data-testid="mfa-setup">Setup MFA</div>} />
      </Routes>
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminMFAGuard', () => {
  it('shows loading while auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    mockUseUserRole.mockReturnValue({ isAdmin: false, isSuperAdmin: false, loading: true });
    renderGuard();
    expect(screen.getByText(/Verificando requisitos/)).toBeInTheDocument();
  });

  it('renders children for non-admin users without MFA check', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
    mockUseUserRole.mockReturnValue({ isAdmin: false, isSuperAdmin: false, loading: false });
    renderGuard();
    await waitFor(() => {
      expect(screen.getByTestId('admin-content')).toBeInTheDocument();
    });
  });

  it('renders children for admin with verified MFA', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
    mockUseUserRole.mockReturnValue({ isAdmin: true, isSuperAdmin: false, loading: false });
    mockListFactors.mockResolvedValue({
      data: { totp: [{ id: 'f1', status: 'verified' }] },
    });
    renderGuard();
    await waitFor(() => {
      expect(screen.getByTestId('admin-content')).toBeInTheDocument();
    });
  });

  it('redirects admin without MFA to setup page', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
    mockUseUserRole.mockReturnValue({ isAdmin: true, isSuperAdmin: false, loading: false });
    mockListFactors.mockResolvedValue({
      data: { totp: [] },
    });
    renderGuard();
    await waitFor(() => {
      expect(screen.getByTestId('mfa-setup')).toBeInTheDocument();
    });
  });

  it('redirects super_admin without MFA', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
    mockUseUserRole.mockReturnValue({ isAdmin: false, isSuperAdmin: true, loading: false });
    mockListFactors.mockResolvedValue({
      data: { totp: [{ id: 'f1', status: 'unverified' }] },
    });
    renderGuard();
    await waitFor(() => {
      expect(screen.getByTestId('mfa-setup')).toBeInTheDocument();
    });
  });

  it('allows access when no user (lets ProtectedRoute handle)', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockUseUserRole.mockReturnValue({ isAdmin: false, isSuperAdmin: false, loading: false });
    renderGuard();
    await waitFor(() => {
      expect(screen.getByTestId('admin-content')).toBeInTheDocument();
    });
  });

  it('allows access on MFA check error (graceful degradation)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
    mockUseUserRole.mockReturnValue({ isAdmin: true, isSuperAdmin: false, loading: false });
    mockListFactors.mockRejectedValue(new Error('Network error'));
    renderGuard();
    await waitFor(() => {
      expect(screen.getByTestId('admin-content')).toBeInTheDocument();
    });
  });
});
