import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Shield, Clock, AlertTriangle, Trash2, RotateCcw, 
  Settings2, History, CheckCircle, XCircle, Loader2, Pause
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const statusConfig = {
  active: { label: 'Ativo', color: 'text-green-500', bg: 'bg-green-500/10', icon: CheckCircle },
  warned: { label: 'Avisado', color: 'text-amber-500', bg: 'bg-amber-500/10', icon: AlertTriangle },
  suspended: { label: 'Suspenso', color: 'text-red-500', bg: 'bg-red-500/10', icon: Pause },
  pending_deletion: { label: 'Deleção Pendente', color: 'text-red-700', bg: 'bg-red-700/10', icon: Trash2 },
};

export default function TenantSuspensionManager() {
  const queryClient = useQueryClient();

  // Fetch config
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['suspension-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_suspension_config')
        .select('id, warning_days, suspension_days, deletion_days, is_enabled, cleanup_batch_size, exempt_tenant_ids, updated_at, updated_by')
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch tenants with suspension info
  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants-suspension'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, suspension_status, last_activity_at, suspended_at, suspension_reason, deletion_scheduled_at, created_at')
        .order('last_activity_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch suspension events
  const { data: events } = useQuery({
    queryKey: ['suspension-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_suspension_events')
        .select('id, tenant_id, event_type, reason, performed_by, previous_status, new_status, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  // Update config
  const updateConfigMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      if (!config?.id) throw new Error('Config not found');
      const { error } = await supabase
        .from('tenant_suspension_config')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', config.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Configuração atualizada');
      queryClient.invalidateQueries({ queryKey: ['suspension-config'] });
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  // Reactivate tenant
  const reactivateMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      const { data, error } = await supabase.rpc('reactivate_tenant', { p_tenant_id: tenantId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Tenant reativado com sucesso');
      queryClient.invalidateQueries({ queryKey: ['tenants-suspension'] });
      queryClient.invalidateQueries({ queryKey: ['suspension-events'] });
    },
    onError: (e) => toast.error('Erro ao reativar: ' + e.message),
  });

  // Stats
  const stats = {
    active: tenants?.filter(t => t.suspension_status === 'active').length || 0,
    warned: tenants?.filter(t => t.suspension_status === 'warned').length || 0,
    suspended: tenants?.filter(t => t.suspension_status === 'suspended').length || 0,
    pending_deletion: tenants?.filter(t => t.suspension_status === 'pending_deletion').length || 0,
  };

  const [filter, setFilter] = useState<string>('all');
  const filteredTenants = tenants?.filter(t => filter === 'all' || t.suspension_status === filter) || [];

  if (configLoading || tenantsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <AdminPageLayout
      title="Suspensão Automática de Tenants"
      description="Gerencie o ciclo de vida de tenants inativos"
      icon={Shield}
    >
      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.entries(statusConfig) as [keyof typeof statusConfig, typeof statusConfig[keyof typeof statusConfig]][]).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const count = stats[key];
          return (
            <Card 
              key={key} 
              className={cn(
                "cursor-pointer transition-all hover:scale-[1.02]",
                filter === key && "ring-2 ring-primary"
              )}
              onClick={() => setFilter(f => f === key ? 'all' : key)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={cn("h-4 w-4", cfg.color)} />
                  <span className="text-xs text-muted-foreground">{cfg.label}</span>
                </div>
                <span className={cn("text-2xl font-bold", cfg.color)}>{count}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Config + Tenants */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Config Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Configuração
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="enabled">Sistema Ativo</Label>
              <Switch
                id="enabled"
                checked={config?.is_enabled ?? false}
                onCheckedChange={(v) => updateConfigMutation.mutate({ is_enabled: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>Aviso (dias de inatividade)</Label>
              <Input
                type="number"
                defaultValue={config?.warning_days ?? 45}
                onBlur={(e) => updateConfigMutation.mutate({ warning_days: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Suspensão (dias)</Label>
              <Input
                type="number"
                defaultValue={config?.suspension_days ?? 60}
                onBlur={(e) => updateConfigMutation.mutate({ suspension_days: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Deleção (dias)</Label>
              <Input
                type="number"
                defaultValue={config?.deletion_days ?? 90}
                onBlur={(e) => updateConfigMutation.mutate({ deletion_days: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Batch Size</Label>
              <Input
                type="number"
                defaultValue={config?.cleanup_batch_size ?? 100}
                onBlur={(e) => updateConfigMutation.mutate({ cleanup_batch_size: parseInt(e.target.value) })}
              />
            </div>

            <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
              <p>⏱ Aviso: {config?.warning_days}d → Suspensão: {config?.suspension_days}d → Deleção: {config?.deletion_days}d</p>
              <p>📦 Batch: {config?.cleanup_batch_size} tenants/ciclo</p>
            </div>
          </CardContent>
        </Card>

        {/* Tenants List */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Tenants ({filteredTenants.length})
              </CardTitle>
              {filter !== 'all' && (
                <Button variant="ghost" size="sm" onClick={() => setFilter('all')}>
                  Limpar filtro
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredTenants.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum tenant encontrado</p>
              ) : filteredTenants.map((tenant) => {
                const cfg = statusConfig[tenant.suspension_status as keyof typeof statusConfig] || statusConfig.active;
                const StatusIcon = cfg.icon;
                return (
                  <div key={tenant.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <StatusIcon className={cn("h-4 w-4 shrink-0", cfg.color)} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{tenant.name}</span>
                          <Badge variant="outline" className={cn("text-[10px] shrink-0", cfg.color)}>
                            {cfg.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Última atividade: {tenant.last_activity_at 
                            ? formatDistanceToNow(new Date(tenant.last_activity_at), { addSuffix: true, locale: ptBR })
                            : 'Nunca'}
                        </p>
                      </div>
                    </div>
                    {tenant.suspension_status !== 'active' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="shrink-0">
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Reativar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reativar Tenant</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja reativar o tenant <strong>{tenant.name}</strong>? 
                              Isso restaurará o acesso completo ao sistema.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => reactivateMutation.mutate(tenant.id)}
                              disabled={reactivateMutation.isPending}
                            >
                              {reactivateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                              Confirmar Reativação
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Events Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico de Eventos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {(!events || events.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum evento registrado</p>
            ) : events.map((event) => (
              <div key={event.id} className="flex items-start gap-3 p-2 rounded border-l-2 border-muted">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{event.event_type}</Badge>
                    {event.previous_status && event.new_status && (
                      <span className="text-[10px] text-muted-foreground">
                        {event.previous_status} → {event.new_status}
                      </span>
                    )}
                  </div>
                  {event.reason && (
                    <p className="text-xs text-muted-foreground mt-1">{event.reason}</p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </AdminPageLayout>
  );
}
