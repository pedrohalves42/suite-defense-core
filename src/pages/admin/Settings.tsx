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
          .single();
        
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
      if (!tenant) throw new Error('Tenant não encontrado');
      
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
      if (!tenant) throw new Error('Tenant não encontrado');
      
      // Validate email if provided
      if (newSettings.alert_email && !newSettings.alert_email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        throw new Error('Email inválido');
      }
      
      // Validate webhook URL if provided
      if (newSettings.alert_webhook_url && !newSettings.alert_webhook_url.match(/^https?:\/\/.+/)) {
        throw new Error('URL do webhook inválida');
      }
      
      const { error } = await supabase
        .from('tenant_settings')
        .update(newSettings)
        .eq('tenant_id', tenant.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      toast({ title: 'Configurações atualizadas com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Erro ao atualizar configurações', variant: 'destructive' });
    },
  });

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
        <h2 className="text-3xl font-bold">Configurações</h2>
        <p className="text-muted-foreground">Gerencie as configurações do seu tenant</p>
      </div>

      <Tabs defaultValue="tenant" className="w-full">
        <TabsList>
          <TabsTrigger value="tenant">Tenant</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
        </TabsList>

        {/* Tenant Info Tab */}
        <TabsContent value="tenant" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Informações do Tenant</CardTitle>
              <CardDescription>Configure as informações básicas do tenant</CardDescription>
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
                  O slug não pode ser alterado
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
                  Salvar Alterações
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informações do Sistema</CardTitle>
              <CardDescription>Detalhes técnicos do tenant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Criado em</span>
                <span>{tenant?.created_at ? new Date(tenant.created_at).toLocaleDateString('pt-BR') : '-'}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Última atualização</span>
                <span>{tenant?.updated_at ? new Date(tenant.updated_at).toLocaleDateString('pt-BR') : '-'}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configurações de Alertas</CardTitle>
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
                  Email que receberá notificações de segurança
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
                  URL para receber notificações via webhook
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Limiar de Vírus Detectados</Label>
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
                  Salvar Configurações de Alertas
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
              <CardDescription>Integração com VirusTotal para análise de malware</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Ativar VirusTotal</Label>
                  <p className="text-sm text-muted-foreground">
                    Usar VirusTotal API para análise de arquivos
                  </p>
                </div>
                <Switch
                  checked={settings.virustotal_enabled}
                  onCheckedChange={(checked) => setSettings({ ...settings, virustotal_enabled: checked })}
                  disabled={!canWrite}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A chave da API do VirusTotal é configurada globalmente nos secrets do projeto
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stripe</CardTitle>
              <CardDescription>Integração com Stripe para pagamentos (futuro)</CardDescription>
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
            </CardContent>
          </Card>

          {canWrite && (
            <Button 
              onClick={() => updateSettings.mutate(settings)}
              disabled={updateSettings.isPending}
            >
              Salvar Configurações de Integrações
            </Button>
          )}
        </TabsContent>

        {/* Features Tab */}
        <TabsContent value="features" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
              <CardDescription>Ative ou desative funcionalidades específicas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <Label>Alertas por Email</Label>
                  <p className="text-sm text-muted-foreground">
                    Enviar notificações por email
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
                    Enviar notificações via webhook
                  </p>
                </div>
                <Switch
                  checked={settings.enable_webhook_alerts}
                  onCheckedChange={(checked) => setSettings({ ...settings, enable_webhook_alerts: checked })}
                  disabled={!canWrite}
                />
              </div>

              <div className="flex items-center justify-between py-3">
                <div>
                  <Label>Quarentena Automática</Label>
                  <p className="text-sm text-muted-foreground">
                    Isolar automaticamente arquivos maliciosos detectados
                  </p>
                </div>
                <Switch
                  checked={settings.enable_auto_quarantine}
                  onCheckedChange={(checked) => setSettings({ ...settings, enable_auto_quarantine: checked })}
                  disabled={!canWrite}
                />
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
      </Tabs>
    </div>
  );
}
