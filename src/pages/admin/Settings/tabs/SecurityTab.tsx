import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MFASettings } from '@/components/mfa/MFASettings';
import { SecurityKeysManager } from '@/components/security/SecurityKeysManager';
import { PasswordChangeCard } from '@/components/settings/PasswordChangeCard';

export function SecurityTab() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <MFASettings />
      <SecurityKeysManager />
      <PasswordChangeCard />
      <Card>
        <CardHeader>
          <CardTitle>{t('adminPages.settings.securityTips')}</CardTitle>
          <CardDescription>{t('adminPages.settings.securityTipsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { title: t('adminPages.settings.strongPasswords'), desc: t('adminPages.settings.strongPasswordsDesc') },
            { title: t('adminPages.settings.enable2FA'), desc: t('adminPages.settings.enable2FADesc') },
            { title: t('adminPages.settings.keepEmailUpdated'), desc: t('adminPages.settings.keepEmailUpdatedDesc') },
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <Shield className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">{tip.title}</p>
                <p className="text-sm text-muted-foreground">{tip.desc}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
