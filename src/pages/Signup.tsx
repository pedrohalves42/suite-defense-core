import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { z } from 'zod';
import { lovable } from '@/integrations/lovable/index';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import logoImage from '@/assets/logo-cybshield-new.webp';
import { logger } from '@/lib/logger';
import { SecurityFooter, BrandSignature } from '@/components/auth/SecurityFooter';
import { useTranslation } from 'react-i18next';

const signupSchema = z.object({
  email: z.string()
    .trim()
    .min(1, 'Email e obrigatorio')
    .email('Email invalido')
    .max(255, 'Email muito longo'),
  password: z.string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .max(72, 'Senha muito longa')
    .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiuscula')
    .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minuscula')
    .regex(/[0-9]/, 'Senha deve conter pelo menos um numero')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Senha deve conter pelo menos um caractere especial'),
  fullName: z.string()
    .trim()
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(100, 'Nome muito longo')
    .regex(/^[\p{L}\s'-]+$/u, 'Nome deve conter apenas letras, espacos, hifens ou apostrofos'),
  deviceCount: z.string().optional(),
});

export default function Signup() {
  const { t } = useTranslation();
  
  // Registration disabled by policy
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,20%,10%)] via-[hsl(200,18%,12%)] to-[hsl(160,15%,10%)] z-0" />
      <Card className="w-full max-w-[460px] border border-white/10 bg-[hsl(220,20%,10%)]/60 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative z-10 rounded-3xl overflow-hidden p-12 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Cadastros Temporariamente Suspensos</h1>
        <p className="text-white/60 mb-8">
          Estamos em período de manutenção e estabilização do sistema. 
          Novos cadastros estão desativados no momento.
        </p>
        <Link to="/login">
          <Button variant="outline" className="w-full">Voltar para Login</Button>
        </Link>
      </Card>
    </div>
  );
}

