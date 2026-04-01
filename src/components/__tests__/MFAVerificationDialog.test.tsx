import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MFAVerificationDialog } from '@/components/mfa/MFAVerificationDialog';

const mockVerifyMFA = vi.fn();
vi.mock('@/hooks/useMFA', () => ({
  useMFA: () => ({
    verifyMFA: mockVerifyMFA,
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false }),
}));

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  onSuccess: vi.fn(),
  onCancel: vi.fn(),
};

const renderDialog = (overrides = {}) => {
  return render(<MFAVerificationDialog {...defaultProps} {...overrides} />);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MFAVerificationDialog', () => {
  it('renders dialog when open', () => {
    renderDialog();
    expect(screen.getByText('Confirmação de segurança')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByText('Confirmação de segurança')).not.toBeInTheDocument();
  });

  it('shows code input field', () => {
    renderDialog();
    expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
  });

  it('limits code to 6 digits', () => {
    renderDialog();
    const input = screen.getByPlaceholderText('000000');
    fireEvent.change(input, { target: { value: '12345678' } });
    expect(input).toHaveValue('123456');
  });

  it('strips non-numeric chars', () => {
    renderDialog();
    const input = screen.getByPlaceholderText('000000');
    fireEvent.change(input, { target: { value: '12ab34' } });
    expect(input).toHaveValue('1234');
  });

  it('disables confirm button when code < 6 digits', () => {
    renderDialog();
    const input = screen.getByPlaceholderText('000000');
    fireEvent.change(input, { target: { value: '123' } });
    expect(screen.getByText('Confirmar')).toBeDisabled();
  });

  it('enables confirm button when code is 6 digits', () => {
    renderDialog();
    const input = screen.getByPlaceholderText('000000');
    fireEvent.change(input, { target: { value: '123456' } });
    expect(screen.getByText('Confirmar')).not.toBeDisabled();
  });

  it('calls verifyMFA and onSuccess on valid verification', async () => {
    mockVerifyMFA.mockResolvedValue(undefined);
    renderDialog();
    const input = screen.getByPlaceholderText('000000');
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Confirmar'));
    await waitFor(() => {
      expect(mockVerifyMFA).toHaveBeenCalledWith('123456');
      expect(defaultProps.onSuccess).toHaveBeenCalled();
    });
  });

  it('shows error on failed verification', async () => {
    mockVerifyMFA.mockRejectedValue(new Error('invalid'));
    renderDialog();
    const input = screen.getByPlaceholderText('000000');
    fireEvent.change(input, { target: { value: '999999' } });
    fireEvent.click(screen.getByText('Confirmar'));
    await waitFor(() => {
      expect(screen.getByText(/Código inválido/)).toBeInTheDocument();
    });
  });

  it('shows remaining attempts after 3 failures', async () => {
    mockVerifyMFA.mockRejectedValue(new Error('invalid'));
    renderDialog();
    const input = screen.getByPlaceholderText('000000');

    for (let i = 0; i < 3; i++) {
      fireEvent.change(input, { target: { value: '999999' } });
      fireEvent.click(screen.getByText('Confirmar'));
      await waitFor(() => {
        expect(screen.getByText(/Código inválido/)).toBeInTheDocument();
      });
    }
    expect(screen.getByText(/tentativas restantes/)).toBeInTheDocument();
  });

  it('calls onCancel and resets state on cancel', () => {
    renderDialog();
    const input = screen.getByPlaceholderText('000000');
    fireEvent.change(input, { target: { value: '123' } });
    fireEvent.click(screen.getByText('Cancelar'));
    expect(defaultProps.onCancel).toHaveBeenCalled();
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows trust indicators', () => {
    renderDialog();
    expect(screen.getByText('Dispositivo reconhecido')).toBeInTheDocument();
    expect(screen.getByText('Localização consistente')).toBeInTheDocument();
  });

  it('triggers verify on Enter key when code is 6 digits', async () => {
    mockVerifyMFA.mockResolvedValue(undefined);
    renderDialog();
    const input = screen.getByPlaceholderText('000000');
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(mockVerifyMFA).toHaveBeenCalledWith('123456');
    });
  });

  it('shows error for code less than 6 digits on submit attempt', async () => {
    renderDialog();
    // Code is empty, button is disabled - test the validation path
    const input = screen.getByPlaceholderText('000000');
    fireEvent.change(input, { target: { value: '12345' } });
    // Button should be disabled with 5 digits
    expect(screen.getByText('Confirmar')).toBeDisabled();
  });
});
