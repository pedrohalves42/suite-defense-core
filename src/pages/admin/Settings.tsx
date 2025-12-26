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
import { AlertCircle, CheckCircle, Loader2, Shield } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { logger } from '@/lib/logger';
import { MFASettings } from '@/components/mfa/MFASettings';
import { PasswordChangeCard } from '@/components/settings/PasswordChangeCard';

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
}

export default function Settings() {
  const { toast } = useToast();
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
        .select('*')
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
        <h2 className="text-3xl font-bold">Configuracoes</h2>
        <p className="text-muted-foreground">Gerencie as configuracoes do seu tenant</p>
      </div>

      <Tabs defaultValue="tenant" className="w-full">
        <TabsList>
          <TabsTrigger value="tenant">Tenant</TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-1">
            <Shield className="h-4 w-4" />
            Segurança
          </TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
          <TabsTrigger value="integrations">Integracoes</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
        </TabsList>

        {/* Tenant Info Tab */}
        <TabsContent value="tenant" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Informacoes do Tenant</CardTitle>
              <CardDescription>Configure as informacoes basicas do tenant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nome do Tenant</Label>
                <Input 
                  value={tenantName || tenant?.name || ''}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder={tenant?.name}
                  disabled={!canWrite}
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input 
                  value={tenant?.slug || ''}
                  disabled
                  className="bg-muted"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  O slug nao pode ser alterado
                </p>
              </div>
              <div>
                <Label>ID do Tenant</Label>
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
                  Salvar Alteracoes
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informacoes do Sistema</CardTitle>
              <CardDescription>Detalhes tecnicos do tenant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Criado em</span>
                <span>{tenant?.created_at ? new Date(tenant.created_at).toLocaleDateString('pt-BR') : '-'}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Ultima atualizacao</span>
                <span>{tenant?.updated_at ? new Date(tenant.updated_at).toLocaleDateString('pt-BR') : '-'}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuracoes de Alertas</CardTitle>
              <CardDescription>Configure emails, webhooks e limiares de alerta</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Email para Alertas</Label>
                <Input 
                  type="email"
                  value={settings.alert_email || ''}
                  onChange={(e) => setSettings({ ...settings, alert_email: e.target.value })}
                  placeholder="admin@exemplo.com"
                  disabled={!canWrite}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Email que recebera notificacoes de seguranca
                </p>
              </div>

              <div>
                <Label>Webhook URL</Label>
                <Input 
                  type="url"
                  value={settings.alert_webhook_url || ''}
                  onChange={(e) => setSettings({ ...settings, alert_webhook_url: e.target.value })}
                  placeholder="https://exemplo.com/webhook"
                  disabled={!canWrite}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  URL para receber notificacoes via webhook (POST requests com JSON payload)
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
                      Enviando ping...
                    </>
                  ) : (
                    'Testar Webhook (Ping/Pong)'
                  )}
                </Button>
                
                {webhookTestResult && (
                  <Alert className="mt-4" variant={webhookTestResult.success ? "default" : "destructive"}>
                    {webhookTestResult.success ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>{webhookTestResult.success ? 'Sucesso' : 'Erro'}</AlertTitle>
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
                  <Label>Limiar de Virus Detectados</Label>
                  <Input 
                    type="number"
                    min="1"
                    value={settings.alert_threshold_virus_positive}
                    onChange={(e) => setSettings({ ...settings, alert_threshold_virus_positive: parseInt(e.target.value) })}
                    disabled={!canWrite}
                  />
                </div>
                <div>
                  <Label>Limiar de Jobs Falhados</Label>
                  <Input 
                    type="number"
                    min="1"
                    value={settings.alert_threshold_failed_jobs}
                    onChange={(e) => setSettings({ ...settings, alert_threshold_failed_jobs: parseInt(e.target.value) })}
                    disabled={!canWrite}
                  />
                </div>
                <div>
                  <Label>Limiar de Agentes Offline</Label>
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
                  Salvar Configuracoes de Alertas
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
              <CardDescription>Integracao com VirusTotal para analise de malware</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Ativar VirusTotal</Label>
                  <p className="text-sm text-muted-foreground">
                    Usar VirusTotal API para analise de arquivos
                  </p>
                </div>
                <Switch
                  checked={settings.virustotal_enabled}
                  onCheckedChange={(checked) => setSettings({ ...settings, virustotal_enabled: checked })}
                  disabled={!canWrite}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A chave da API do VirusTotal e configurada globalmente nos secrets do projeto
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
                      Testando conexao...
                    </>
                  ) : (
                    'Testar Conexao VirusTotal'
                  )}
                </Button>
                
                {virusTotalTestResult && (
                  <Alert className="mt-4" variant={virusTotalTestResult.success ? "default" : "destructive"}>
                    {virusTotalTestResult.success ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>{virusTotalTestResult.success ? 'Sucesso' : 'Erro'}</AlertTitle>
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
              <CardDescription>Integracao com Stripe para pagamentos (futuro)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Ativar Stripe</Label>
                  <p className="text-sm text-muted-foreground">
                    Habilitar funcionalidades de pagamento
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
                      Testando conexao...
                    </>
                  ) : (
                    'Testar Conexao Stripe'
                  )}
                </Button>
                
                {stripeTestResult && (
                  <Alert className="mt-4" variant={stripeTestResult.success ? "default" : "destructive"}>
                    {stripeTestResult.success ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>{stripeTestResult.success ? 'Sucesso' : 'Erro'}</AlertTitle>
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
              Salvar Configuracoes de Integracoes
            </Button>
          )}
        </TabsContent>

        {/* Features Tab */}
        <TabsContent value="features" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
              <CardDescription>Ative ou desative funcionalidades especificas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <Label>Alertas por Email</Label>
                  <p className="text-sm text-muted-foreground">
                    Enviar notificacoes por email
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
                  <Label>Alertas por Webhook</Label>
                  <p className="text-sm text-muted-foreground">
                    Enviar notificacoes via webhook
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
                    <Label>Quarentena Automatica</Label>
                    {settings.enable_auto_quarantine && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Ativo
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Quando ativado, arquivos detectados como maliciosos pelo VirusTotal/Hybrid Analysis
                    serao automaticamente movidos para quarentena sem intervencao manual.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Requer integracao com VirusTotal ou Hybrid Analysis configurada.
                  </p>
                </div>
                <Switch
                  checked={settings.enable_auto_quarantine}
                  onCheckedChange={(checked) => setSettings({ ...settings, enable_auto_quarantine: checked })}
                  disabled={!canWrite}
                />
              </div>

              <div className="flex items-center justify-between py-3">
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <Label>Playbooks Automaticos</Label>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                      Configurado
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Playbooks de notificacao (Computador Offline, DNS Bloqueado) executam automaticamente
                    sem necessidade de aprovacao manual.
                  </p>
                </div>
                <Shield className="h-5 w-5 text-primary" />
              </div>

              {canWrite && (
                <Button 
                  onClick={() => updateSettings.mutate(settings)}
                  disabled={updateSettings.isPending}
                  className="mt-4"
                >
                  Salvar Feature Flags
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4">
          <MFASettings />
          
          <PasswordChangeCard />
          
          <Card>
            <CardHeader>
              <CardTitle>Dicas de Segurança</CardTitle>
              <CardDescription>Recomendações para manter sua conta segura</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Use senhas fortes</p>
                  <p className="text-sm text-muted-foreground">
                    Combine letras maiúsculas, minúsculas, números e símbolos.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Ative a autenticação de dois fatores</p>
                  <p className="text-sm text-muted-foreground">
                    Adicione uma camada extra de segurança à sua conta.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Mantenha seu email atualizado</p>
                  <p className="text-sm text-muted-foreground">
                    Garanta que você tenha acesso ao email vinculado à conta.
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
