import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@/components/SessionProvider';

vi.mock('@/hooks/useSessionTimeout', () => ({
  useSessionTimeout: vi.fn(),
}));

vi.mock('@/hooks/useSessionManager', () => ({
  useSessionManager: vi.fn(),
}));

describe('SessionProvider', () => {
  it('renders children', () => {
    render(
      <SessionProvider>
        <div data-testid="child">Child</div>
      </SessionProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('initializes session hooks on render', async () => {
    const useSessionTimeout = await import('@/hooks/useSessionTimeout');
    const useSessionManager = await import('@/hooks/useSessionManager');
    render(<SessionProvider><div /></SessionProvider>);
    expect(useSessionTimeout.useSessionTimeout).toHaveBeenCalled();
    expect(useSessionManager.useSessionManager).toHaveBeenCalled();
  });
});

// NotificationSystem is a headless component - test its structure
import { NotificationSystem } from '@/components/NotificationSystem';

vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ tenant: null, loading: true }),
}));

vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ isGranted: false, showNotification: vi.fn() }),
}));

vi.mock('@/lib/job-labels', () => ({
  getJobTypeLabelNoEmoji: (t: string) => t,
}));

vi.mock('@/lib/agent-state-machine', () => ({
  deriveAgentState: () => 'healthy',
  getStateDescription: () => ({ label: 'OK', description: 'Fine' }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => ({
      on: function() { return this; },
      subscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));

describe('NotificationSystem', () => {
  it('renders null (headless component)', () => {
    const { container } = render(<NotificationSystem />);
    expect(container.innerHTML).toBe('');
  });
});
