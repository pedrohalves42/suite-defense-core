import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';
import { useTenant } from '../useTenant';
import { supabase } from '@/integrations/supabase/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null tenant when user is not authenticated', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { result } = renderHook(() => useTenant(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tenant).toBeNull();
  });

  it('should fetch tenant when user is authenticated', async () => {
    const mockUser = { id: 'user-123' };
    const mockTenant = { id: 'tenant-123', name: 'Test Tenant', slug: 'test-tenant' };

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } as any },
      error: null,
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { tenant_id: 'tenant-123' }, error: null }),
        } as any;
      }
      if (table === 'tenants') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
        } as any;
      }
      return {} as any;
    });

    const { result } = renderHook(() => useTenant(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.tenant).toEqual(mockTenant);
    });
  });

  it('should return null tenant when user has no tenant_id', async () => {
    const mockUser = { id: 'user-123' };

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } as any },
      error: null,
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { tenant_id: null }, error: null }),
        } as any;
      }
      return {} as any;
    });

    const { result } = renderHook(() => useTenant(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tenant).toBeNull();
  });

  it('should handle role fetch error', async () => {
    const mockUser = { id: 'user-123' };

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } as any },
      error: null,
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Role not found' } }),
        } as any;
      }
      return {} as any;
    });

    const { result } = renderHook(() => useTenant(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('should handle tenant fetch error', async () => {
    const mockUser = { id: 'user-123' };

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } as any },
      error: null,
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { tenant_id: 'tenant-123' }, error: null }),
        } as any;
      }
      if (table === 'tenants') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'Tenant not found' } }),
        } as any;
      }
      return {} as any;
    });

    const { result } = renderHook(() => useTenant(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});
