import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPasswordForm } from '@/components/auth/LoginPasswordForm';

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'loginPage.emailOrUsername': 'Email ou Usuário',
        'loginPage.emailPlaceholder': 'email@exemplo.com',
        'loginPage.password': 'Senha',
        'loginPage.continueSecurely': 'Continuar com segurança',
        'loginPage.verifying': 'Verificando...',
        'loginPage.forgotPassword': 'Esqueceu a senha?',
        'loginPage.noAccount': 'Não tem conta?',
        'loginPage.signUp': 'Cadastre-se',
        'loginPage.backToHome': 'Voltar ao início',
        'loginPage.attemptWarning': `Tentativa ${opts?.count || 0}`,
        'loginPage.protectionActivated': 'Proteção ativada',
        'loginPage.nextBlockWarning': 'Próximo bloqueio',
      };
      return map[key] || key;
    },
  }),
}));

// Mock sub-components
vi.mock('@/components/auth/SecurityFooter', () => ({
  SecurityFooter: () => <div data-testid="security-footer" />,
  BrandSignature: () => <div data-testid="brand-sig" />,
}));

vi.mock('@/components/auth/SocialLoginButtons', () => ({
  SocialLoginButtons: () => <div data-testid="social-buttons" />,
}));

const defaultProps = {
  email: '',
  setEmail: vi.fn(),
  password: '',
  setPassword: vi.fn(),
  showPassword: false,
  setShowPassword: vi.fn(),
  loading: false,
  socialLoading: null as 'google' | 'apple' | null,
  requiresCaptcha: false,
  attemptCount: 0,
  onSubmit: vi.fn(),
  onSocialLogin: vi.fn(),
};

const renderForm = (overrides = {}) => {
  const props = { ...defaultProps, ...overrides };
  return render(
    <MemoryRouter>
      <LoginPasswordForm {...props} />
    </MemoryRouter>
  );
};

describe('LoginPasswordForm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders email and password fields', () => {
    renderForm();
    expect(screen.getByLabelText('Email ou Usuário')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
  });

  it('renders submit button', () => {
    renderForm();
    expect(screen.getByText('Continuar com segurança')).toBeInTheDocument();
  });

  it('shows loading state when loading', () => {
    renderForm({ loading: true });
    expect(screen.getByText('Verificando...')).toBeInTheDocument();
  });

  it('disables submit when loading', () => {
    renderForm({ loading: true });
    const btn = screen.getByRole('button', { name: /verificando/i });
    expect(btn).toBeDisabled();
  });

  it('calls setEmail on input change', () => {
    const setEmail = vi.fn();
    renderForm({ setEmail });
    fireEvent.change(screen.getByLabelText('Email ou Usuário'), {
      target: { value: 'test@test.com' },
    });
    expect(setEmail).toHaveBeenCalledWith('test@test.com');
  });

  it('calls setPassword on input change', () => {
    const setPassword = vi.fn();
    renderForm({ setPassword });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'secret123' },
    });
    expect(setPassword).toHaveBeenCalledWith('secret123');
  });

  it('toggles password visibility', () => {
    const setShowPassword = vi.fn();
    renderForm({ showPassword: false, setShowPassword });
    // Find the toggle button (the one with eye icon)
    const toggleBtn = screen.getByLabelText('Senha').parentElement?.querySelector('button');
    if (toggleBtn) fireEvent.click(toggleBtn);
    expect(setShowPassword).toHaveBeenCalledWith(true);
  });

  it('shows password as text when showPassword is true', () => {
    renderForm({ showPassword: true });
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'text');
  });

  it('calls onSubmit on form submit', () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    renderForm({ onSubmit });
    fireEvent.click(screen.getByText('Continuar com segurança'));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('shows attempt warning when attemptCount > 0 and < 3', () => {
    renderForm({ attemptCount: 1 });
    expect(screen.getByText('Tentativa 1')).toBeInTheDocument();
  });

  it('does not show warning at 0 attempts', () => {
    renderForm({ attemptCount: 0 });
    expect(screen.queryByText(/Tentativa/)).not.toBeInTheDocument();
  });

  it('shows captcha alert when requiresCaptcha', () => {
    renderForm({ requiresCaptcha: true, attemptCount: 4 });
    expect(screen.getByText('Proteção ativada')).toBeInTheDocument();
  });

  it('shows next block warning at >= 5 attempts with captcha', () => {
    renderForm({ requiresCaptcha: true, attemptCount: 5 });
    expect(screen.getByText(/Próximo bloqueio/)).toBeInTheDocument();
  });

  it('renders links: forgot password, signup, back to home', () => {
    renderForm();
    expect(screen.getByText('Esqueceu a senha?')).toBeInTheDocument();
    expect(screen.getByText('Cadastre-se')).toBeInTheDocument();
    expect(screen.getByText('Voltar ao início')).toBeInTheDocument();
  });

  it('renders social login buttons', () => {
    renderForm();
    expect(screen.getByTestId('social-buttons')).toBeInTheDocument();
  });

  it('renders security footer', () => {
    renderForm();
    expect(screen.getByTestId('security-footer')).toBeInTheDocument();
  });

  it('sets maxLength on email to 255', () => {
    renderForm();
    expect(screen.getByLabelText('Email ou Usuário')).toHaveAttribute('maxLength', '255');
  });

  it('sets maxLength on password to 72', () => {
    renderForm();
    expect(screen.getByLabelText('Senha')).toHaveAttribute('maxLength', '72');
  });
});
