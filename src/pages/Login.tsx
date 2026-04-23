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
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-accent/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
      </div>

      <Card className="w-full max-w-[480px] border border-white/5 bg-black/40 backdrop-blur-2xl shadow-2xl relative z-10 rounded-2xl overflow-hidden animate-in fade-in zoom-in duration-500">
        {/* Modern Top Border Gradient */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
        
        <CardHeader className="space-y-4 text-center pb-8 pt-10">
          <div className="flex justify-center mb-2">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
              <div className="relative p-5 bg-slate-900/80 rounded-2xl border border-white/10 backdrop-blur-xl">
                <img src={logoImage} alt="CyberShield" className="h-14 w-14 object-contain" />
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <CardTitle className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/70">
              {t('loginPage.title')}
            </CardTitle>
            <CardDescription className="text-base text-slate-400 font-medium flex items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
                <Lock className="h-3.5 w-3.5" />
                {t('loginPage.enterprise')}
              </span>
              <span>{t('loginPage.subtitle')}</span>
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="px-8 pb-10">
          <Tabs defaultValue="password" className="w-full space-y-8">
            <TabsList className="grid w-full grid-cols-2 h-12 bg-slate-900/50 p-1 border border-white/5 rounded-xl">
              <TabsTrigger
                value="password"
                className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300 font-semibold text-sm gap-2"
                aria-label={t('loginPage.passwordTab')}
              >
                <Key className="h-4 w-4" />
                {t('loginPage.passwordTab')}
              </TabsTrigger>
              <TabsTrigger
                value="magic"
                className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300 font-semibold text-sm gap-2"
                aria-label={t('loginPage.magicTab')}
              >
                <Mail className="h-4 w-4" />
                {t('loginPage.magicTab')}
              </TabsTrigger>
            </TabsList>

            <div className="relative">
              <TabsContent value="password" className="mt-0 animate-in slide-in-from-left-4 duration-300">
                <div className="space-y-4">
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
                </div>
              </TabsContent>

              <TabsContent value="magic" className="mt-0 animate-in slide-in-from-right-4 duration-300">
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

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} CyberShield Enterprise. All rights reserved.
              <br />
              <span className="inline-block mt-2 opacity-70">
                Authorized access only. All activities are monitored.
              </span>
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
