import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { useTranslation } from 'react-i18next';
import { loginSchema, getLoginEmail } from './loginSchema';

export function useLoginFlow() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();

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

  useEffect(() => {
    const checkFailedAttempts = async () => {
      const { data, error } = await supabase.functions.invoke('check-failed-logins', {
        body: {},
      });

      if (!error && data) {
        if (data.blocked) {
          toast({
            variant: 'destructive',
            title: t('loginPage.ipBlocked'),
            description: t('loginPage.ipBlockedDesc', { until: formatBrazilDateTime(data.blockedUntil, 'datetime'), count: data.attemptCount || 5 }),
            duration: 15000,
          });
          setLoading(true);
          return;
        }

        setRequiresCaptcha(data.requiresCaptcha);
        setAttemptCount(data.attemptCount);

        if (data.requiresCaptcha) {
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

  const completeLogin = async () => {
    setVerifyingSession(true);

    await supabase.functions.invoke('clear-failed-logins', { body: {} });

    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const [adminCheck, superAdminCheck] = await Promise.all([
        supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' }),
        supabase.rpc('has_role', { _user_id: user.id, _role: 'super_admin' }),
      ]);

      const isAdmin = adminCheck.data === true;
      const isSuperAdmin = superAdminCheck.data === true;

      const { data: factors } = await supabase.auth.mfa.listFactors();
      const hasMFA = factors?.totp?.some(f => f.status === 'verified') ?? false;

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

    setVerifyingSession(false);
    setSessionVerified(true);
    await new Promise(resolve => setTimeout(resolve, 1200));
    navigate('/dashboard');
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (requiresCaptcha && !captchaToken) {
      toast({
        variant: 'destructive',
        title: t('loginPage.captchaRequired'),
        description: t('loginPage.captchaRequired'),
      });
      setLoading(false);
      return;
    }

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

    const loginEmail = getLoginEmail(validation.data.identifier);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: validation.data.password,
    });

    if (error) {
      if (error.message?.includes('mfa_required') ||
          'code' in error && (error as { code?: string }).code === 'mfa_required') {
        setShowMFADialog(true);
        setLoading(false);
        return;
      }

      try {
        await supabase.functions.invoke('record-failed-login', {
          body: { email: loginEmail },
        });
      } catch (recordError) {
        logger.error('Failed to record login attempt', recordError);
      }

      const newCount = attemptCount + 1;
      setAttemptCount(newCount);
      if (newCount >= 3) {
        setRequiresCaptcha(true);
        window.location.reload();
      }

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

      toast({ variant: 'destructive', title: message, description });
      setLoading(false);
      return;
    }

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasVerifiedTOTP = factors?.totp?.some(f => f.status === 'verified');

    if (hasVerifiedTOTP) {
      setShowMFADialog(true);
      setLoading(false);
      return;
    }

    await completeLogin();
  };

  const handleMFASuccess = async () => {
    setShowMFADialog(false);
    await completeLogin();
  };

  const handleMFACancel = async () => {
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

  return {
    email, setEmail,
    password, setPassword,
    loading, socialLoading,
    magicLinkSent, requiresCaptcha, attemptCount,
    showPassword, setShowPassword,
    showMFADialog, setShowMFADialog,
    verifyingSession, sessionVerified,
    handleLogin, handleMagicLink, handleSocialLogin,
    handleMFASuccess, handleMFACancel,
  };
}
