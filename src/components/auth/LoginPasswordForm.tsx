import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardContent, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Lock, Loader2, Eye, EyeOff, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SecurityFooter, BrandSignature } from '@/components/auth/SecurityFooter';
import { SocialLoginButtons } from './SocialLoginButtons';

interface LoginPasswordFormProps {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  loading: boolean;
  socialLoading: 'google' | 'apple' | null;
  requiresCaptcha: boolean;
  attemptCount: number;
  onSubmit: (e: React.FormEvent) => void;
  onSocialLogin: (provider: 'google' | 'apple') => void;
}

export const LoginPasswordForm = ({
  email, setEmail, password, setPassword,
  showPassword, setShowPassword,
  loading, socialLoading, requiresCaptcha, attemptCount,
  onSubmit, onSocialLogin,
}: LoginPasswordFormProps) => {
  const { t } = useTranslation();

  return (
    <form onSubmit={onSubmit}>
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
        <div className="space-y-3">
          <Label htmlFor="email" className="text-white/70 font-bold text-[11px] uppercase tracking-[0.15em] ml-1">
            {t('loginPage.emailOrUsername')}
          </Label>
          <div className="relative group">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20 group-focus-within:text-cta-positive transition-all duration-500" />
            <Input
              id="email"
              type="text"
              placeholder={t('loginPage.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              maxLength={255}
              className="pl-12 h-14 border-white/5 focus:border-cta-positive/30 focus:ring-0 transition-all duration-500 bg-white/[0.02] hover:bg-white/[0.04] text-white rounded-2xl placeholder:text-white/10"
            />
            <div className="absolute inset-0 rounded-2xl border border-cta-positive/0 group-focus-within:border-cta-positive/20 pointer-events-none transition-all duration-500" />
          </div>
        </div>
        <div className="space-y-3 pt-2">
          <Label htmlFor="password" className="text-white/70 font-bold text-[11px] uppercase tracking-[0.15em] ml-1">
            {t('loginPage.password')}
          </Label>
          <div className="relative group">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20 group-focus-within:text-cta-positive transition-all duration-500" />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              maxLength={72}
              className="pl-12 pr-12 h-14 border-white/5 focus:border-cta-positive/30 focus:ring-0 transition-all duration-500 bg-white/[0.02] hover:bg-white/[0.04] text-white rounded-2xl placeholder:text-white/10"
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
        </div>
        {requiresCaptcha && (
          <div id="captcha-container" className="flex justify-center pt-2" />
        )}
      </CardContent>
      <CardFooter className="flex flex-col space-y-6 px-10 pt-8 pb-0">
        <Button
          type="submit"
          className="w-full h-14 bg-white text-black hover:bg-white/90 font-bold rounded-2xl shadow-[0_10px_25px_rgba(255,255,255,0.1)] hover:shadow-[0_15px_35px_rgba(255,255,255,0.2)] transition-all duration-500 text-sm uppercase tracking-[0.1em]"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('loginPage.verifying')}
            </>
          ) : (
            t('loginPage.continueSecurely')
          )}
        </Button>

        <SocialLoginButtons loading={loading} socialLoading={socialLoading} onSocialLogin={onSocialLogin} />

        <div className="text-sm text-center text-muted-foreground/60 space-y-2">
          <div>
            <Link to="/forgot-password" className="text-primary/80 hover:text-primary font-medium transition-colors duration-200">
              {t('loginPage.forgotPassword')}
            </Link>
          </div>
          <div>
            {t('loginPage.noAccount')}{' '}
            <Link to="/signup" className="text-primary/80 hover:text-primary font-medium transition-colors duration-200">
              {t('loginPage.signUp')}
            </Link>
          </div>
          <div className="pt-2 border-t border-border/30 mt-2">
            <Link to="/" className="text-muted-foreground/70 hover:text-primary/80 transition-colors duration-200 text-xs">
              {t('loginPage.backToHome')}
            </Link>
          </div>
        </div>

        <SecurityFooter />
        <BrandSignature />
      </CardFooter>
    </form>
  );
};
