import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardContent, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SecurityFooter, BrandSignature } from '@/components/auth/SecurityFooter';

interface LoginMagicLinkFormProps {
  email: string;
  setEmail: (v: string) => void;
  loading: boolean;
  magicLinkSent: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export const LoginMagicLinkForm = ({ email, setEmail, loading, magicLinkSent, onSubmit }: LoginMagicLinkFormProps) => {
  const { t } = useTranslation();

  return (
    <form onSubmit={onSubmit}>
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
            <span className="leading-relaxed">{t('loginPage.magicLinkDesc')}</span>
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
