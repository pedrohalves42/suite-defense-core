import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useActiveTenant } from '@/hooks/useActiveTenant';

describe('useActiveTenant', () => {
  it('throws error when used outside provider', () => {
    expect(() => {
      renderHook(() => useActiveTenant());
    }).toThrow('useActiveTenant must be used within an ActiveTenantProvider');
  });
});
