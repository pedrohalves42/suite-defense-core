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
import { Settings, Save, Bell, Shield, Database } from "lucide-react";

export default function TenantSettings() {
  const { toast } = useToast();
  const { tenant, loading: tenantLoading } = useTenant();
  const queryClient = useQueryClient();
  
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");

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
    enabled: !!tenant?.id,
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
        description: "As informações do tenant foram salvas com sucesso",
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
        title: "Configurações salvas",
        description: "As configurações foram atualizadas com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["tenant-settings"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar configurações",
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
        <h1 className="text-3xl font-bold">Configurações do Tenant</h1>
        <p className="text-muted-foreground">
          Gerencie as configurações e preferências do seu tenant
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <CardTitle>Informações Básicas</CardTitle>
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
            Salvar Alterações
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Notificações</CardTitle>
          </div>
          <CardDescription>
            Configure as preferências de notificações
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Notificações de Email</Label>
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
              <Label>Alertas de Segurança</Label>
              <p className="text-sm text-muted-foreground">
                Notificações sobre atividades suspeitas
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
            <CardTitle>Segurança e Auditoria</CardTitle>
          </div>
          <CardDescription>
            Configure opções de segurança e registro
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Logs de Auditoria</Label>
              <p className="text-sm text-muted-foreground">
                Registrar todas as ações realizadas no sistema
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
              <Label>Máximo de Agentes</Label>
              <Input
                type="number"
                value={5}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Máximo de Usuários</Label>
              <Input
                type="number"
                value={10}
                disabled
                className="bg-muted"
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Para aumentar esses limites, faça upgrade do seu plano.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
