import { describe, it, expect, vi } from 'vitest';
import { useActionCenter, useExecuteActionItem } from '../useActionCenter';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/__tests__/helpers/test-utils';
import { supabase } from '@/integrations/supabase/client';
import { callGateway } from '@/lib/gateway';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/lib/gateway', () => ({
  callGateway: vi.fn(),
}));

vi.mock('../useTenant', () => ({
  useTenant: () => ({
    tenant: { id: 'test-tenant' },
    loading: false,
  }),
}));

describe('useActionCenter', () => {
  it('should fetch action center feed', async () => {
    const mockData = { urgent: [], recommended: [], informational: [] };
    vi.mocked(callGateway).mockResolvedValue(mockData);

    const { result } = renderHook(() => useActionCenter(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
  });
});
