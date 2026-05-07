import { Link } from 'react-router-dom';
import { Shield, Lock, ArrowRight, Mail, Key } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from 'react-i18next';
import { MFAVerificationDialog } from '@/components/mfa/MFAVerificationDialog';
import { SecurityCheckScreen } from '@/components/auth/SecurityCheckScreen';
import { SessionVerifiedScreen } from '@/components/auth/SessionVerifiedScreen';
import { LoginPasswordForm } from '@/components/auth/LoginPasswordForm';
import { LoginMagicLinkForm } from '@/components/auth/LoginMagicLinkForm';
import { useLoginFlow } from '@/components/auth/useLoginFlow';
import { cn } from '@/lib/utils';
import logoImage from '@/assets/logo-cybshield-new.webp';

export default function Login() {
  const { t } = useTranslation();
  const flow = useLoginFlow();

  if (flow.verifyingSession) {
    return <SecurityCheckScreen />;
  }

  if (flow.sessionVerified) {
    return <SessionVerifiedScreen showMFA={flow.showMFADialog} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#020203] relative overflow-hidden">
      {/* Strategic Background - Premium Obsidian */}
      <div className="absolute inset-0 bg-[#020203] overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-cta-positive/10 rounded-full blur-[160px] animate-pulse-subtle" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-info/5 rounded-full blur-[140px]" />
      </div>
      
      {/* Subtle refined grid */}
      <div className="absolute inset-0 opacity-[0.05] z-0" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
        backgroundSize: '80px 80px'
      }} />

      <Card className="w-full max-w-[460px] glass-card relative z-10 rounded-[2.5rem] overflow-hidden animate-in fade-in zoom-in-95 duration-1000 ease-out border-white/5 shadow-2xl">
        {/* light streak */}
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cta-positive/30 to-transparent" />
        
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
            <CardTitle className="text-4xl md:text-5xl font-display font-extrabold tracking-tight text-white leading-tight">
              {t('loginPage.title')}
            </CardTitle>
            <div className="flex flex-col items-center gap-3">
              <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-cta-positive/10 border border-cta-positive/20 text-cta-positive text-[10px] font-black uppercase tracking-[0.2em] shadow-glow">
                <Lock className="h-3 w-3" />
                {t('loginPage.enterprise')}
              </div>
              <CardDescription className="text-lg text-white/40 font-medium max-w-[280px] leading-relaxed mx-auto">
                {t('loginPage.subtitle')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-10 pb-12 pt-8">
          <Tabs defaultValue="password" className="w-full space-y-10">
            <TabsList className="grid w-full grid-cols-2 h-14 bg-white/[0.04] p-1.5 border border-white/5 rounded-2xl">
              <TabsTrigger
                value="password"
                className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-[0_8px_20px_rgba(255,255,255,0.2)] transition-all duration-500 font-bold text-xs uppercase tracking-wider gap-2.5"
                aria-label={t('loginPage.passwordTab')}
              >
                <Key className="h-4 w-4" />
                {t('loginPage.passwordTab')}
              </TabsTrigger>
              <TabsTrigger
                value="magic"
                className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-[0_8px_20px_rgba(255,255,255,0.2)] transition-all duration-500 font-bold text-xs uppercase tracking-wider gap-2.5"
                aria-label={t('loginPage.magicTab')}
              >
                <Mail className="h-4 w-4" />
                {t('loginPage.magicTab')}
              </TabsTrigger>
            </TabsList>

            <div className="relative min-h-[300px]">
              <TabsContent value="password" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
                <LoginPasswordForm
                  email={flow.email}
                  setEmail={flow.setEmail}
                  password={flow.password}
                  setPassword={flow.setPassword}
                  showPassword={flow.showPassword}
                  setShowPassword={flow.setShowPassword}
                  loading={flow.loading}
                  socialLoading={flow.socialLoading}
                  requiresCaptcha={flow.requiresCaptcha}
                  attemptCount={flow.attemptCount}
                  onSubmit={flow.handleLogin}
                  onSocialLogin={flow.handleSocialLogin}
                />
              </TabsContent>

              <TabsContent value="magic" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
                <LoginMagicLinkForm
                  email={flow.email}
                  setEmail={flow.setEmail}
                  loading={flow.loading}
                  magicLinkSent={flow.magicLinkSent}
                  onSubmit={flow.handleMagicLink}
                />
              </TabsContent>
            </div>
          </Tabs>

          <div className="mt-12 pt-8 border-t border-white/5 text-center">
            <p className="text-[11px] text-white/20 font-medium tracking-widest uppercase">
              © {new Date().getFullYear()} CyberShield Global Security
            </p>
            <p className="mt-3 text-[10px] text-white/10 font-medium italic">
              Este sistema é monitorado. Acessos não autorizados serão processados.
            </p>
          </div>
        </CardContent>
      </Card>

      <MFAVerificationDialog
        open={flow.showMFADialog}
        onOpenChange={flow.setShowMFADialog}
        onSuccess={flow.handleMFASuccess}
        onCancel={flow.handleMFACancel}
      />
    </div>
  );
}
