import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ShieldAlert, LogOut, Loader2, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMFA } from '@/hooks/useMFA';
import { MFAEnrollmentDialog } from '@/components/mfa/MFAEnrollmentDialog';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

/**
 * Página de configuração obrigatória de MFA para administradores
 * Esta página bloqueia o acesso ao sistema até que o MFA seja configurado
 * Conforme ADR-008: Admins e Super Admins devem ter MFA obrigatório
 */
export default function MFASetupRequired() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { hasMFA, loading: mfaLoading, refreshFactors } = useMFA();
  const { toast } = useToast();
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const didCheckRef = useRef(false);

  // Verificar se o usuário é realmente admin e se já tem MFA
  useEffect(() => {
    const checkRequirements = async () => {
      // Prevent double execution
      if (didCheckRef.current) return;
      
      // Wait for auth to complete first
      if (authLoading) {
        logger.debug('MFASetupRequired: Waiting for auth to complete');
        return;
      }

      // If no user after auth completes, redirect to login
      if (!user) {
        logger.debug('MFASetupRequired: No user after auth complete, redirecting to login');
        navigate('/login', { replace: true });
        return;
      }

      didCheckRef.current = true;
      logger.debug('MFASetupRequired: Starting requirements check', { userId: user.id });

      // Refresh MFA status directly from API
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const hasVerifiedMFA = factorsData?.totp?.some(f => f.status === 'verified') ?? false;
      
      // Se já tem MFA, redirecionar para o dashboard
      if (hasVerifiedMFA) {
        logger.debug('MFASetupRequired: User already has MFA, redirecting to dashboard');
        navigate('/dashboard', { replace: true });
        return;
      }

      // Verificar se é admin ou super_admin
      const [adminCheck, superAdminCheck] = await Promise.all([
        supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' }),
        supabase.rpc('has_role', { _user_id: user.id, _role: 'super_admin' }),
      ]);

      const isAdmin = adminCheck.data === true;
      const isSuperAdmin = superAdminCheck.data === true;

      logger.debug('MFASetupRequired: Role check complete', { isAdmin, isSuperAdmin });

      // Se não é admin/super_admin, redirecionar para dashboard
      if (!isAdmin && !isSuperAdmin) {
        navigate('/dashboard', { replace: true });
        return;
      }

      setCheckingRole(false);
    };

    checkRequirements();
  }, [user, authLoading, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleEnrollmentSuccess = async () => {
    setShowEnrollment(false);
    await refreshFactors();
    
    toast({
      title: 'MFA Configurado com Sucesso!',
      description: 'Sua conta agora está protegida com autenticação de dois fatores.',
    });

    // Redirecionar para o dashboard após sucesso
    navigate('/dashboard');
  };

  if (mfaLoading || checkingRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-card">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando requisitos de segurança...</p>
        </div>
      </div>
    );
  }

  // Se já tem MFA, mostrar sucesso e redirecionar
  if (hasMFA) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-card">
        <div className="flex flex-col items-center gap-4">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <p className="text-muted-foreground">MFA configurado! Redirecionando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      {/* Background sutil */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(45,158,140,0.02),transparent_60%)] pointer-events-none" />
      
      <Card className="w-full max-w-lg border-border/50 shadow-[0_30px_80px_rgba(0,0,0,0.5)] rounded-[14px]">
        <CardHeader className="text-center space-y-4 pt-8">
          {/* Progress bar */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium">1</span>
              <span className="w-12 h-0.5 bg-border/30" />
              <span className="w-6 h-6 rounded-full bg-muted/50 flex items-center justify-center">2</span>
              <span className="w-12 h-0.5 bg-border/30" />
              <span className="w-6 h-6 rounded-full bg-muted/50 flex items-center justify-center">3</span>
            </div>
          </div>
          
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl opacity-60" />
              <div className="relative bg-card p-5 rounded-full border border-primary/20">
                <Shield className="h-12 w-12 text-primary/80" />
              </div>
            </div>
          </div>
          
          <div>
            <CardTitle className="text-2xl font-semibold text-foreground">
              Proteja sua conta agora
            </CardTitle>
            <CardDescription className="text-sm mt-2 text-muted-foreground/70">
              A autenticação multifator é obrigatória para contas administrativas
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 px-8">
          <div className="bg-muted/20 rounded-lg p-4 border border-border/20">
            <p className="text-sm text-muted-foreground/80 leading-relaxed">
              Para garantir a segurança do ambiente, administradores devem configurar 
              autenticação de dois fatores antes de acessar o sistema.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground/80">Benefícios</h4>
            <ul className="text-sm text-muted-foreground/70 space-y-2.5">
              <li className="flex items-start gap-2.5">
                <CheckCircle className="h-4 w-4 text-green-500/70 mt-0.5 shrink-0" />
                Proteção contra comprometimento de credenciais
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle className="h-4 w-4 text-green-500/70 mt-0.5 shrink-0" />
                Conformidade SOC 2 e ISO 27001
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle className="h-4 w-4 text-green-500/70 mt-0.5 shrink-0" />
                Prevenção de acesso não autorizado
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <Button 
              size="lg" 
              className="w-full h-12 bg-primary/90 hover:bg-primary font-medium shadow-lg shadow-primary/15"
              onClick={() => setShowEnrollment(true)}
            >
              <Shield className="mr-2 h-5 w-5" />
              Configurar MFA Agora
            </Button>
            
            <Button 
              variant="ghost" 
              size="lg"
              className="w-full text-muted-foreground/60 hover:text-muted-foreground"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair do Sistema
            </Button>
          </div>

          <p className="text-[11px] text-center text-muted-foreground/50 pb-2">
            Você precisará de um aplicativo autenticador como Google Authenticator, 
            Authy ou Microsoft Authenticator.
          </p>
        </CardContent>
      </Card>

      <MFAEnrollmentDialog
        open={showEnrollment}
        onOpenChange={setShowEnrollment}
        onSuccess={handleEnrollmentSuccess}
      />
    </div>
  );
}
