import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

// ===== useRequiredTenant =====
describe('useRequiredTenant', () => {
  const mockUseTenant = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.doMock('@/hooks/useTenant', () => ({ useTenant: () => mockUseTenant() }));
  });

  it('returns tenant when defined', async () => {
    mockUseTenant.mockReturnValue({ tenant: { id: 't1', name: 'Test' }, loading: false });
    const { useRequiredTenant } = await import('@/hooks/useRequiredTenant');
    const { result } = renderHook(() => useRequiredTenant());
    expect(result.current.tenant.id).toBe('t1');
    expect(result.current.tenantId).toBe('t1');
  });

  it('throws when no tenant and not loading', async () => {
    mockUseTenant.mockReturnValue({ tenant: null, loading: false });
    const { useRequiredTenant } = await import('@/hooks/useRequiredTenant');
    expect(() => renderHook(() => useRequiredTenant())).toThrow(/Tenant obrigatório/);
  });

  it('does not throw when loading', async () => {
    mockUseTenant.mockReturnValue({ tenant: null, loading: true });
    const { useRequiredTenant } = await import('@/hooks/useRequiredTenant');
    // Should not throw while loading
    expect(() => renderHook(() => useRequiredTenant())).not.toThrow();
  });
});

// ===== useIsAdmin =====
describe('useIsAdmin', () => {
  const mockUseActiveTenant = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.doMock('@/hooks/useActiveTenant', () => ({ useActiveTenant: () => mockUseActiveTenant() }));
  });

  it('returns true for admin role', async () => {
    mockUseActiveTenant.mockReturnValue({ activeRole: 'admin', loading: false });
    const { useIsAdmin } = await import('@/hooks/useIsAdmin');
    const { result } = renderHook(() => useIsAdmin());
    expect(result.current.isAdmin).toBe(true);
  });

  it('returns true for super_admin role', async () => {
    mockUseActiveTenant.mockReturnValue({ activeRole: 'super_admin', loading: false });
    const { useIsAdmin } = await import('@/hooks/useIsAdmin');
    const { result } = renderHook(() => useIsAdmin());
    expect(result.current.isAdmin).toBe(true);
  });

  it('returns false for viewer role', async () => {
    mockUseActiveTenant.mockReturnValue({ activeRole: 'viewer', loading: false });
    const { useIsAdmin } = await import('@/hooks/useIsAdmin');
    const { result } = renderHook(() => useIsAdmin());
    expect(result.current.isAdmin).toBe(false);
  });

  it('returns loading state', async () => {
    mockUseActiveTenant.mockReturnValue({ activeRole: null, loading: true });
    const { useIsAdmin } = await import('@/hooks/useIsAdmin');
    const { result } = renderHook(() => useIsAdmin());
    expect(result.current.loading).toBe(true);
  });
});

// ===== useAppMode =====
describe('useAppMode', () => {
  const mockUseActiveTenant2 = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.doMock('@/hooks/useActiveTenant', () => ({ useActiveTenant: () => mockUseActiveTenant2() }));
  });

  it('returns FULL for admin', async () => {
    mockUseActiveTenant2.mockReturnValue({ activeRole: 'admin', activeTenant: { id: 't1' }, loading: false });
    const { useAppMode } = await import('@/hooks/useAppMode');
    const { result } = renderHook(() => useAppMode());
    expect(result.current.mode).toBe('FULL');
    expect(result.current.isFullMode).toBe(true);
  });

  it('returns FULL for super_admin', async () => {
    mockUseActiveTenant2.mockReturnValue({ activeRole: 'super_admin', activeTenant: { id: 't1' }, loading: false });
    const { useAppMode } = await import('@/hooks/useAppMode');
    const { result } = renderHook(() => useAppMode());
    expect(result.current.mode).toBe('FULL');
  });

  it('returns EXT for viewer', async () => {
    mockUseActiveTenant2.mockReturnValue({ activeRole: 'viewer', activeTenant: { id: 't1' }, loading: false });
    const { useAppMode } = await import('@/hooks/useAppMode');
    const { result } = renderHook(() => useAppMode());
    expect(result.current.mode).toBe('EXT');
    expect(result.current.isExtMode).toBe(true);
  });

  it('returns LOADING when loading', async () => {
    mockUseActiveTenant2.mockReturnValue({ activeRole: null, activeTenant: null, loading: true });
    const { useAppMode } = await import('@/hooks/useAppMode');
    const { result } = renderHook(() => useAppMode());
    expect(result.current.mode).toBe('LOADING');
    expect(result.current.isLoading).toBe(true);
  });
});

