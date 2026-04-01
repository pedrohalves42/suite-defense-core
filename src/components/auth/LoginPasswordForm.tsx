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
              autoComplete="username"
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
              autoComplete="current-password"
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
