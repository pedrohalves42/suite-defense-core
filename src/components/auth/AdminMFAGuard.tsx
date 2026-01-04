import { ReactNode, useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
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
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isSuperAdmin, loading: roleLoading } = useUserRole();
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const didCheckRef = useRef(false);

  useEffect(() => {
    const checkMFA = async () => {
      // Prevent double execution
      if (didCheckRef.current || checking) return;

      // Wait for auth and role to complete
      if (authLoading || roleLoading) {
        logger.debug('AdminMFAGuard: Waiting for auth/role to complete');
        return;
      }

      // No user means not authenticated
      if (!user) {
        logger.debug('AdminMFAGuard: No user, allowing ProtectedRoute to handle');
        setChecked(true);
        return;
      }

      // Only check MFA for admin/super_admin
      const requiresMFA = isAdmin || isSuperAdmin;
      if (!requiresMFA) {
        logger.debug('AdminMFAGuard: User is not admin, no MFA required');
        setChecked(true);
        return;
      }

      didCheckRef.current = true;
      setChecking(true);

      try {
        // Direct API check for MFA factors - most reliable
        const { data } = await supabase.auth.mfa.listFactors();
        const hasVerifiedMFA = data?.totp?.some(f => f.status === 'verified') ?? false;

        logger.debug('AdminMFAGuard: MFA check result', { 
          requiresMFA, 
          hasVerifiedMFA,
          factorsCount: data?.totp?.length ?? 0 
        });

        if (!hasVerifiedMFA) {
          logger.info('AdminMFAGuard: Admin without MFA, redirecting to setup');
          navigate('/admin/setup-mfa-required', { 
            replace: true,
            state: { from: location.pathname }
          });
          return;
        }

        setChecked(true);
      } catch (error) {
        logger.error('AdminMFAGuard: Error checking MFA', error);
        // On error, allow access but log it
        setChecked(true);
      } finally {
        setChecking(false);
      }
    };

    checkMFA();
  }, [authLoading, roleLoading, user, isAdmin, isSuperAdmin, navigate, location, checking]);

  // Show loading while checking
  if (authLoading || roleLoading || checking || !checked) {
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

  return <>{children}</>;
}
