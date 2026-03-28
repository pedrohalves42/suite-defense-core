import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
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
import { useTranslation } from 'react-i18next';
import logoImage from '@/assets/logo-cybshield-new.png';
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
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
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

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    setSocialLoading(provider);
    try {
      const { error } = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (error) {
        logger.error(`Social login error (${provider})`, error);
        toast({
          variant: 'destructive',
          title: t('loginPage.socialLoginError'),
          description: t('loginPage.socialLoginFailed', { provider: provider === 'google' ? 'Google' : 'Apple' }),
        });
      }
    } catch (err) {
      logger.error(`Social login exception (${provider})`, err);
      toast({
        variant: 'destructive',
        title: t('loginPage.unexpectedError'),
        description: t('loginPage.socialLoginException'),
      });
    } finally {
      setSocialLoading(null);
    }
  };

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
            title: t('loginPage.ipBlocked'),
            description: t('loginPage.ipBlockedDesc', { until: formatBrazilDateTime(data.blockedUntil, 'datetime'), count: data.attemptCount || 5 }),
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
        title: t('loginPage.captchaRequired'),
        description: t('loginPage.captchaRequired'),
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
        title: t('loginPage.validationError'),
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
          (error as never)?.code === 'mfa_required') {
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
      let message = t('loginPage.credentialsFailed');
      let description = '';
      
      if (error.message.includes('Email not confirmed')) {
        message = t('loginPage.emailNotConfirmed');
        description = t('loginPage.checkInbox');
      } else if (error.message.includes('Invalid login credentials')) {
        description = t('loginPage.checkCredentials');
      } else if (error.status === 429) {
        message = t('loginPage.tooManyAttempts');
        description = t('loginPage.waitBeforeRetry');
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
          title: t('loginPage.mfaRequired'),
          description: t('loginPage.mfaRequiredDesc'),
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
      title: t('loginPage.mfaCancelled'),
      description: t('loginPage.mfaCancelledDesc'),
    });
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const emailValidation = z.string().email('Email invalido').safeParse(email);
    if (!emailValidation.success) {
      toast({
        variant: 'destructive',
        title: t('loginPage.emailInvalid'),
        description: t('loginPage.emailInvalidDesc'),
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
        title: t('loginPage.magicLinkError'),
        description: t('loginPage.magicLinkErrorDesc'),
      });
    } else {
      setMagicLinkSent(true);
      toast({
        title: t('loginPage.magicLinkSuccess'),
        description: t('loginPage.magicLinkSuccessDesc'),
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-[460px] card-enterprise animate-fade-in relative z-10 rounded-xl overflow-hidden">
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent" />
        <CardHeader className="space-y-1 text-center pb-6 pt-8">
          {/* Logo */}
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-muted/50 rounded-xl border border-border">
              <img 
                src={logoImage} 
                alt="CyberShield" 
                className="h-12 w-12 object-contain"
              />
            </div>
          </div>
          
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            {t('loginPage.title')}
          </CardTitle>
          
          <CardDescription className="text-sm text-muted-foreground flex items-center justify-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-medium">
              <Shield className="h-3 w-3" />
              {t('loginPage.enterprise')}
            </span>
            <span>{t('loginPage.subtitle')}</span>
          </CardDescription>
        </CardHeader>

        <Tabs defaultValue="password" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-muted/30 p-1 border border-border/30 mx-6 w-[calc(100%-3rem)]">
            <TabsTrigger 
              value="password" 
              className="data-[state=active]:bg-primary/90 data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all duration-200 font-medium text-sm"
            >
              {t('loginPage.passwordTab')}
            </TabsTrigger>
            <TabsTrigger 
              value="magic"
              className="data-[state=active]:bg-primary/90 data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all duration-200 font-medium text-sm"
            >
              {t('loginPage.magicTab')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="password">
            <form onSubmit={handleLogin}>
              <CardContent className="space-y-5 pt-6">
                {attemptCount > 0 && attemptCount < 3 && (
                  <Alert className="border-warning/50 bg-warning/20 backdrop-blur-sm animate-slide-in">
                    <AlertCircle className="h-4 w-4 text-warning animate-pulse" />
                    <AlertDescription className="text-warning-foreground font-medium">
                      {t('loginPage.attemptWarning', { count: attemptCount, remaining: 3 - attemptCount })}
                    </AlertDescription>
                  </Alert>
                )}
                {requiresCaptcha && (
                  <Alert variant="destructive" className="border-destructive/50 bg-destructive/15 backdrop-blur-sm animate-slide-in">
                    <AlertCircle className="h-4 w-4 animate-pulse" />
                    <AlertDescription className="font-medium">
                      {t('loginPage.protectionActivated', { count: attemptCount })}
                      {attemptCount >= 5 && ` ${t('loginPage.nextBlockWarning')}`}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground font-medium tracking-wide">{t('loginPage.emailOrUsername')}</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
                    <Input
                      id="email"
                      type="text"
                      placeholder={t('loginPage.emailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      maxLength={255}
                      className="pl-10 h-11 border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-300 bg-background/50 backdrop-blur-sm"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground font-medium tracking-wide">{t('loginPage.password')}</Label>
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
                      {t('loginPage.verifying')}
                    </>
                  ) : (
                    t('loginPage.continueSecurely')
                  )}
                </Button>
                {/* Social Login Divider */}
                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/40" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-card px-3 text-muted-foreground/60">{t('loginPage.orContinueWith')}</span>
                  </div>
                </div>

                {/* Social Login Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200"
                    onClick={() => handleSocialLogin('google')}
                    disabled={loading || socialLoading !== null}
                  >
                    {socialLoading === 'google' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    )}
                    Google
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200"
                    onClick={() => handleSocialLogin('apple')}
                    disabled={loading || socialLoading !== null}
                  >
                    {socialLoading === 'apple' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                      </svg>
                    )}
                    Apple
                  </Button>
                </div>

                <div className="text-sm text-center text-muted-foreground/60 space-y-2">
                  <div>
                    <Link 
                      to="/forgot-password" 
                      className="text-primary/80 hover:text-primary font-medium transition-colors duration-200"
                    >
                      {t('loginPage.forgotPassword')}
                    </Link>
                  </div>
                  <div>
                    {t('loginPage.noAccount')}{' '}
                    <Link 
                      to="/signup" 
                      className="text-primary/80 hover:text-primary font-medium transition-colors duration-200"
                    >
                      {t('loginPage.signUp')}
                    </Link>
                  </div>
                  <div className="pt-2 border-t border-border/30 mt-2">
                    <Link 
                      to="/" 
                      className="text-muted-foreground/70 hover:text-primary/80 transition-colors duration-200 text-xs"
                    >
                      {t('loginPage.backToHome')}
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
                  <Label htmlFor="magic-email" className="text-foreground font-medium tracking-wide">{t('loginPage.magicLinkEmail')}</Label>
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
                      {t('loginPage.magicLinkDesc')}
                    </span>
                  </p>
                </div>
                {magicLinkSent && (
                  <Alert className="border-success/50 bg-success/5 backdrop-blur-sm animate-slide-in">
                    <Mail className="h-4 w-4 text-success animate-pulse" />
                    <AlertDescription className="text-success-foreground font-medium">
                      {t('loginPage.magicLinkSent')}
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
                      {t('loginPage.sending')}
                    </>
                  ) : (
                    t('loginPage.sendMagicLink')
                  )}
                </Button>
                <div className="text-sm text-center text-muted-foreground/60 space-y-2">
                  <div>
                    {t('loginPage.noAccount')}{' '}
                    <Link 
                      to="/signup" 
                      className="text-primary/80 hover:text-primary font-medium transition-colors duration-200"
                    >
                      {t('loginPage.signUp')}
                    </Link>
                  </div>
                  <div className="pt-2 border-t border-border/30 mt-2">
                    <Link 
                      to="/" 
                      className="text-muted-foreground/70 hover:text-primary/80 transition-colors duration-200 text-xs"
                    >
                      {t('loginPage.backToHome')}
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
