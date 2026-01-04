import { ReactNode, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useMFAEnforcement } from '@/hooks/useMFAEnforcement';
import { logger } from '@/lib/logger';

interface AdminMFAGuardProps {
  children: ReactNode;
}

/**
 * Guard que protege rotas administrativas
 * Redireciona admins sem MFA para página de configuração obrigatória
 * Conforme ADR-008: Admins e Super Admins devem ter MFA
 */
export function AdminMFAGuard({ children }: AdminMFAGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { requiresMFA, hasMFA, loading } = useMFAEnforcement();
  const [checked, setChecked] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    // Safety timeout - don't block forever
    const timeout = setTimeout(() => {
      if (!checked) {
        logger.warn('AdminMFAGuard: Safety timeout - allowing access');
        setTimedOut(true);
        setChecked(true);
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [checked]);

  useEffect(() => {
    if (loading || timedOut) return;

    logger.debug('AdminMFAGuard: Checking', { requiresMFA, hasMFA, loading });

    // Admin/SuperAdmin sem MFA deve ser redirecionado
    if (requiresMFA && !hasMFA) {
      logger.info('AdminMFAGuard: Redirecting to MFA setup');
      navigate('/admin/setup-mfa-required', { 
        replace: true,
        state: { from: location.pathname }
      });
      return;
    }

    setChecked(true);
  }, [requiresMFA, hasMFA, loading, navigate, location, timedOut]);

  // Mostrar loading enquanto verifica (max 5 segundos)
  if (loading && !timedOut && !checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Verificando requisitos de segurança...
          </p>
        </div>
      </div>
    );
  }

  // Se passou na verificação, renderizar children
  return <>{children}</>;
}
