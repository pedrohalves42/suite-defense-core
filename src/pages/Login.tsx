import { Shield } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from 'react-i18next';
import { MFAVerificationDialog } from '@/components/mfa/MFAVerificationDialog';
import { SecurityCheckScreen } from '@/components/auth/SecurityCheckScreen';
import { SessionVerifiedScreen } from '@/components/auth/SessionVerifiedScreen';
import { LoginPasswordForm } from '@/components/auth/LoginPasswordForm';
import { LoginMagicLinkForm } from '@/components/auth/LoginMagicLinkForm';
import { useLoginFlow } from '@/components/auth/useLoginFlow';
import logoImage from '@/assets/logo-cybshield-new.png';

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
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-[460px] card-enterprise animate-fade-in relative z-10 rounded-xl overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent" />
        <CardHeader className="space-y-1 text-center pb-6 pt-8">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-muted/50 rounded-xl border border-border">
              <img src={logoImage} alt="CyberShield" className="h-12 w-12 object-contain" />
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

          <TabsContent value="magic">
            <LoginMagicLinkForm
              email={flow.email}
              setEmail={flow.setEmail}
              loading={flow.loading}
              magicLinkSent={flow.magicLinkSent}
              onSubmit={flow.handleMagicLink}
            />
          </TabsContent>
        </Tabs>
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
