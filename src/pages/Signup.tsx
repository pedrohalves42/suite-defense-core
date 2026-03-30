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
import logoImage from '@/assets/logo-cybshield-new.png';
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
        await supabase.functions.invoke('notification-router', {
          body: {
            action: 'welcome',
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-[460px] card-enterprise rounded-xl relative z-10 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent" />
        <CardHeader className="space-y-1 text-center pb-2 pt-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-muted/50 rounded-xl border border-border">
              <img src={logoImage} alt="CyberShield" className="h-10 w-10 object-contain" />
            </div>
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight text-foreground">
            {t('signupPage.title')}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            {t('signupPage.subtitle')}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSignup}>
          <CardContent className="space-y-4 px-6">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-xs font-medium text-muted-foreground/80">{t('signupPage.fullName')}</Label>
              <Input
                id="fullName"
                type="text"
                placeholder={t('signupPage.fullNamePlaceholder')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
                maxLength={100}
                className="h-10 bg-background/50 border-border/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground/80">{t('signupPage.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('signupPage.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
                className="h-10 bg-background/50 border-border/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deviceCount" className="text-xs font-medium text-muted-foreground/80">{t('signupPage.deviceCount')}</Label>
              <Select value={deviceCount} onValueChange={setDeviceCount}>
                <SelectTrigger className="h-10 bg-background/50 border-border/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all">
                  <SelectValue placeholder={t('signupPage.selectOption')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-3">{t('signupPage.devices1to3')}</SelectItem>
                  <SelectItem value="4-10">{t('signupPage.devices4to10')}</SelectItem>
                  <SelectItem value="11-30">{t('signupPage.devices11to30')}</SelectItem>
                  <SelectItem value="31-100">{t('signupPage.devices31to100')}</SelectItem>
                  <SelectItem value="100+">{t('signupPage.devices100plus')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground/80">{t('signupPage.password')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  maxLength={72}
                  className="h-10 pr-10 bg-background/50 border-border/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-1">
                {t('signupPage.passwordHint')}
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 px-6 pb-6">
            <Button 
              type="submit" 
              className="w-full h-10 bg-primary/90 hover:bg-primary text-primary-foreground font-medium transition-all duration-200" 
              disabled={loading}
            >
              {loading ? t('signupPage.creating') : t('signupPage.submit')}
            </Button>
            
            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/40" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-3 text-muted-foreground/60">{t('signupPage.orSignUpWith')}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200"
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
                className="h-10 border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200"
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

            <p className="text-[10px] text-center text-muted-foreground/50">
              {t('signupPage.pricingNote')}
            </p>
            <div className="text-xs text-center text-muted-foreground/60">
              {t('signupPage.hasAccount')}{' '}
              <Link to="/login" className="text-primary/80 hover:text-primary transition-colors">
                {t('signupPage.signIn')}
              </Link>
            </div>
            
            <SecurityFooter />
            <BrandSignature />
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
