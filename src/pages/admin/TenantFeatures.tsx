import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/hooks/useTenant';
import { Badge } from '@/components/ui/badge';
import { Shield, Zap, FileText, Database, Bell, Lock, BarChart, Save } from 'lucide-react';

interface TenantFeature {
  id: string;
  tenant_id: string;
  feature_key: string;
  enabled: boolean;
  quota_limit: number | null;
  quota_used: number;
  metadata: any;
}

const featureDefinitions = [
  {
    key: 'virus_scans',
    name: 'Scans de Vírus',
    description: 'Análise de arquivos com detecção de malware',
    icon: Shield,
    hasQuota: true,
  },
  {
    key: 'agents',
    name: 'Agentes',
    description: 'Número máximo de agentes que podem ser registrados',
    icon: Database,
    hasQuota: true,
  },
  {
    key: 'jobs',
    name: 'Jobs',
    description: 'Tarefas agendadas e sob demanda',
    icon: Zap,
    hasQuota: true,
  },
  {
    key: 'quarantine',
    name: 'Quarentena',
    description: 'Isolamento de arquivos maliciosos',
    icon: Lock,
    hasQuota: true,
  },
  {
    key: 'audit_logs',
    name: 'Logs de Auditoria',
    description: 'Registro de atividades do sistema',
    icon: FileText,
    hasQuota: false,
  },
  {
    key: 'api_access',
    name: 'Acesso à API',
    description: 'Permissão para usar a API REST',
    icon: Database,
    hasQuota: false,
  },
  {
    key: 'advanced_reporting',
    name: 'Relatórios Avançados',
    description: 'Dashboards e relatórios detalhados',
    icon: BarChart,
    hasQuota: false,
  },
  {
    key: 'webhook_alerts',
    name: 'Alertas via Webhook',
    description: 'Notificações via webhook HTTP',
    icon: Bell,
    hasQuota: false,
  },
  {
    key: 'email_alerts',
    name: 'Alertas via Email',
    description: 'Notificações por email',
    icon: Bell,
    hasQuota: false,
  },
  {
    key: 'auto_quarantine',
    name: 'Quarentena Automática',
    description: 'Isolamento automático de ameaças',
    icon: Shield,
    hasQuota: false,
  },
];

export default function TenantFeatures() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const [editedFeatures, setEditedFeatures] = useState<Record<string, Partial<TenantFeature>>>({});

  const { data: features, isLoading } = useQuery({
    queryKey: ['tenant-features', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('tenant_features')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('feature_key');

      if (error) throw error;
      return data as TenantFeature[];
    },
    enabled: !!tenant?.id,
  });

  const updateFeature = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TenantFeature> }) => {
      const { error } = await supabase
        .from('tenant_features')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-features'] });
      toast({ title: 'Feature atualizada com sucesso!' });
      setEditedFeatures({});
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Erro ao atualizar feature', variant: 'destructive' });
    },
  });

  const getFeatureIcon = (featureKey: string) => {
    const definition = featureDefinitions.find(f => f.key === featureKey);
    return definition?.icon || Shield;
  };

  const getFeatureName = (featureKey: string) => {
    const definition = featureDefinitions.find(f => f.key === featureKey);
    return definition?.name || featureKey;
  };

  const getFeatureDescription = (featureKey: string) => {
    const definition = featureDefinitions.find(f => f.key === featureKey);
    return definition?.description || '';
  };

  const hasQuota = (featureKey: string) => {
    const definition = featureDefinitions.find(f => f.key === featureKey);
    return definition?.hasQuota || false;
  };

  const handleQuotaChange = (featureId: string, newQuota: number | null) => {
    setEditedFeatures({
      ...editedFeatures,
      [featureId]: {
        ...editedFeatures[featureId],
        quota_limit: newQuota,
      },
    });
  };

  const handleToggle = async (feature: TenantFeature, enabled: boolean) => {
    await updateFeature.mutateAsync({
      id: feature.id,
      updates: { enabled },
    });
  };

  const handleSave = async (feature: TenantFeature) => {
    const updates = editedFeatures[feature.id];
    if (!updates) return;

    await updateFeature.mutateAsync({
      id: feature.id,
      updates,
    });
  };

  const getQuotaPercentage = (feature: TenantFeature) => {
    if (!feature.quota_limit) return null;
    return Math.round((feature.quota_used / feature.quota_limit) * 100);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Permissões e Features</h2>
        <p className="text-muted-foreground">
          Gerencie recursos e limites do tenant {tenant?.name}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Features Disponíveis</CardTitle>
          <CardDescription>
            Ative ou desative recursos e configure limites de uso
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Quota</TableHead>
                <TableHead>Uso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {features?.map((feature) => {
                const Icon = getFeatureIcon(feature.feature_key);
                const quotaPercentage = getQuotaPercentage(feature);
                const isEdited = !!editedFeatures[feature.id];

                return (
                  <TableRow key={feature.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{getFeatureName(feature.feature_key)}</p>
                          <p className="text-xs text-muted-foreground">
                            {getFeatureDescription(feature.feature_key)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={feature.enabled}
                        onCheckedChange={(checked) => handleToggle(feature, checked)}
                      />
                    </TableCell>
                    <TableCell>
                      {hasQuota(feature.feature_key) ? (
                        <Input
                          type="number"
                          min="0"
                          className="w-24"
                          value={
                            editedFeatures[feature.id]?.quota_limit ?? 
                            feature.quota_limit ?? 
                            ''
                          }
                          onChange={(e) => {
                            const value = e.target.value === '' ? null : parseInt(e.target.value);
                            handleQuotaChange(feature.id, value);
                          }}
                          placeholder="Ilimitado"
                        />
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {feature.quota_limit ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              {feature.quota_used} / {feature.quota_limit}
                            </span>
                            {quotaPercentage !== null && quotaPercentage >= 90 && (
                              <Badge variant="destructive">Limite próximo</Badge>
                            )}
                          </div>
                          {quotaPercentage !== null && (
                            <div className="w-full bg-secondary rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  quotaPercentage >= 90
                                    ? 'bg-destructive'
                                    : quotaPercentage >= 70
                                    ? 'bg-yellow-500'
                                    : 'bg-primary'
                                }`}
                                style={{ width: `${Math.min(quotaPercentage, 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEdited && (
                        <Button
                          size="sm"
                          onClick={() => handleSave(feature)}
                          disabled={updateFeature.isPending}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          Salvar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sobre Permissões</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            • <strong>Features desativadas</strong> não podem ser usadas pelos usuários do tenant.
          </p>
          <p>
            • <strong>Quotas</strong> definem o limite de uso para cada recurso. Deixe em branco para ilimitado.
          </p>
          <p>
            • O <strong>uso atual</strong> é rastreado automaticamente e exibido em tempo real.
          </p>
          <p>
            • Quando uma quota atinge 90%, um alerta é exibido.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
