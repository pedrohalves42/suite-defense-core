import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AutomationSettings } from '@/components/settings/AutomationSettings';
import type { TenantSettings } from '../types';

interface FeaturesTabProps {
  settings: Partial<TenantSettings>;
  setSettings: (s: Partial<TenantSettings>) => void;
  canWrite: boolean;
  onSave: () => void;
  isSaving: boolean;
}

export function FeaturesTab({ settings, setSettings, canWrite, onSave, isSaving }: FeaturesTabProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('adminPages.settings.featureFlags')}</CardTitle>
          <CardDescription>{t('adminPages.settings.featureFlagsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <Label>{t('adminPages.settings.emailAlerts')}</Label>
              <p className="text-sm text-muted-foreground">{t('adminPages.settings.emailAlertsDesc')}</p>
            </div>
            <Switch checked={settings.enable_email_alerts} onCheckedChange={(checked) => setSettings({ ...settings, enable_email_alerts: checked })} disabled={!canWrite} />
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <Label>{t('adminPages.settings.webhookAlerts')}</Label>
              <p className="text-sm text-muted-foreground">{t('adminPages.settings.webhookAlertsDesc')}</p>
            </div>
            <Switch checked={settings.enable_webhook_alerts} onCheckedChange={(checked) => setSettings({ ...settings, enable_webhook_alerts: checked })} disabled={!canWrite} />
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex-1 pr-4">
              <div className="flex items-center gap-2">
                <Label>{t('adminPages.settings.autoQuarantine')}</Label>
                {settings.enable_auto_quarantine && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">{t('common.status')}</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{t('adminPages.settings.autoQuarantineDesc')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('adminPages.settings.autoQuarantineNote')}</p>
            </div>
            <Switch checked={settings.enable_auto_quarantine} onCheckedChange={(checked) => setSettings({ ...settings, enable_auto_quarantine: checked })} disabled={!canWrite} />
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex-1 pr-4">
              <div className="flex items-center gap-2">
                <Label>{t('adminPages.settings.autoPlaybooks')}</Label>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">{t('adminPages.settings.autoPlaybooksConfigured')}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{t('adminPages.settings.autoPlaybooksDesc')}</p>
            </div>
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="flex items-center justify-between py-3">
            <div className="flex-1 pr-4">
              <div className="flex items-center gap-2">
                {settings.enable_dry_run_mode ? <EyeOff className="h-5 w-5 text-amber-500" /> : <Eye className="h-5 w-5 text-muted-foreground" />}
                <Label>{t('adminPages.settings.shadowMode')}</Label>
                {settings.enable_dry_run_mode && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{t('common.status')}</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{t('adminPages.settings.shadowModeDesc')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('adminPages.settings.shadowModeNote')}</p>
            </div>
            <Switch checked={settings.enable_dry_run_mode} onCheckedChange={(checked) => setSettings({ ...settings, enable_dry_run_mode: checked })} disabled={!canWrite} />
          </div>
          {canWrite && (
            <Button onClick={onSave} disabled={isSaving} className="mt-4">{t('adminPages.settings.saveFeatureFlags')}</Button>
          )}
        </CardContent>
      </Card>
      <AutomationSettings />
    </div>
  );
}
