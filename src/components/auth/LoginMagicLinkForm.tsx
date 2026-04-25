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
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-3">
          <Label htmlFor="magic-email" className="text-white/70 font-bold text-[11px] uppercase tracking-[0.15em] ml-1">
            {t('loginPage.magicLinkEmail')}
          </Label>
          <div className="relative group">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20 group-focus-within:text-cta-positive transition-all duration-500" />
            <Input
              id="magic-email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={255}
              className="pl-12 h-14 border-white/5 focus:border-cta-positive/30 focus:ring-0 transition-all duration-500 bg-white/[0.02] hover:bg-white/[0.04] text-white rounded-2xl placeholder:text-white/10"
            />
            <div className="absolute inset-0 rounded-2xl border border-cta-positive/0 group-focus-within:border-cta-positive/20 pointer-events-none transition-all duration-500" />
          </div>
        </div>
        
        <div className="bg-white/[0.03] backdrop-blur-md p-5 rounded-2xl border border-white/5 group hover:border-white/10 transition-all duration-500">
          <p className="flex items-start gap-4">
            <div className="mt-1 p-1.5 rounded-lg bg-white/5 text-white/40 group-hover:text-cta-positive transition-colors duration-500">
              <Mail className="h-4 w-4" />
            </div>
            <span className="text-[13px] leading-relaxed text-white/40 font-medium">{t('loginPage.magicLinkDesc')}</span>
          </p>
        </div>

        {magicLinkSent && (
          <Alert className="border-cta-positive/30 bg-cta-positive/5 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-500 rounded-2xl">
            <Mail className="h-4 w-4 text-cta-positive animate-pulse" />
            <AlertDescription className="text-cta-positive/90 font-bold uppercase tracking-wider text-[10px]">
              {t('loginPage.magicLinkSent')}
            </AlertDescription>
          </Alert>
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
              {t('loginPage.sending')}
            </>
          ) : (
            t('loginPage.sendMagicLink')
          )}
        </Button>
        <div className="text-[11px] text-center text-white/30 space-y-4 font-medium uppercase tracking-widest pt-4">
          <div>
            {t('loginPage.noAccount')}{' '}
            <Link to="/signup" className="text-cta-positive/70 hover:text-cta-positive transition-colors duration-300">
              {t('loginPage.signUp')}
            </Link>
          </div>
          <div className="pt-6 border-t border-white/5">
            <Link to="/" className="hover:text-white/60 transition-colors duration-300">
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
