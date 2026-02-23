import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/hooks/useTenant";
import { Settings, Save, Bell, Shield, Database, Globe } from "lucide-react";
import { HelpTooltip } from "@/components/ui/tech-tooltip";

export default function TenantSettings() {
  const { toast } = useToast();
  const { tenant, loading: tenantLoading } = useTenant();
  const queryClient = useQueryClient();
  
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");

  // Fetch tenant subscription with plan details
  const { data: subscription } = useQuery({
    queryKey: ["tenant-subscription", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      
      const { data, error } = await supabase
        .from("tenant_subscriptions")
        .select(`
          *,
          plan:subscription_plans(*)
        `)
        .eq("tenant_id", tenant.id)
        .maybeSingle();
        
      if (error) throw error;
      return data;
    },
    // V-FIX: Guard with !tenantLoading to prevent queries before JWT sync completes
    enabled: !tenantLoading && !!tenant?.id,
  });

  // Fetch current agent count
  const { data: agentCount } = useQuery({
    queryKey: ["agent-count", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return 0;
      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      if (error) throw error;
      return ((data as unknown[]) || []).length;
    },
    // V-FIX: Guard with !tenantLoading to prevent queries before JWT sync completes
    enabled: !tenantLoading && !!tenant?.id,
  });

  // Fetch current user count
  const { data: userCount } = useQuery({
    queryKey: ["user-count", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return 0;
      const { count, error } = await supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenant.id);
      if (error) throw error;
      return count ?? 0;
    },
    // V-FIX: Guard with !tenantLoading to prevent queries before JWT sync completes
    enabled: !tenantLoading && !!tenant?.id,
  });

  // Fetch tenant settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["tenant-settings", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("*")
        .eq("tenant_id", tenant.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      
      // If no settings exist, create default
      if (!data) {
        const { data: newSettings, error: createError } = await supabase
          .from("tenant_settings")
          .insert({
            tenant_id: tenant.id,
            enable_notifications: true,
            enable_audit_logs: true,
            enable_data_export: false,
            max_agents: 5,
            max_users: 3,
          })
          .select()
          .single();
          
        if (createError) throw createError;
        return newSettings;
      }
      
      return data;
    },
    // V-FIX: Guard with !tenantLoading to prevent queries before JWT sync completes
    enabled: !tenantLoading && !!tenant?.id,
  });

  // Update tenant mutation
  const updateTenant = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("Tenant ID not found");
      
      const { error } = await supabase
        .from("tenants")
        .update({
          name: tenantName || tenant.name,
          slug: tenantSlug || tenant.slug,
        })
        .eq("id", tenant.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Tenant atualizado",
        description: "As informacoes do tenant foram salvas com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["tenant"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar tenant",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update settings mutation
  const updateSettings = useMutation({
    mutationFn: async (newSettings: any) => {
      if (!tenant?.id) throw new Error("Tenant ID not found");
      
      const { error } = await supabase
        .from("tenant_settings")
        .upsert({
          tenant_id: tenant.id,
          ...newSettings,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Configuracoes salvas",
        description: "As configuracoes foram atualizadas com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["tenant-settings"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar configuracoes",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (tenantLoading || settingsLoading) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Configuracoes do Tenant</h1>
        <p className="text-muted-foreground">
          Gerencie as configuracoes e preferencias do seu tenant
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <CardTitle>Informacoes Basicas</CardTitle>
          </div>
          <CardDescription>
            Configure o nome e identificador do seu tenant
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenant-name">Nome do Tenant</Label>
            <Input
              id="tenant-name"
              placeholder={tenant?.name}
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-slug">Slug (Identificador)</Label>
            <Input
              id="tenant-slug"
              placeholder={tenant?.slug}
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              URL: {window.location.origin}/{tenantSlug || tenant?.slug}
            </p>
          </div>
          <Button
            onClick={() => updateTenant.mutate()}
            disabled={updateTenant.isPending}
          >
            <Save className="mr-2 h-4 w-4" />
            Salvar Alteracoes
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Notificacoes</CardTitle>
          </div>
          <CardDescription>
            Configure as preferencias de notificacoes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Notificacoes de Email</Label>
              <p className="text-sm text-muted-foreground">
                Receber alertas por email sobre eventos importantes
              </p>
            </div>
            <Switch
              checked={settings?.alert_email !== null}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ ...settings, alert_email: checked ? tenant?.owner_user_id : null })
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Alertas de Seguranca</Label>
              <p className="text-sm text-muted-foreground">
                Notificacoes sobre atividades suspeitas
              </p>
            </div>
            <Switch
              checked={settings?.alert_webhook_url !== null}
              disabled
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <CardTitle>Seguranca e Auditoria</CardTitle>
          </div>
          <CardDescription>
            Configure opcoes de seguranca e registro
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Logs de Auditoria</Label>
              <p className="text-sm text-muted-foreground">
                Registrar todas as acoes realizadas no sistema
              </p>
            </div>
            <Switch
              checked={true}
              disabled
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            <CardTitle>Filtro DNS Local</CardTitle>
          </div>
          <CardDescription>
            Bloqueio de sites a nivel de DNS nos endpoints
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label>Ativar Filtro DNS</Label>
                <HelpTooltip term="Filtro DNS" />
              </div>
              <p className="text-sm text-muted-foreground">
                Instala um resolver DNS local nos computadores para bloquear sites 
                antes mesmo de chegarem ao navegador. Funciona offline e cobre 
                todos os aplicativos, nao apenas o browser.
              </p>
            </div>
            <Switch
              checked={settings?.dns_local_filter_enabled ?? false}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ ...settings, dns_local_filter_enabled: checked })
              }
            />
          </div>
          <Separator />
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-sm">
              <span className="font-medium">Como funciona:</span> Ao ativar, um resolver DNS 
              sera instalado automaticamente nos computadores. Sites bloqueados 
              receberao resposta NXDOMAIN (dominio inexistente), impedindo qualquer acesso.
            </p>
          </div>
          {settings?.dns_local_filter_enabled && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm text-primary font-medium">
                ✓ Filtro DNS ativo - Os computadores usarao o resolver local para bloqueio
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>Limites e Quotas</CardTitle>
          </div>
          <CardDescription>
            Visualize os limites do seu plano atual
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Maximo de Agentes</Label>
              <Input
                type="number"
                value={subscription?.plan?.max_agents ?? "Ilimitado"}
                disabled
                className="bg-muted"
              />
              <p className="text-sm text-muted-foreground">
                Usando {agentCount ?? 0} de {subscription?.plan?.max_agents ?? "∞"} agentes
              </p>
            </div>
            <div className="space-y-2">
              <Label>Maximo de Usuarios</Label>
              <Input
                type="number"
                value={subscription?.plan?.max_users ?? "Ilimitado"}
                disabled
                className="bg-muted"
              />
              <p className="text-sm text-muted-foreground">
                Usando {userCount ?? 0} de {subscription?.plan?.max_users ?? "∞"} usuarios
              </p>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-sm font-medium">
              Plano atual: <span className="text-primary">{subscription?.plan?.name?.toUpperCase() ?? "Carregando..."}</span>
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Para aumentar esses limites, faca upgrade do seu plano.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
