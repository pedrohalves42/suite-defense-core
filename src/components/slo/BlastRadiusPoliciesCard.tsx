import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { useBlastRadiusPolicies, useUpdateBlastRadiusPolicy } from '@/hooks/useBlastRadius';
import { Shield, AlertTriangle, Settings } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const ACTION_TYPE_LABELS: Record<string, string> = {
  'force_update': 'Atualização Forçada',
  'isolate': 'Isolamento',
  'restart': 'Reinício',
  'uninstall': 'Desinstalação',
  'policy_change': 'Mudança de Política'
};

export function BlastRadiusPoliciesCard() {
  const { data: policies, isLoading } = useBlastRadiusPolicies();
  const updatePolicy = useUpdateBlastRadiusPolicy();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const defaultPolicies = [
    { action_type: 'force_update', max_affected_percent: 10, require_approval_above: 5, cooldown_minutes: 30 },
    { action_type: 'isolate', max_affected_percent: 5, require_approval_above: 1, cooldown_minutes: 60 },
    { action_type: 'restart', max_affected_percent: 20, require_approval_above: 10, cooldown_minutes: 15 },
    { action_type: 'uninstall', max_affected_percent: 5, require_approval_above: 1, cooldown_minutes: 120 },
    { action_type: 'policy_change', max_affected_percent: 25, require_approval_above: 10, cooldown_minutes: 30 }
  ];

  const displayPolicies = policies?.length ? policies : defaultPolicies.map(p => ({
    ...p,
    id: p.action_type,
    tenant_id: '',
    max_affected_count: null,
    is_active: true,
    created_at: '',
    updated_at: ''
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Políticas de Blast Radius
        </CardTitle>
        <CardDescription>
          Limites de impacto para ações em massa
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {displayPolicies.map((policy) => (
          <div 
            key={policy.action_type}
            className="p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {ACTION_TYPE_LABELS[policy.action_type] || policy.action_type}
                </span>
                <Badge variant={policy.is_active ? 'default' : 'secondary'}>
                  {policy.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <Switch
                checked={policy.is_active}
                onCheckedChange={(checked) => {
                  updatePolicy.mutate({
                    action_type: policy.action_type,
                    is_active: checked,
                    max_affected_percent: policy.max_affected_percent,
                    require_approval_above: policy.require_approval_above,
                    cooldown_minutes: policy.cooldown_minutes
                  });
                }}
              />
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block mb-1">Máx. Afetados</span>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="font-mono">{policy.max_affected_percent}%</span>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">Aprovação Acima</span>
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono">{policy.require_approval_above}%</span>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">Cooldown</span>
                <span className="font-mono">{policy.cooldown_minutes} min</span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
