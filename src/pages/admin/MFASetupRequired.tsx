import { useState, useEffect } from 'react';
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

/**
 * Página de configuração obrigatória de MFA para administradores
 * Esta página bloqueia o acesso ao sistema até que o MFA seja configurado
 * Conforme ADR-008: Admins e Super Admins devem ter MFA obrigatório
 */
export default function MFASetupRequired() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasMFA, loading: mfaLoading, refreshFactors } = useMFA();
  const { toast } = useToast();
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);

  // Verificar se o usuário é realmente admin e se já tem MFA
  useEffect(() => {
    const checkRequirements = async () => {
      if (!user) {
        navigate('/login');
        return;
      }

      // Refresh MFA status
      await refreshFactors();
      
      // Se já tem MFA, redirecionar para o dashboard
      if (hasMFA) {
        navigate('/dashboard');
        return;
      }

      // Verificar se é admin ou super_admin
      const [adminCheck, superAdminCheck] = await Promise.all([
        supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' }),
        supabase.rpc('has_role', { _user_id: user.id, _role: 'super_admin' }),
      ]);

      const isAdmin = adminCheck.data === true;
      const isSuperAdmin = superAdminCheck.data === true;

      // Se não é admin/super_admin, redirecionar para dashboard
      if (!isAdmin && !isSuperAdmin) {
        navigate('/dashboard');
        return;
      }

      setCheckingRole(false);
    };

    if (!mfaLoading) {
      checkRequirements();
    }
  }, [user, hasMFA, mfaLoading, navigate, refreshFactors]);

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
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-card">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(239,68,68,0.05),transparent_50%)] pointer-events-none" />
      
      <Card className="w-full max-w-lg border-destructive/50 shadow-2xl shadow-destructive/10">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-destructive/30 to-warning/30 rounded-full blur-xl animate-pulse" />
              <div className="relative bg-gradient-to-br from-destructive/20 to-warning/20 p-5 rounded-full border border-destructive/30">
                <ShieldAlert className="h-14 w-14 text-destructive" />
              </div>
            </div>
          </div>
          
          <div>
            <CardTitle className="text-2xl font-bold text-destructive">
              Configuração de MFA Obrigatória
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Sua conta possui privilégios administrativos
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
            <Shield className="h-5 w-5" />
            <AlertTitle className="font-semibold">Política de Segurança ADR-008</AlertTitle>
            <AlertDescription className="mt-2">
              Administradores e Super Administradores <strong>devem</strong> configurar 
              autenticação de dois fatores (MFA) para acessar o sistema. Esta é uma 
              exigência de segurança obrigatória.
            </AlertDescription>
          </Alert>

          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h4 className="font-medium text-foreground">Por que MFA é obrigatório?</h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                Protege contra comprometimento de credenciais
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                Requisito para conformidade SOC 2 e ISO 27001
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                Previne acesso não autorizado a dados sensíveis
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                Mitigação de vetor de ataque mais crítico
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <Button 
              size="lg" 
              className="w-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 font-semibold shadow-lg shadow-primary/30"
              onClick={() => setShowEnrollment(true)}
            >
              <Shield className="mr-2 h-5 w-5" />
              Configurar MFA Agora
            </Button>
            
            <Button 
              variant="ghost" 
              size="lg"
              className="w-full text-muted-foreground hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair do Sistema
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
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