// ===== useClientAccess =====
describe('useClientAccess', () => {
  const mockUserRole = vi.fn();
  const mockTenant = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.doMock('@/hooks/useUserRole', () => ({ useUserRole: () => mockUserRole() }));
    vi.doMock('@/hooks/useTenant', () => ({ useTenant: () => mockTenant() }));
  });

  it('identifies viewer as client user', async () => {
    mockUserRole.mockReturnValue({ role: 'viewer', isViewer: true, isOperator: false, isAdmin: false, isSuperAdmin: false, loading: false });
    mockTenant.mockReturnValue({ tenant: { id: 't1' }, loading: false });
    const { useClientAccess } = await import('@/hooks/useClientAccess');
    const { result } = renderHook(() => useClientAccess());
    expect(result.current.isClientUser).toBe(true);
    expect(result.current.canViewOnly).toBe(true);
    expect(result.current.canCreateBasicJobs).toBe(false);
  });

  it('identifies operator as client with job creation', async () => {
    mockUserRole.mockReturnValue({ role: 'operator', isViewer: false, isOperator: true, isAdmin: false, isSuperAdmin: false, loading: false });
    mockTenant.mockReturnValue({ tenant: { id: 't1' }, loading: false });
    const { useClientAccess } = await import('@/hooks/useClientAccess');
    const { result } = renderHook(() => useClientAccess());
    expect(result.current.isClientUser).toBe(true);
    expect(result.current.canCreateBasicJobs).toBe(true);
  });

  it('admin is not a client user', async () => {
    mockUserRole.mockReturnValue({ role: 'admin', isViewer: false, isOperator: false, isAdmin: true, isSuperAdmin: false, loading: false });
    mockTenant.mockReturnValue({ tenant: { id: 't1' }, loading: false });
    const { useClientAccess } = await import('@/hooks/useClientAccess');
    const { result } = renderHook(() => useClientAccess());
    expect(result.current.isClientUser).toBe(false);
    expect(result.current.canCreateBasicJobs).toBe(true);
  });
});

// ===== useSimpleMode =====
describe('useSimpleMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to technical mode', async () => {
    const { useSimpleMode } = await import('@/hooks/useSimpleMode');
    const { result } = renderHook(() => useSimpleMode());
    expect(result.current.mode).toBe('technical');
    expect(result.current.isTechnical).toBe(true);
    expect(result.current.isSimple).toBe(false);
  });

  it('toggles between modes', async () => {
    const { useSimpleMode } = await import('@/hooks/useSimpleMode');
    const { result } = renderHook(() => useSimpleMode());
    act(() => result.current.toggleMode());
    expect(result.current.mode).toBe('simple');
    expect(result.current.isSimple).toBe(true);
    act(() => result.current.toggleMode());
    expect(result.current.mode).toBe('technical');
  });

  it('setSimple and setTechnical work', async () => {
    const { useSimpleMode } = await import('@/hooks/useSimpleMode');
    const { result } = renderHook(() => useSimpleMode());
    act(() => result.current.setSimple());
    expect(result.current.isSimple).toBe(true);
    act(() => result.current.setTechnical());
    expect(result.current.isTechnical).toBe(true);
  });

  it('persists to localStorage', async () => {
    const { useSimpleMode } = await import('@/hooks/useSimpleMode');
    const { result } = renderHook(() => useSimpleMode());
    act(() => result.current.setSimple());
    expect(localStorage.getItem('cybershield_view_mode')).toBe('simple');
  });

  it('useSimpleModeContext throws without provider', async () => {
    const { useSimpleModeContext } = await import('@/hooks/useSimpleMode');
    expect(() => renderHook(() => useSimpleModeContext())).toThrow(/SimpleModeProvider/);
  });
});
