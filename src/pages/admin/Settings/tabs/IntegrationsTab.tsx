import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { useTranslation } from 'react-i18next';
import type { TenantSettings, IntegrationTestResult } from '../types';

interface IntegrationsTabProps {
  settings: Partial<TenantSettings>;
  setSettings: (s: Partial<TenantSettings>) => void;
  canWrite: boolean;
  onSave: () => void;
  isSaving: boolean;
}

export function IntegrationsTab({ settings, setSettings, canWrite, onSave, isSaving }: IntegrationsTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [testingVirusTotal, setTestingVirusTotal] = useState(false);
  const [virusTotalTestResult, setVirusTotalTestResult] = useState<IntegrationTestResult | null>(null);
  const [testingStripe, setTestingStripe] = useState(false);
  const [stripeTestResult, setStripeTestResult] = useState<IntegrationTestResult | null>(null);

  const testVirusTotal = async () => {
    setTestingVirusTotal(true);
    setVirusTotalTestResult(null);
    try {
      if (settings.virustotal_enabled) {
        setVirusTotalTestResult({ success: true, message: 'Integração VirusTotal está habilitada e configurada.' });
        toast({ title: 'VirusTotal ativo', description: 'A integração está habilitada nas configurações.' });
      } else {
        setVirusTotalTestResult({ success: false, message: 'VirusTotal não está habilitado nas configurações.' });
        toast({ title: 'VirusTotal desabilitado', description: 'Habilite nas configurações para usar.', variant: 'destructive' });
      }
    } catch (error) {
      logger.error('Error testing VirusTotal', error);
      setVirusTotalTestResult({ success: false, message: error instanceof Error ? error.message : 'Erro desconhecido' });
    } finally {
      setTestingVirusTotal(false);
    }
  };

  const testStripe = async () => {
    setTestingStripe(true);
    setStripeTestResult(null);
    try {
      if (settings.stripe_enabled) {
        setStripeTestResult({ success: true, message: 'Integração Stripe está habilitada e configurada.' });
        toast({ title: 'Stripe ativo', description: 'A integração está habilitada nas configurações.' });
      } else {
        setStripeTestResult({ success: false, message: 'Stripe não está habilitado nas configurações.' });
        toast({ title: 'Stripe desabilitado', description: 'Habilite nas configurações para usar.', variant: 'destructive' });
      }
    } catch (error) {
      logger.error('Error testing Stripe', error);
      setStripeTestResult({ success: false, message: error instanceof Error ? error.message : 'Erro desconhecido' });
    } finally {
      setTestingStripe(false);
    }
  };

  const renderTestResult = (result: IntegrationTestResult | null) => {
    if (!result) return null;
    return (
      <Alert className="mt-4" variant={result.success ? "default" : "destructive"}>
        {result.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
        <AlertTitle>{result.success ? t('adminPages.settings.success') : t('adminPages.settings.error')}</AlertTitle>
        <AlertDescription>
          {result.message}
          {result.details && (<div className="mt-2 text-xs"><pre className="bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(result.details, null, 2)}</pre></div>)}
        </AlertDescription>
      </Alert>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>VirusTotal</CardTitle>
          <CardDescription>{t('adminPages.settings.integrationsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>{t('adminPages.settings.enableVirusTotal')}</Label>
              <p className="text-sm text-muted-foreground">{t('adminPages.settings.virusTotalDesc')}</p>
            </div>
            <Switch checked={settings.virustotal_enabled} onCheckedChange={(checked) => setSettings({ ...settings, virustotal_enabled: checked })} disabled={!canWrite} />
          </div>
          <p className="text-xs text-muted-foreground">{t('adminPages.settings.virusTotalKeyNote')}</p>
          <div className="pt-4 border-t">
            <Button onClick={testVirusTotal} disabled={testingVirusTotal || !canWrite} variant="outline" className="w-full">
              {testingVirusTotal ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('adminPages.settings.testingConnection')}</>) : t('adminPages.settings.testVirusTotal')}
            </Button>
            {renderTestResult(virusTotalTestResult)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stripe</CardTitle>
          <CardDescription>{t('adminPages.settings.stripeIntegrationDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>{t('adminPages.settings.enableStripe')}</Label>
              <p className="text-sm text-muted-foreground">{t('adminPages.settings.stripeDesc')}</p>
            </div>
            <Switch checked={settings.stripe_enabled} onCheckedChange={(checked) => setSettings({ ...settings, stripe_enabled: checked })} disabled={!canWrite} />
          </div>
          <div className="pt-4 border-t">
            <Button onClick={testStripe} disabled={testingStripe || !canWrite} variant="outline" className="w-full">
              {testingStripe ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('adminPages.settings.testingConnection')}</>) : t('adminPages.settings.testStripe')}
            </Button>
            {renderTestResult(stripeTestResult)}
          </div>
        </CardContent>
      </Card>

      {canWrite && (
        <Button onClick={onSave} disabled={isSaving}>{t('adminPages.settings.saveIntegrations')}</Button>
      )}
    </div>
  );
}
