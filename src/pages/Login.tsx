import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Shield, Mail, AlertCircle, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { logger } from '@/lib/logger';
import { MFAVerificationDialog } from '@/components/mfa/MFAVerificationDialog';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { SecurityFooter, BrandSignature } from '@/components/auth/SecurityFooter';
import { SecurityCheckScreen } from '@/components/auth/SecurityCheckScreen';
import { SessionVerifiedScreen } from '@/components/auth/SessionVerifiedScreen';
const loginSchema = z.object({
  identifier: z.string()
    .trim()
    .min(1, 'Email ou username é obrigatório')
    .max(255, 'Valor muito longo'),
  password: z.string()
    .min(1, 'Senha é obrigatória')
    .max(72, 'Senha muito longa'),
});

// Convert username to internal email format
function getLoginEmail(identifier: string): string {
  // If it looks like an email, use as-is
  if (identifier.includes('@')) {
    return identifier.toLowerCase().trim();
  }
  // Otherwise, convert username to internal email
  return `${identifier.toLowerCase().trim()}@local.internal`;
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [requiresCaptcha, setRequiresCaptcha] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showMFADialog, setShowMFADialog] = useState(false);
  const [verifyingSession, setVerifyingSession] = useState(false);
  const [sessionVerified, setSessionVerified] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Verificar tentativas falhadas ao carregar a pagina
  useEffect(() => {
    const checkFailedAttempts = async () => {
      const { data, error } = await supabase.functions.invoke('check-failed-logins', {
        body: {},
      });

      if (!error && data) {
        // Verificar se IP esta bloqueado
        if (data.blocked) {
          toast({
            variant: 'destructive',
            title: '? Acesso Bloqueado - Protecao Anti-Brute-Force',
            description: `Seu IP foi bloqueado ate ${formatBrazilDateTime(data.blockedUntil, 'datetime')} (${data.attemptCount || 5}+ tentativas em 15 minutos). Contate o suporte se isso for um erro.`,
            duration: 15000,
          });
          setLoading(true); // Desabilitar interface
          return;
        }

        setRequiresCaptcha(data.requiresCaptcha);
        setAttemptCount(data.attemptCount);
        
        if (data.requiresCaptcha) {
          // Carregar script do Cloudflare Turnstile
          const script = document.createElement('script');
          script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
          script.async = true;
          script.defer = true;
          document.body.appendChild(script);

          script.onload = () => {
            const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
            if (!siteKey) {
              logger.error('VITE_TURNSTILE_SITE_KEY not configured');
              return;
            }
            // @ts-expect-error - Turnstile global
            window.turnstile?.render('#captcha-container', {
              sitekey: siteKey,
              callback: (token: string) => setCaptchaToken(token),
            });
          };
        }
      }
    };

    checkFailedAttempts();
  }, [toast]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validar CAPTCHA se necessario
    if (requiresCaptcha && !captchaToken) {
      toast({
        variant: 'destructive',
        title: 'CAPTCHA obrigatorio',
        description: 'Complete o CAPTCHA para continuar.',
      });
      setLoading(false);
      return;
    }

    // Validate inputs
    const validation = loginSchema.safeParse({ identifier: email, password });
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      toast({
        variant: 'destructive',
        title: 'Erro de validação',
        description: firstError.message,
      });
      setLoading(false);
      return;
    }

    // Convert username to email if needed
    const loginEmail = getLoginEmail(validation.data.identifier);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: validation.data.password,
    });

    if (error) {
      // Check if MFA is required
      if (error.message?.includes('mfa_required') || 
          (error as any)?.code === 'mfa_required') {
        setShowMFADialog(true);
        setLoading(false);
        return;
      }
      
      // Registrar tentativa falhada com audit log
      try {
        await supabase.functions.invoke('record-failed-login', {
          body: { email: loginEmail },
        });
      } catch (recordError) {
        logger.error('Failed to record login attempt', recordError);
      }

      // Incrementar contador e verificar se precisa de CAPTCHA
      const newCount = attemptCount + 1;
      setAttemptCount(newCount);
      if (newCount >= 3) {
        setRequiresCaptcha(true);
        window.location.reload(); // Recarregar para mostrar CAPTCHA
      }
      
      // Mensagens seguras - não revela se usuário existe
      let message = 'Não foi possível validar suas credenciais.';
      let description = '';
      
      if (error.message.includes('Email not confirmed')) {
        message = 'Email nao confirmado';
        description = 'Verifique sua caixa de entrada para confirmar seu email.';
      } else if (error.message.includes('Invalid login credentials')) {
        description = 'Verifique suas credenciais ou tente o login por email magico.';
      } else if (error.status === 429) {
        message = 'Muitas tentativas';
        description = 'Aguarde alguns minutos antes de tentar novamente.';
      }
      
      toast({
        variant: 'destructive',
        title: message,
        description,
      });
      setLoading(false);
      return;
    }

    // Check if user has MFA factors that need verification
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasVerifiedTOTP = factors?.totp?.some(f => f.status === 'verified');
    
    if (hasVerifiedTOTP) {
      // User has MFA enabled, need to verify
      setShowMFADialog(true);
      setLoading(false);
      return;
    }

    // No MFA, proceed with login
    await completeLogin();
  };

  const completeLogin = async () => {
    // Mostrar tela de verificação de sessão
    setVerifyingSession(true);
    
    // Limpar tentativas falhadas
    await supabase.functions.invoke('clear-failed-logins', {
      body: {},
    });

    // Obter sessão atual para verificar role e MFA
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Verificar se é admin ou super_admin
      const [adminCheck, superAdminCheck] = await Promise.all([
        supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' }),
        supabase.rpc('has_role', { _user_id: user.id, _role: 'super_admin' }),
      ]);

      const isAdmin = adminCheck.data === true;
      const isSuperAdmin = superAdminCheck.data === true;

      // Verificar se tem MFA configurado
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const hasMFA = factors?.totp?.some(f => f.status === 'verified') ?? false;

      // HARD GATE: Admin sem MFA → Redirect obrigatório para configurar MFA
      if ((isAdmin || isSuperAdmin) && !hasMFA) {
        setVerifyingSession(false);
        toast({
          title: 'Configuração de MFA obrigatória',
          description: 'Administradores devem configurar autenticação de dois fatores.',
          variant: 'default',
        });
        navigate('/admin/setup-mfa-required');
        setLoading(false);
        return;
      }
    }

    // Mostrar tela de sessão verificada por 1.2s
    setVerifyingSession(false);
    setSessionVerified(true);
    
    await new Promise(resolve => setTimeout(resolve, 1200));
    
    navigate('/dashboard');
    setLoading(false);
  };

  const handleMFASuccess = async () => {
    setShowMFADialog(false);
    await completeLogin();
  };

  const handleMFACancel = async () => {
    // Sign out if MFA verification is cancelled
    await supabase.auth.signOut();
    setShowMFADialog(false);
    toast({
      title: 'Login cancelado',
      description: 'Você precisa completar a verificação de dois fatores para entrar.',
    });
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const emailValidation = z.string().email('Email invalido').safeParse(email);
    if (!emailValidation.success) {
      toast({
        variant: 'destructive',
        title: 'Email invalido',
        description: 'Por favor, insira um email valido.',
      });
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar link',
        description: 'Nao foi possivel enviar o email. Tente novamente.',
      });
    } else {
      setMagicLinkSent(true);
      toast({
        title: 'Email enviado!',
        description: 'Verifique sua caixa de entrada e clique no link para fazer login.',
      });
    }

    setLoading(false);
  };

  // Mostrar tela de verificação de sessão
  if (verifyingSession) {
    return <SecurityCheckScreen />;
  }

  // Mostrar tela de sessão verificada
  if (sessionVerified) {
    return <SessionVerifiedScreen showMFA={showMFADialog} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      {/* Enterprise Background - infraestrutura silenciosa */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(45,158,140,0.02),transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_70%_50%_at_50%_50%,#000_60%,transparent_100%)] opacity-[0.08] pointer-events-none" />
      {/* Vignette sutil */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,hsl(var(--background))_100%)] pointer-events-none" />
      
      <Card className="w-full max-w-[460px] backdrop-blur-xl bg-card/95 border border-white/[0.06] shadow-[0_0_0_1px_rgba(45,158,140,0.05),0_30px_80px_rgba(0,0,0,0.7)] animate-fade-in relative z-10 rounded-[14px]">
        <CardHeader className="space-y-1 text-center pb-6 pt-8">
          <div className="flex justify-center mb-5">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl opacity-60" />
              <div className="relative bg-card p-4 rounded-full border border-primary/15 shadow-glow-primary">
                <Shield className="h-10 w-10 text-primary/90" />
              </div>
            </div>
          </div>
          <CardTitle className="text-2xl font-semibold text-foreground tracking-tight">
            CyberShield Cloud
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground/70 tracking-wide">
            Acesso seguro ao ambiente protegido
          </CardDescription>
        </CardHeader>

        <Tabs defaultValue="password" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-muted/30 p-1 border border-border/30 mx-6 w-[calc(100%-3rem)]">
            <TabsTrigger 
              value="password" 
              className="data-[state=active]:bg-primary/90 data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all duration-200 font-medium text-sm"
            >
              Senha
            </TabsTrigger>
            <TabsTrigger 
              value="magic"
              className="data-[state=active]:bg-primary/90 data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all duration-200 font-medium text-sm"
            >
              Email Mágico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="password">
            <form onSubmit={handleLogin}>
              <CardContent className="space-y-5 pt-6">
                {attemptCount > 0 && attemptCount < 3 && (
                  <Alert className="border-warning/50 bg-warning/20 backdrop-blur-sm animate-slide-in">
                    <AlertCircle className="h-4 w-4 text-warning animate-pulse" />
                    <AlertDescription className="text-warning-foreground font-medium">
                      [WARN] ⚠️ {attemptCount} tentativa{attemptCount > 1 ? 's' : ''} falhada{attemptCount > 1 ? 's' : ''} detectada{attemptCount > 1 ? 's' : ''}. 
                      {3 - attemptCount} tentativa{3 - attemptCount > 1 ? 's' : ''} restante{3 - attemptCount > 1 ? 's' : ''} antes do CAPTCHA.
                    </AlertDescription>
                  </Alert>
                )}
                {requiresCaptcha && (
                  <Alert variant="destructive" className="border-destructive/50 bg-destructive/15 backdrop-blur-sm animate-slide-in">
                    <AlertCircle className="h-4 w-4 animate-pulse" />
                    <AlertDescription className="font-medium">
                      🛡️ Proteção ativada: {attemptCount} tentativas falhadas. Complete o CAPTCHA para continuar.
                      {attemptCount >= 5 && ' Próximo bloqueio automático após mais falhas!'}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground font-medium tracking-wide">Email ou Username</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
                    <Input
                      id="email"
                      type="text"
                      placeholder="seu@email.com ou username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      maxLength={255}
                      className="pl-10 h-11 border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-300 bg-background/50 backdrop-blur-sm"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground font-medium tracking-wide">Senha</Label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      maxLength={72}
                      className="pl-10 pr-10 h-11 border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-300 bg-background/50 backdrop-blur-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors duration-300"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                {requiresCaptcha && (
                  <div id="captcha-container" className="flex justify-center" />
                )}
              </CardContent>
              <CardFooter className="flex flex-col space-y-4 pt-6 pb-8">
                <Button 
                  type="submit" 
                  className="w-full h-12 bg-primary/90 hover:bg-primary text-primary-foreground font-medium shadow-lg shadow-primary/15 hover:shadow-primary/25 transition-all duration-200 tracking-wide" 
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin opacity-80" />
                      Verificando...
                    </>
                  ) : (
                    'Continuar com segurança'
                  )}
                </Button>
                <div className="text-sm text-center text-muted-foreground/60 space-y-2">
                  <div>
                    <Link 
                      to="/forgot-password" 
                      className="text-primary/80 hover:text-primary font-medium transition-colors duration-200"
                    >
                      Esqueceu sua senha?
                    </Link>
                  </div>
                  <div>
                    Não tem uma conta?{' '}
                    <Link 
                      to="/signup" 
                      className="text-primary/80 hover:text-primary font-medium transition-colors duration-200"
                    >
                      Cadastre-se
                    </Link>
                  </div>
                  <div className="pt-2 border-t border-border/30 mt-2">
                    <Link 
                      to="/" 
                      className="text-muted-foreground/70 hover:text-primary/80 transition-colors duration-200 text-xs"
                    >
                      ← Voltar para página inicial
                    </Link>
                  </div>
                </div>
                
                <SecurityFooter />
                <BrandSignature />
              </CardFooter>
            </form>
          </TabsContent>

          <TabsContent value="magic">
            <form onSubmit={handleMagicLink}>
              <CardContent className="space-y-5 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="magic-email" className="text-foreground font-medium tracking-wide">Email</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
                    <Input
                      id="magic-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      maxLength={255}
                      className="pl-10 h-11 border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-300 bg-background/50 backdrop-blur-sm"
                    />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground/80 bg-muted/30 backdrop-blur-sm p-4 rounded-lg border border-border/30">
                  <p className="flex items-start gap-3">
                    <Mail className="h-5 w-5 mt-0.5 flex-shrink-0 text-primary/70" />
                    <span className="leading-relaxed">
                      Enviaremos um link de acesso único para seu email. 
                      {' '}Ideal para redes corporativas com restrições.
                    </span>
                  </p>
                </div>
                {magicLinkSent && (
                  <Alert className="border-success/50 bg-success/5 backdrop-blur-sm animate-slide-in">
                    <Mail className="h-4 w-4 text-success animate-pulse" />
                    <AlertDescription className="text-success-foreground font-medium">
                      ✅ Email enviado! Verifique sua caixa de entrada.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
              <CardFooter className="flex flex-col space-y-4 pt-6 pb-8">
                <Button 
                  type="submit" 
                  className="w-full h-12 bg-primary/90 hover:bg-primary text-primary-foreground font-medium shadow-lg shadow-primary/15 hover:shadow-primary/25 transition-all duration-200 tracking-wide" 
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin opacity-80" />
                      Enviando...
                    </>
                  ) : (
                    'Enviar Link Mágico'
                  )}
                </Button>
                <div className="text-sm text-center text-muted-foreground/60 space-y-2">
                  <div>
                    Não tem uma conta?{' '}
                    <Link 
                      to="/signup" 
                      className="text-primary/80 hover:text-primary font-medium transition-colors duration-200"
                    >
                      Cadastre-se
                    </Link>
                  </div>
                  <div className="pt-2 border-t border-border/30 mt-2">
                    <Link 
                      to="/" 
                      className="text-muted-foreground/70 hover:text-primary/80 transition-colors duration-200 text-xs"
                    >
                      ← Voltar para página inicial
                    </Link>
                  </div>
                </div>
                
                <SecurityFooter />
                <BrandSignature />
              </CardFooter>
            </form>
          </TabsContent>
        </Tabs>
      </Card>

      {/* MFA Verification Dialog */}
      <MFAVerificationDialog
        open={showMFADialog}
        onOpenChange={setShowMFADialog}
        onSuccess={handleMFASuccess}
        onCancel={handleMFACancel}
      />
    </div>
  );
}