// Keep the rest of the code for reference but unreachable
function SignupHidden() {
  // ... existing code

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [deviceCount, setDeviceCount] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    setSocialLoading(provider);
    try {
      const { error } = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (error) {
        logger.error(`Social signup error (${provider})`, error);
        toast({
          variant: 'destructive',
          title: t('signupPage.socialError'),
          description: t('signupPage.socialFailed', { provider: provider === 'google' ? 'Google' : 'Apple' }),
        });
      }
    } catch (err) {
      logger.error(`Social signup exception (${provider})`, err);
      toast({
        variant: 'destructive',
        title: t('signupPage.unexpectedError'),
        description: t('signupPage.socialException'),
      });
    } finally {
      setSocialLoading(null);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const validation = signupSchema.safeParse({ email, password, fullName, deviceCount });
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      toast({
        variant: 'destructive',
        title: t('signupPage.validationError'),
        description: firstError.message,
      });
      setLoading(false);
      return;
    }

    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email: validation.data.email,
      password: validation.data.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: validation.data.fullName,
          device_count: deviceCount || undefined,
        },
      },
    });

    if (!error && data.user) {
      try {
        await supabase.functions.invoke('ops-gateway', {
          body: {
            action: 'notify:welcome',
            payload: {
              email: validation.data.email,
              fullName: validation.data.fullName,
              userId: data.user.id,
            },
          },
        });

        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          await supabase.functions.invoke('create-trial-subscription', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
          });
        }
      } catch (emailError) {
        logger.error('Failed to send welcome email or create trial', emailError);
      }
    }

    if (error) {
      logger.error('[Signup Error]', {
        message: error.message,
        status: 'status' in error ? (error as { status?: number }).status : undefined,
        code: 'code' in error ? (error as { code?: string }).code : undefined,
        details: error
      });
      logger.error('Signup failed', { email: validation.data.email, error: error.message });
      
      const message = error.message.includes('already registered') || error.message.includes('already exists')
        ? t('signupPage.accountExists')
        : t('signupPage.genericError');
      
      toast({
        variant: 'destructive',
        title: t('signupPage.signupError'),
        description: message,
      });
    } else {
      toast({
        title: t('signupPage.successTitle'),
        description: t('signupPage.successDesc'),
      });
      
      setTimeout(() => {
        navigate('/admin/dashboard?onboarding=true');
      }, 1500);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background relative overflow-hidden">
      {/* Strategic Background - Consistent with Login & Hero */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,20%,10%)] via-[hsl(200,18%,12%)] to-[hsl(160,15%,10%)] z-0" />
      
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.03] z-0" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--primary-foreground)) 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />

      {/* Dynamic Security Glows */}
      <div className="absolute top-1/4 -left-24 w-[500px] h-[500px] bg-cta-positive/10 rounded-full blur-[120px] animate-pulse z-0" />
      <div className="absolute -bottom-24 -right-24 w-[400px] h-[400px] bg-info/5 rounded-full blur-[100px] z-0" />

      <Card className="w-full max-w-[460px] border border-white/10 bg-[hsl(220,20%,10%)]/60 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative z-10 rounded-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-700 ease-out">
        {/* Magnet Top Border */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cta-positive/50 to-transparent" />
        
        <CardHeader className="space-y-6 text-center pb-2 pt-12">
          <Link 
            to="/" 
            className="inline-flex justify-center group transition-transform duration-500 hover:scale-110 mb-2"
          >
            <div className="relative">
              <div className="absolute -inset-4 bg-cta-positive/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative p-1">
                <img src={logoImage} alt="CyberShield" className="h-16 w-16 object-contain drop-shadow-[0_0_10px_rgba(5,150,105,0.3)]" />
              </div>
            </div>
          </Link>
          
          <div className="space-y-3">
            <CardTitle className="text-4xl font-extrabold tracking-tight text-white leading-tight">
              {t('signupPage.title')}
            </CardTitle>
            <div className="flex flex-col items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/60 text-[10px] font-bold uppercase tracking-[0.15em]">
                {t('signupPage.subtitle')}
              </span>
            </div>
          </div>
        </CardHeader>

        <form onSubmit={handleSignup}>
          <CardContent className="space-y-6 px-10 pt-8">
            <div className="space-y-3">
              <Label htmlFor="fullName" className="text-white/70 font-bold text-[11px] uppercase tracking-[0.15em] ml-1">{t('signupPage.fullName')}</Label>
              <div className="relative group">
                <Input
                  id="fullName"
                  type="text"
                  placeholder={t('signupPage.fullNamePlaceholder')}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={100}
                  className="h-14 border-white/5 focus:border-cta-positive/30 focus:ring-0 transition-all duration-500 bg-white/[0.02] hover:bg-white/[0.04] text-white rounded-2xl placeholder:text-white/10"
                />
                <div className="absolute inset-0 rounded-2xl border border-cta-positive/0 group-focus-within:border-cta-positive/20 pointer-events-none transition-all duration-500" />
              </div>
            </div>
            
            <div className="space-y-3">
              <Label htmlFor="email" className="text-white/70 font-bold text-[11px] uppercase tracking-[0.15em] ml-1">{t('signupPage.email')}</Label>
              <div className="relative group">
                <Input
                  id="email"
                  type="email"
                  placeholder={t('signupPage.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={255}
                  className="h-14 border-white/5 focus:border-cta-positive/30 focus:ring-0 transition-all duration-500 bg-white/[0.02] hover:bg-white/[0.04] text-white rounded-2xl placeholder:text-white/10"
                />
                <div className="absolute inset-0 rounded-2xl border border-cta-positive/0 group-focus-within:border-cta-positive/20 pointer-events-none transition-all duration-500" />
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="deviceCount" className="text-white/70 font-bold text-[11px] uppercase tracking-[0.15em] ml-1">{t('signupPage.deviceCount')}</Label>
              <Select value={deviceCount} onValueChange={setDeviceCount}>
                <SelectTrigger className="h-14 border-white/5 bg-white/[0.02] hover:bg-white/[0.04] focus:border-cta-positive/30 focus:ring-0 transition-all duration-500 text-white/70 rounded-2xl">
                  <SelectValue placeholder={t('signupPage.selectOption')} />
                </SelectTrigger>
                <SelectContent className="bg-[hsl(220,20%,10%)] border-white/10 text-white rounded-xl backdrop-blur-xl">
                  <SelectItem value="1-3" className="focus:bg-white/5 focus:text-white">{t('signupPage.devices1to3')}</SelectItem>
                  <SelectItem value="4-10" className="focus:bg-white/5 focus:text-white">{t('signupPage.devices4to10')}</SelectItem>
                  <SelectItem value="11-30" className="focus:bg-white/5 focus:text-white">{t('signupPage.devices11to30')}</SelectItem>
                  <SelectItem value="31-100" className="focus:bg-white/5 focus:text-white">{t('signupPage.devices31to100')}</SelectItem>
                  <SelectItem value="100+" className="focus:bg-white/5 focus:text-white">{t('signupPage.devices100plus')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label htmlFor="password" className="text-white/70 font-bold text-[11px] uppercase tracking-[0.15em] ml-1">{t('signupPage.password')}</Label>
              <div className="relative group">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  maxLength={72}
                  className="h-14 pr-12 border-white/5 focus:border-cta-positive/30 focus:ring-0 transition-all duration-500 bg-white/[0.02] hover:bg-white/[0.04] text-white rounded-2xl placeholder:text-white/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-all duration-500"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                <div className="absolute inset-0 rounded-2xl border border-cta-positive/0 group-focus-within:border-cta-positive/20 pointer-events-none transition-all duration-500" />
              </div>
              <p className="text-[10px] text-white/20 font-medium px-1 italic">
                {t('signupPage.passwordHint')}
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-6 px-10 pt-8 pb-12">
            <Button 
              type="submit" 
              className="w-full h-14 bg-white text-black hover:bg-white/90 font-bold rounded-2xl shadow-[0_10px_25px_rgba(255,255,255,0.1)] hover:shadow-[0_15px_35px_rgba(255,255,255,0.2)] transition-all duration-500 text-sm uppercase tracking-[0.1em]" 
              disabled={loading}
            >
              {loading ? t('signupPage.creating') : t('signupPage.submit')}
            </Button>
            
            <div className="relative my-2 w-full">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/5" />
              </div>
              <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-[0.2em]">
                <span className="bg-[#1A1D21] px-4 text-white/20">{t('signupPage.orSignUpWith')}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full">
              <Button
                type="button"
                variant="outline"
                className="h-14 border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 text-white/70 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all duration-500"
                onClick={() => handleSocialLogin('google')}
                disabled={loading || socialLoading !== null}
              >
                {socialLoading === 'google' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <div className="flex items-center gap-3">
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>Google</span>
                  </div>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-14 border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 text-white/70 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all duration-500"
                onClick={() => handleSocialLogin('apple')}
                disabled={loading || socialLoading !== null}
              >
                {socialLoading === 'apple' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <div className="flex items-center gap-3">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                    </svg>
                    <span>Apple</span>
                  </div>
                )}
              </Button>
            </div>

            <p className="text-[10px] text-center text-white/20 font-medium italic">
              {t('signupPage.pricingNote')}
            </p>
            
            <div className="text-[11px] text-center text-white/30 space-y-4 font-medium uppercase tracking-widest pt-4 w-full">
              <div className="flex items-center justify-center gap-6">
                <span className="text-white/20">{t('signupPage.hasAccount')}</span>
                <Link to="/login" className="text-cta-positive/70 hover:text-cta-positive transition-colors duration-300">
                  {t('signupPage.signIn')}
                </Link>
              </div>
              <div className="pt-6 border-t border-white/5">
                <Link to="/" className="hover:text-white/60 transition-colors duration-300">
                  {t('loginPage.backToHome')}
                </Link>
              </div>
            </div>
            
            <SecurityFooter />
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
