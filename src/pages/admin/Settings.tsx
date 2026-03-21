import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/hooks/useTenant';
import { useUserRole } from '@/hooks/useUserRole';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, Loader2, Shield, Eye, EyeOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { logger } from '@/lib/logger';
import { MFASettings } from '@/components/mfa/MFASettings';
import { PasswordChangeCard } from '@/components/settings/PasswordChangeCard';
import { AutomationSettings } from '@/components/settings/AutomationSettings';
import { useTranslation } from 'react-i18next';

interface TenantSettings {
  id: string;
  tenant_id: string;
  alert_email: string | null;
  alert_webhook_url: string | null;
  alert_threshold_virus_positive: number;
  alert_threshold_failed_jobs: number;
  alert_threshold_offline_agents: number;
  virustotal_enabled: boolean;
  stripe_enabled: boolean;
  enable_email_alerts: boolean;
  enable_webhook_alerts: boolean;
  enable_auto_quarantine: boolean;
  enable_dry_run_mode: boolean;
}

export default function Settings() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { tenant, loading: tenantLoading } = useTenant();
  const { canWrite, loading: roleLoading } = useUserRole();
  
  const [tenantName, setTenantName] = useState('');
  const [settings, setSettings] = useState<Partial<TenantSettings>>({
    alert_email: '',
    alert_webhook_url: '',
    alert_threshold_virus_positive: 1,
    alert_threshold_failed_jobs: 5,
    alert_threshold_offline_agents: 3,
    virustotal_enabled: false,
    stripe_enabled: false,
    enable_email_alerts: true,
    enable_webhook_alerts: false,
    enable_auto_quarantine: false,
    enable_dry_run_mode: false,
  });

  const [virusTotalTestResult, setVirusTotalTestResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);
  const [stripeTestResult, setStripeTestResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);
  const [webhookTestResult, setWebhookTestResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);
  const [testingVirusTotal, setTestingVirusTotal] = useState(false);
  const [testingStripe, setTestingStripe] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);

  // Fetch tenant settings
  const { data: tenantSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ['tenant-settings', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      
      const { data, error } = await supabase
        .from('tenant_settings')
        .select('id, tenant_id, alert_email, alert_webhook_url, enable_email_alerts, enable_webhook_alerts, enable_auto_quarantine, enable_dry_run_mode, virustotal_enabled, dns_local_filter_enabled, alert_threshold_failed_jobs, alert_threshold_offline_agents, alert_threshold_virus_positive, force_human_review_critical, stripe_enabled, business_hours, created_at, updated_at')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      
      if (error) throw error;
      
      // Create default settings if none exist
      if (!data) {
        const { data: newSettings, error: insertError } = await supabase
          .from('tenant_settings')
          .insert({ tenant_id: tenant.id })
          .select()
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (insertError) throw insertError;
        return newSettings;
      }
      
      return data;
    },
    enabled: !!tenant?.id,
  });

  useEffect(() => {
    if (tenantSettings) {
      setSettings(tenantSettings);
    }
  }, [tenantSettings]);

  const updateTenant = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error('Tenant nao encontrado');
      
      const { error } = await supabase
        .from('tenants')
        .update({ name: tenantName })
        .eq('id', tenant.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      toast({ title: 'Nome do tenant atualizado!' });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar tenant', variant: 'destructive' });
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (newSettings: Partial<TenantSettings>) => {
      if (!tenant) throw new Error('Tenant nao encontrado');
      
      // Validate email if provided
      if (newSettings.alert_email && !newSettings.alert_email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        throw new Error('Email invalido');
      }
      
      // Validate webhook URL if provided
      if (newSettings.alert_webhook_url && !newSettings.alert_webhook_url.match(/^https?:\/\/.+/)) {
        throw new Error('URL do webhook invalida');
      }
      
      const { error } = await supabase
        .from('tenant_settings')
        .update(newSettings)
        .eq('tenant_id', tenant.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      toast({ title: 'Configuracoes atualizadas com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Erro ao atualizar configuracoes', variant: 'destructive' });
    },
  });

  const testVirusTotalIntegration = async () => {
    setTestingVirusTotal(true);
    setVirusTotalTestResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('test-virustotal-integration');
      
      if (error) throw error;
      
      setVirusTotalTestResult(data);
      
      if (data.success) {
        toast({ title: 'Teste bem-sucedido', description: data.message });
      } else {
        toast({ 
          title: 'Teste falhou', 
          description: data.message, 
          variant: 'destructive' 
        });
      }
    } catch (error) {
      logger.error('Error testing VirusTotal', error);
      setVirusTotalTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido'
      });
      toast({ 
        title: 'Erro ao testar integracao', 
        description: 'Verifique os logs para mais detalhes',
        variant: 'destructive' 
      });
    } finally {
      setTestingVirusTotal(false);
    }
  };

  const testStripeIntegration = async () => {
    setTestingStripe(true);
    setStripeTestResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('test-stripe-integration');
      
      if (error) throw error;
      
      setStripeTestResult(data);
      
      if (data.success) {
        toast({ title: 'Teste bem-sucedido', description: data.message });
      } else {
        toast({ 
          title: 'Teste falhou', 
          description: data.message, 
          variant: 'destructive' 
        });
      }
    } catch (error) {
      logger.error('Error testing Stripe', error);
      setStripeTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido'
      });
      toast({ 
        title: 'Erro ao testar integracao', 
        description: 'Verifique os logs para mais detalhes',
        variant: 'destructive' 
      });
    } finally {
      setTestingStripe(false);
    }
  };

  const testWebhook = async () => {
    setTestingWebhook(true);
    setWebhookTestResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('test-webhook');
      
      if (error) throw error;
      
      setWebhookTestResult(data);
      
      if (data.success) {
        toast({ title: 'Teste bem-sucedido', description: data.message });
      } else {
        toast({ 
          title: 'Teste falhou', 
          description: data.message, 
          variant: 'destructive' 
        });
      }
    } catch (error) {
      logger.error('Error testing webhook', error);
      setWebhookTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido'
      });
      toast({ 
        title: 'Erro ao testar webhook', 
        description: 'Verifique os logs para mais detalhes',
        variant: 'destructive' 
      });
    } finally {
      setTestingWebhook(false);
    }
  };

  const loading = tenantLoading || roleLoading || settingsLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">{t('adminPages.settings.title')}</h2>
        <p className="text-muted-foreground">{t('adminPages.settings.subtitle')}</p>
      </div>

      <Tabs defaultValue="empresa" className="w-full">
        <TabsList>
          <TabsTrigger value="empresa">{t('adminPages.settings.companyTab')}</TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-1">
            <Shield className="h-4 w-4" />
            {t('adminPages.settings.securityTab')}
          </TabsTrigger>
          <TabsTrigger value="alerts">{t('adminPages.settings.alertsTab')}</TabsTrigger>
          <TabsTrigger value="integrations">{t('adminPages.settings.integrationsTab')}</TabsTrigger>
          <TabsTrigger value="features">{t('adminPages.settings.featuresTab')}</TabsTrigger>
        </TabsList>

        {/* Empresa Info Tab */}
        <TabsContent value="empresa" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('adminPages.settings.companyData')}</CardTitle>
              <CardDescription>{t('adminPages.settings.companyDataDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>{t('adminPages.settings.companyName')}</Label>
                <Input 
                  value={tenantName || tenant?.name || ''}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder={tenant?.name}
                  disabled={!canWrite}
                />
              </div>
              <div>
                <Label>{t('adminPages.settings.slug')}</Label>
                <Input 
                  value={tenant?.slug || ''}
                  disabled
                  className="bg-muted"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  {t('adminPages.settings.slugNotEditable')}
                </p>
              </div>
              <div>
                <Label>{t('adminPages.settings.tenantId')}</Label>
                <Input 
                  value={tenant?.id || ''}
                  disabled
                  className="bg-muted font-mono text-sm"
                />
              </div>
              {canWrite && (
                <Button 
                  onClick={() => updateTenant.mutate()}
                  disabled={updateTenant.isPending || !tenantName}
                >
                  {t('adminPages.settings.saveChanges')}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('adminPages.settings.systemInfo')}</CardTitle>
              <CardDescription>{t('adminPages.settings.systemInfoDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">{t('adminPages.settings.createdAt')}</span>
                <span>{tenant?.created_at ? new Date(tenant.created_at).toLocaleDateString('pt-BR') : '-'}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">{t('adminPages.settings.lastUpdate')}</span>
                <span>{tenant?.updated_at ? new Date(tenant.updated_at).toLocaleDateString('pt-BR') : '-'}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('adminPages.settings.alertSettings')}</CardTitle>
              <CardDescription>{t('adminPages.settings.alertSettingsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>{t('adminPages.settings.alertEmail')}</Label>
                <Input 
                  type="email"
                  value={settings.alert_email || ''}
                  onChange={(e) => setSettings({ ...settings, alert_email: e.target.value })}
                  placeholder="admin@exemplo.com"
                  disabled={!canWrite}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  {t('adminPages.settings.alertEmailDesc')}
                </p>
              </div>

              <div>
                <Label>{t('adminPages.settings.webhookUrl')}</Label>
                <Input 
                  type="url"
                  value={settings.alert_webhook_url || ''}
                  onChange={(e) => setSettings({ ...settings, alert_webhook_url: e.target.value })}
                  placeholder="https://exemplo.com/webhook"
                  disabled={!canWrite}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  {t('adminPages.settings.webhookUrlDesc')}
                </p>
              </div>

              <div className="pt-4 border-t">
                <Button 
                  onClick={testWebhook}
                  disabled={testingWebhook || !canWrite || !settings.alert_webhook_url}
                  variant="outline"
                  className="w-full"
                >
                  {testingWebhook ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('adminPages.settings.sendingPing')}
                    </>
                  ) : (
                    t('adminPages.settings.testWebhook')
                  )}
                </Button>
                
                {webhookTestResult && (
                  <Alert className="mt-4" variant={webhookTestResult.success ? "default" : "destructive"}>
                    {webhookTestResult.success ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>{webhookTestResult.success ? t('adminPages.settings.success') : t('adminPages.settings.error')}</AlertTitle>
                    <AlertDescription>
                      {webhookTestResult.message}
                      {webhookTestResult.details && (
                        <div className="mt-2 text-xs">
                          <pre className="bg-muted p-2 rounded overflow-x-auto max-h-48">
                            {JSON.stringify(webhookTestResult.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>{t('adminPages.settings.virusThreshold')}</Label>
                  <Input 
                    type="number"
                    min="1"
                    value={settings.alert_threshold_virus_positive}
                    onChange={(e) => setSettings({ ...settings, alert_threshold_virus_positive: parseInt(e.target.value) })}
                    disabled={!canWrite}
                  />
                </div>
                <div>
                  <Label>{t('adminPages.settings.failedJobsThreshold')}</Label>
                  <Input 
                    type="number"
                    min="1"
                    value={settings.alert_threshold_failed_jobs}
                    onChange={(e) => setSettings({ ...settings, alert_threshold_failed_jobs: parseInt(e.target.value) })}
                    disabled={!canWrite}
                  />
                </div>
                <div>
                  <Label>{t('adminPages.settings.offlineAgentsThreshold')}</Label>
                  <Input 
                    type="number"
                    min="1"
                    value={settings.alert_threshold_offline_agents}
                    onChange={(e) => setSettings({ ...settings, alert_threshold_offline_agents: parseInt(e.target.value) })}
                    disabled={!canWrite}
                  />
                </div>
              </div>

              {canWrite && (
                <Button 
                  onClick={() => updateSettings.mutate(settings)}
                  disabled={updateSettings.isPending}
                >
                  {t('adminPages.settings.saveAlertSettings')}
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>VirusTotal</CardTitle>
              <CardDescription>{t('adminPages.settings.integrationsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('adminPages.settings.enableVirusTotal')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('adminPages.settings.virusTotalDesc')}
                  </p>
                </div>
                <Switch
                  checked={settings.virustotal_enabled}
                  onCheckedChange={(checked) => setSettings({ ...settings, virustotal_enabled: checked })}
                  disabled={!canWrite}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('adminPages.settings.virusTotalKeyNote')}
              </p>
              
              <div className="pt-4 border-t">
                <Button 
                  onClick={testVirusTotalIntegration}
                  disabled={testingVirusTotal || !canWrite}
                  variant="outline"
                  className="w-full"
                >
                  {testingVirusTotal ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('adminPages.settings.testingConnection')}
                    </>
                  ) : (
                    t('adminPages.settings.testVirusTotal')
                  )}
                </Button>
                
                {virusTotalTestResult && (
                  <Alert className="mt-4" variant={virusTotalTestResult.success ? "default" : "destructive"}>
                    {virusTotalTestResult.success ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>{virusTotalTestResult.success ? t('adminPages.settings.success') : t('adminPages.settings.error')}</AlertTitle>
                    <AlertDescription>
                      {virusTotalTestResult.message}
                      {virusTotalTestResult.details && (
                        <div className="mt-2 text-xs">
                          <pre className="bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(virusTotalTestResult.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
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
                  <p className="text-sm text-muted-foreground">
                    {t('adminPages.settings.stripeDesc')}
                  </p>
                </div>
                <Switch
                  checked={settings.stripe_enabled}
                  onCheckedChange={(checked) => setSettings({ ...settings, stripe_enabled: checked })}
                  disabled={!canWrite}
                />
              </div>
              
              <div className="pt-4 border-t">
                <Button 
                  onClick={testStripeIntegration}
                  disabled={testingStripe || !canWrite}
                  variant="outline"
                  className="w-full"
                >
                  {testingStripe ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('adminPages.settings.testingConnection')}
                    </>
                  ) : (
                    t('adminPages.settings.testStripe')
                  )}
                </Button>
                
                {stripeTestResult && (
                  <Alert className="mt-4" variant={stripeTestResult.success ? "default" : "destructive"}>
                    {stripeTestResult.success ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>{stripeTestResult.success ? t('adminPages.settings.success') : t('adminPages.settings.error')}</AlertTitle>
                    <AlertDescription>
                      {stripeTestResult.message}
                      {stripeTestResult.details && (
                        <div className="mt-2 text-xs">
                          <pre className="bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(stripeTestResult.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>

          {canWrite && (
            <Button 
              onClick={() => updateSettings.mutate(settings)}
              disabled={updateSettings.isPending}
            >
              {t('adminPages.settings.saveIntegrations')}
            </Button>
          )}
        </TabsContent>

        {/* Features Tab */}
        <TabsContent value="features" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('adminPages.settings.featureFlags')}</CardTitle>
              <CardDescription>{t('adminPages.settings.featureFlagsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <Label>{t('adminPages.settings.emailAlerts')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('adminPages.settings.emailAlertsDesc')}
                  </p>
                </div>
                <Switch
                  checked={settings.enable_email_alerts}
                  onCheckedChange={(checked) => setSettings({ ...settings, enable_email_alerts: checked })}
                  disabled={!canWrite}
                />
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <Label>{t('adminPages.settings.webhookAlerts')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('adminPages.settings.webhookAlertsDesc')}
                  </p>
                </div>
                <Switch
                  checked={settings.enable_webhook_alerts}
                  onCheckedChange={(checked) => setSettings({ ...settings, enable_webhook_alerts: checked })}
                  disabled={!canWrite}
                />
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <Label>{t('adminPages.settings.autoQuarantine')}</Label>
                    {settings.enable_auto_quarantine && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        {t('common.status')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('adminPages.settings.autoQuarantineDesc')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('adminPages.settings.autoQuarantineNote')}
                  </p>
                </div>
                <Switch
                  checked={settings.enable_auto_quarantine}
                  onCheckedChange={(checked) => setSettings({ ...settings, enable_auto_quarantine: checked })}
                  disabled={!canWrite}
                />
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <Label>{t('adminPages.settings.autoPlaybooks')}</Label>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                      {t('adminPages.settings.autoPlaybooksConfigured')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('adminPages.settings.autoPlaybooksDesc')}
                  </p>
                </div>
                <Shield className="h-5 w-5 text-primary" />
              </div>

              <div className="flex items-center justify-between py-3">
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    {settings.enable_dry_run_mode ? (
                      <EyeOff className="h-5 w-5 text-amber-500" />
                    ) : (
                      <Eye className="h-5 w-5 text-muted-foreground" />
                    )}
                    <Label>{t('adminPages.settings.shadowMode')}</Label>
                    {settings.enable_dry_run_mode && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        {t('common.status')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('adminPages.settings.shadowModeDesc')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('adminPages.settings.shadowModeNote')}
                  </p>
                </div>
                <Switch
                  checked={settings.enable_dry_run_mode}
                  onCheckedChange={(checked) => setSettings({ ...settings, enable_dry_run_mode: checked })}
                  disabled={!canWrite}
                />
              </div>

              {canWrite && (
                <Button 
                  onClick={() => updateSettings.mutate(settings)}
                  disabled={updateSettings.isPending}
                  className="mt-4"
                >
                  {t('adminPages.settings.saveFeatureFlags')}
                </Button>
              )}
            </CardContent>
          </Card>
          
          {/* Automation Settings */}
          <AutomationSettings />
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4">
          <MFASettings />
          
          <PasswordChangeCard />
          
          <Card>
            <CardHeader>
              <CardTitle>{t('adminPages.settings.securityTips')}</CardTitle>
              <CardDescription>{t('adminPages.settings.securityTipsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">{t('adminPages.settings.strongPasswords')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('adminPages.settings.strongPasswordsDesc')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">{t('adminPages.settings.enable2FA')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('adminPages.settings.enable2FADesc')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">{t('adminPages.settings.keepEmailUpdated')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('adminPages.settings.keepEmailUpdatedDesc')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
