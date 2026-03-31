import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useTranslation } from 'react-i18next';
import type { TenantSettings, IntegrationTestResult } from '../types';

interface AlertsTabProps {
  settings: Partial<TenantSettings>;
  setSettings: (s: Partial<TenantSettings>) => void;
  canWrite: boolean;
  tenantId?: string;
  onSave: () => void;
  isSaving: boolean;
}

export function AlertsTab({ settings, setSettings, canWrite, tenantId, onSave, isSaving }: AlertsTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<IntegrationTestResult | null>(null);

  const testWebhook = async () => {
    setTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      if (!settings.alert_webhook_url) {
        setWebhookTestResult({ success: false, message: 'Nenhuma URL de webhook configurada.' });
        toast({ title: 'Webhook não configurado', description: 'Configure uma URL de webhook primeiro.', variant: 'destructive' });
        return;
      }
      const { error } = await supabase.functions.invoke('ops-router', {
        body: { action: 'notify:dispatch', payload: { event: 'webhook_test', severity: 'info', tenantId, details: { test: true, timestamp: new Date().toISOString() } } }
      });
      if (error) throw error;
      setWebhookTestResult({ success: true, message: 'Webhook de teste enviado com sucesso.' });
      toast({ title: 'Teste bem-sucedido', description: 'Notificação de teste disparada.' });
    } catch (error) {
      logger.error('Error testing webhook', error);
      setWebhookTestResult({ success: false, message: error instanceof Error ? error.message : 'Erro desconhecido' });
      toast({ title: 'Erro ao testar webhook', description: 'Verifique os logs para mais detalhes', variant: 'destructive' });
    } finally {
      setTestingWebhook(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('adminPages.settings.alertSettings')}</CardTitle>
        <CardDescription>{t('adminPages.settings.alertSettingsDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>{t('adminPages.settings.alertEmail')}</Label>
          <Input type="email" value={settings.alert_email || ''} onChange={(e) => setSettings({ ...settings, alert_email: e.target.value })} placeholder="admin@exemplo.com" disabled={!canWrite} />
          <p className="text-sm text-muted-foreground mt-1">{t('adminPages.settings.alertEmailDesc')}</p>
        </div>
        <div>
          <Label>{t('adminPages.settings.webhookUrl')}</Label>
          <Input type="url" value={settings.alert_webhook_url || ''} onChange={(e) => setSettings({ ...settings, alert_webhook_url: e.target.value })} placeholder="https://exemplo.com/webhook" disabled={!canWrite} />
          <p className="text-sm text-muted-foreground mt-1">{t('adminPages.settings.webhookUrlDesc')}</p>
        </div>
        <div className="pt-4 border-t">
          <Button onClick={testWebhook} disabled={testingWebhook || !canWrite || !settings.alert_webhook_url} variant="outline" className="w-full">
            {testingWebhook ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('adminPages.settings.sendingPing')}</>) : t('adminPages.settings.testWebhook')}
          </Button>
          {webhookTestResult && (
            <Alert className="mt-4" variant={webhookTestResult.success ? "default" : "destructive"}>
              {webhookTestResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <AlertTitle>{webhookTestResult.success ? t('adminPages.settings.success') : t('adminPages.settings.error')}</AlertTitle>
              <AlertDescription>
                {webhookTestResult.message}
                {webhookTestResult.details && (<div className="mt-2 text-xs"><pre className="bg-muted p-2 rounded overflow-x-auto max-h-48">{JSON.stringify(webhookTestResult.details, null, 2)}</pre></div>)}
              </AlertDescription>
            </Alert>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>{t('adminPages.settings.virusThreshold')}</Label>
            <Input type="number" min="1" value={settings.alert_threshold_virus_positive} onChange={(e) => setSettings({ ...settings, alert_threshold_virus_positive: parseInt(e.target.value) })} disabled={!canWrite} />
          </div>
          <div>
            <Label>{t('adminPages.settings.failedJobsThreshold')}</Label>
            <Input type="number" min="1" value={settings.alert_threshold_failed_jobs} onChange={(e) => setSettings({ ...settings, alert_threshold_failed_jobs: parseInt(e.target.value) })} disabled={!canWrite} />
          </div>
          <div>
            <Label>{t('adminPages.settings.offlineAgentsThreshold')}</Label>
            <Input type="number" min="1" value={settings.alert_threshold_offline_agents} onChange={(e) => setSettings({ ...settings, alert_threshold_offline_agents: parseInt(e.target.value) })} disabled={!canWrite} />
          </div>
        </div>
        {canWrite && (
          <Button onClick={onSave} disabled={isSaving}>{t('adminPages.settings.saveAlertSettings')}</Button>
        )}
      </CardContent>
    </Card>
  );
}
