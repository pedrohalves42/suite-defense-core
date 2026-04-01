import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LogoutButton } from '@/components/LogoutButton';

const mockSignOut = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { signOut: () => mockSignOut() },
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

beforeEach(() => vi.clearAllMocks());

describe('LogoutButton', () => {
  it('renders the button with Sair text', () => {
    render(<MemoryRouter><LogoutButton /></MemoryRouter>);
    expect(screen.getByText('Sair')).toBeInTheDocument();
  });

  it('calls signOut and navigates on success', async () => {
    mockSignOut.mockResolvedValue({ error: null });
    render(<MemoryRouter><LogoutButton /></MemoryRouter>);
    fireEvent.click(screen.getByText('Sair'));
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('does not navigate on signOut error', async () => {
    mockSignOut.mockResolvedValue({ error: { message: 'fail' } });
    render(<MemoryRouter><LogoutButton /></MemoryRouter>);
    fireEvent.click(screen.getByText('Sair'));
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
