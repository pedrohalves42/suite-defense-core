import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepUpAuthWrapper } from '@/components/security/StepUpAuthWrapper';

const mockExecuteWithStepUp = vi.fn();
const mockNeedsVerification = { value: false };
const mockOnVerificationSuccess = vi.fn();
const mockOnVerificationCancel = vi.fn();

vi.mock('@/hooks/useStepUpAuth', () => ({
  useStepUpAuth: () => ({
    executeWithStepUp: mockExecuteWithStepUp,
    needsVerification: mockNeedsVerification.value,
    onVerificationSuccess: mockOnVerificationSuccess,
    onVerificationCancel: mockOnVerificationCancel,
  }),
}));

vi.mock('@/components/mfa/MFAVerificationDialog', () => ({
  MFAVerificationDialog: ({ open }: { open: boolean }) => (
    open ? <div data-testid="mfa-dialog">MFA Dialog</div> : null
  ),
}));

vi.mock('@/hooks/useMFA', () => ({
  useMFA: () => ({ verifyMFA: vi.fn(), hasMFA: true }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockNeedsVerification.value = false;
});

describe('StepUpAuthWrapper', () => {
  it('passes executeWithStepUp to children via render prop', () => {
    render(
      <StepUpAuthWrapper>
        {(exec) => (
          <button data-testid="action" onClick={() => exec(async () => {})}>
            Action
          </button>
        )}
      </StepUpAuthWrapper>
    );
    expect(screen.getByTestId('action')).toBeInTheDocument();
  });

  it('does not show MFA dialog when not needed', () => {
    render(
      <StepUpAuthWrapper>
        {() => <div>Content</div>}
      </StepUpAuthWrapper>
    );
    expect(screen.queryByTestId('mfa-dialog')).not.toBeInTheDocument();
  });

  it('shows MFA dialog when verification is needed', () => {
    mockNeedsVerification.value = true;
    render(
      <StepUpAuthWrapper>
        {() => <div>Content</div>}
      </StepUpAuthWrapper>
    );
    expect(screen.getByTestId('mfa-dialog')).toBeInTheDocument();
  });
});
