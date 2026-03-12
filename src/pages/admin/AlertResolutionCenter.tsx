import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle, Archive, RefreshCw, Cpu, HardDrive, Wifi, Shield, Lightbulb, Zap } from 'lucide-react';
import { format, ptBR } from '@/lib/date-utils';
import { getAlertExplanation, ALERT_TYPE_LABELS } from '@/lib/leigo-translator';
import { ExplainableAlert } from '@/components/ui/explainable-alert';

interface SystemAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  agent_id: string | null;
  created_at: string;
  acknowledged: boolean;
  resolved_at: string | null;
}

const ALERT_ICONS: Record<string, React.ReactNode> = {
  high_cpu: <Cpu className="h-4 w-4" />,
  high_disk: <HardDrive className="h-4 w-4" />,
  agent_offline: <Wifi className="h-4 w-4" />,
  security_threat: <Shield className="h-4 w-4" />,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-500 text-white',
};

export default function AlertResolutionCenter() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<string>('all');

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['system-alerts-resolution', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('system_alerts')
        .select('*')
        .eq('tenant_id', tenant.id)
        .is('resolved_at', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as SystemAlert[];
    },
    enabled: !!tenant?.id,
  });

  const resolveMutation = useMutation({
    mutationFn: async (alertIds: string[]) => {
      // V-1071 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('system_alerts')
        .update({ 
          resolved_at: new Date().toISOString(),
          acknowledged: true 
        })
        .in('id', alertIds)
        .eq('tenant_id', tenant!.id);
      
      if (error) throw error;
    },
    onSuccess: (_, alertIds) => {
      queryClient.invalidateQueries({ queryKey: ['system-alerts-resolution'] });
      queryClient.invalidateQueries({ queryKey: ['system-alerts'] });
      toast.success(`${alertIds.length} alerta(s) resolvido(s) com sucesso`);
      setSelectedAlerts(new Set());
    },
    onError: (error) => {
      toast.error('Erro ao resolver alertas: ' + (error as Error).message);
    },
  });

  const alertsByType = React.useMemo(() => {
    if (!alerts) return {};
    return alerts.reduce((acc, alert) => {
      const type = alert.alert_type || 'other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(alert);
      return acc;
    }, {} as Record<string, SystemAlert[]>);
  }, [alerts]);

  const criticalCount = alerts?.filter(a => a.severity === 'critical').length || 0;
  const highCount = alerts?.filter(a => a.severity === 'high').length || 0;

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedAlerts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedAlerts(newSelected);
  };

  const selectAllOfType = (type: string) => {
    const typeAlerts = alertsByType[type] || [];
    const newSelected = new Set(selectedAlerts);
    typeAlerts.forEach(a => newSelected.add(a.id));
    setSelectedAlerts(newSelected);
  };

  const resolveSelected = () => {
    if (selectedAlerts.size === 0) {
      toast.warning('Selecione pelo menos um alerta');
      return;
    }
    resolveMutation.mutate(Array.from(selectedAlerts));
  };

  const resolveAllOfType = (type: string) => {
    const typeAlerts = alertsByType[type] || [];
    if (typeAlerts.length === 0) return;
    resolveMutation.mutate(typeAlerts.map(a => a.id));
  };

  const filteredAlerts = filterType === 'all' 
    ? alerts 
    : alerts?.filter(a => a.alert_type === filterType);

  const alertTypes = Object.keys(alertsByType);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Centro de Resolução de Alertas</h1>
          <p className="text-muted-foreground">
            Resolva alertas críticos em massa para manter seu ambiente saudável
          </p>
        </div>
        <Button 
          onClick={() => queryClient.invalidateQueries({ queryKey: ['system-alerts-resolution'] })}
          variant="outline"
          size="sm"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-2xl font-bold text-destructive">{criticalCount}</p>
                <p className="text-sm text-muted-foreground">Críticos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold text-orange-500">{highCount}</p>
                <p className="text-sm text-muted-foreground">Alta Prioridade</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{alerts?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Total Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{selectedAlerts.size}</p>
                <p className="text-sm text-muted-foreground">Selecionados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Actions by Type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ações em Lote por Tipo</CardTitle>
          <CardDescription>Resolva todos os alertas de um tipo específico</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {alertTypes.map(type => (
              <Button
                key={type}
                variant="outline"
                size="sm"
                onClick={() => resolveAllOfType(type)}
                disabled={resolveMutation.isPending}
              >
                {ALERT_ICONS[type] || <AlertTriangle className="h-4 w-4" />}
                <span className="ml-2">Resolver todos {type}</span>
                <Badge variant="secondary" className="ml-2">
                  {alertsByType[type]?.length || 0}
                </Badge>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Selected Actions */}
      {selectedAlerts.size > 0 && (
        <Card className="border-primary">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                <span className="font-medium">{selectedAlerts.size} alertas selecionados</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedAlerts(new Set())}>
                  Limpar Seleção
                </Button>
                <Button 
                  size="sm" 
                  onClick={resolveSelected}
                  disabled={resolveMutation.isPending}
                >
                  {resolveMutation.isPending ? 'Resolvendo...' : 'Resolver Selecionados'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={filterType === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterType('all')}
        >
          Todos ({alerts?.length || 0})
        </Button>
        {alertTypes.map(type => (
          <Button
            key={type}
            variant={filterType === type ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType(type)}
          >
            {type} ({alertsByType[type]?.length || 0})
          </Button>
        ))}
      </div>

      {/* Alerts List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Alertas Pendentes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Carregando alertas...</p>
          ) : !filteredAlerts?.length ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-medium">Nenhum alerta pendente!</p>
              <p className="text-muted-foreground">Seu ambiente está saudável.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map(alert => {
                const isCriticalOrHigh = alert.severity === 'critical' || alert.severity === 'high';
                const explanation = getAlertExplanation(alert.alert_type);
                
                // Para alertas críticos/altos, usar ExplainableAlert
                if (isCriticalOrHigh) {
                  return (
                    <div key={alert.id} className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedAlerts.has(alert.id)}
                        onCheckedChange={() => toggleSelect(alert.id)}
                        className="mt-4"
                      />
                      <div className="flex-1">
                        <ExplainableAlert
                          type={alert.alert_type}
                          severity={alert.severity === 'critical' ? 'error' : 'warning'}
                          alertTitle={alert.title}
                          alertMessage={alert.message}
                          showAnalogy
                          showActions
                          actions={[
                            { 
                              label: 'Resolver', 
                              onClick: () => resolveMutation.mutate([alert.id]),
                              variant: 'default'
                            }
                          ]}
                        >
                          <div className="text-xs text-muted-foreground mt-2">
                            Detectado em: {format(new Date(alert.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </div>
                        </ExplainableAlert>
                      </div>
                    </div>
                  );
                }
                
                // Para alertas médios/baixos, manter card simples
                return (
                  <div
                    key={alert.id}
                    className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                      selectedAlerts.has(alert.id) ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/30'
                    }`}
                  >
                    <Checkbox
                      checked={selectedAlerts.has(alert.id)}
                      onCheckedChange={() => toggleSelect(alert.id)}
                    />
                    <div className="flex-shrink-0 text-xl">
                      {explanation.icon || '⚠️'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {explanation.title || alert.title}
                        </span>
                        <Badge className={SEVERITY_COLORS[alert.severity] || 'bg-gray-500'}>
                          {alert.severity === 'medium' ? 'Médio' : 'Baixo'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {explanation.explanation || alert.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(alert.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                        {explanation.urgency && (
                          <span className="text-xs text-primary font-medium">
                            💡 {explanation.urgency}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resolveMutation.mutate([alert.id])}
                      disabled={resolveMutation.isPending}
                      className="flex-shrink-0"
                    >
                      <CheckCircle className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
