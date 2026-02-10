/**
 * Alert Resolution Panel Component
 * Displays open alerts with resolution actions for SOC 2 compliance
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, CheckCircle2, Clock, Shield, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format, ptBR } from '@/lib/date-utils';

interface SecurityEvent {
  id: string;
  severity: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export function AlertResolutionPanel() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['security-alerts-open', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_events')
        .select('id, severity, title, description, status, created_at, acknowledged_at, resolved_at')
        .eq('tenant_id', tenant!.id)
        .eq('status', 'open')
        .order('severity', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as SecurityEvent[];
    },
    enabled: !!tenant?.id,
  });

  const { data: stats } = useQuery({
    queryKey: ['security-alerts-stats', tenant?.id],
    queryFn: async () => {
      const { count: openCount } = await supabase
        .from('security_events')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant!.id)
        .eq('status', 'open');

      const { count: criticalCount } = await supabase
        .from('security_events')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant!.id)
        .eq('status', 'open')
        .eq('severity', 'critical');

      const { count: resolvedToday } = await supabase
        .from('security_events')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant!.id)
        .eq('status', 'resolved')
        .gte('resolved_at', new Date().toISOString().split('T')[0]);

      return {
        open: openCount || 0,
        critical: criticalCount || 0,
        resolvedToday: resolvedToday || 0,
      };
    },
    enabled: !!tenant?.id,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'acknowledge' | 'resolve' | 'dismiss' }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const updates: Record<string, unknown> = {};
      
      if (action === 'acknowledge') {
        updates.acknowledged_at = new Date().toISOString();
        updates.acknowledged_by = user.id;
      } else if (action === 'resolve') {
        updates.status = 'resolved';
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = user.id;
      } else if (action === 'dismiss') {
        updates.status = 'dismissed';
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = user.id;
        updates.resolution_notes = 'Dismissed as false positive';
      }

      const { error } = await supabase
        .from('security_events')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['security-alerts-open'] });
      queryClient.invalidateQueries({ queryKey: ['security-alerts-stats'] });
      const messages = {
        acknowledge: 'Alerta reconhecido',
        resolve: 'Alerta resolvido',
        dismiss: 'Alerta descartado',
      };
      toast.success(messages[action]);
    },
    onError: () => {
      toast.error('Erro ao processar alerta');
    },
    onSettled: () => {
      setProcessingId(null);
    },
  });

  const bulkResolveMutation = useMutation({
    mutationFn: async (severity: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('security_events')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_notes: `Bulk resolved - ${severity} severity`,
        })
        .eq('tenant_id', tenant!.id)
        .eq('status', 'open')
        .eq('severity', severity);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-alerts-open'] });
      queryClient.invalidateQueries({ queryKey: ['security-alerts-stats'] });
      toast.success('Alertas resolvidos em massa');
    },
    onError: () => {
      toast.error('Erro ao resolver alertas');
    },
  });

  const handleAction = (id: string, action: 'acknowledge' | 'resolve' | 'dismiss') => {
    setProcessingId(id);
    resolveMutation.mutate({ id, action });
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Crítico</Badge>;
      case 'high':
        return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20">Alto</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Médio</Badge>;
      case 'low':
        return <Badge variant="secondary">Baixo</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isHealthy = (stats?.open || 0) < 50;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Resolução de Alertas (CC4/CC7)
            </CardTitle>
            <CardDescription>
              Gestão de eventos de segurança abertos
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant={isHealthy ? 'default' : 'destructive'} className="text-lg px-3 py-1">
              {stats?.open || 0} Abertos
            </Badge>
            {(stats?.critical || 0) > 0 && (
              <Badge variant="destructive" className="text-lg px-3 py-1">
                {stats?.critical} Críticos
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <div className="text-2xl font-bold">{stats?.open || 0}</div>
            <div className="text-xs text-muted-foreground">Alertas Abertos</div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <div className="text-2xl font-bold text-destructive">{stats?.critical || 0}</div>
            <div className="text-xs text-muted-foreground">Críticos</div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-500">{stats?.resolvedToday || 0}</div>
            <div className="text-xs text-muted-foreground">Resolvidos Hoje</div>
          </div>
        </div>

        {/* Status Banner */}
        {isHealthy ? (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-green-500 font-medium">Volume de alertas abertos está dentro do esperado</span>
          </div>
        ) : (
          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <span className="text-yellow-500 font-medium">Volume alto de alertas abertos - considere resolver em massa</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => bulkResolveMutation.mutate('low')}>
                Resolver Baixos
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkResolveMutation.mutate('medium')}>
                Resolver Médios
              </Button>
            </div>
          </div>
        )}

        {/* Alerts Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severidade</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts?.map((alert) => (
              <TableRow key={alert.id}>
                <TableCell>{getSeverityBadge(alert.severity)}</TableCell>
                <TableCell className="font-medium max-w-[300px] truncate">{alert.title}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(alert.created_at), "dd/MM HH:mm", { locale: ptBR })}
                </TableCell>
                <TableCell>
                  {alert.acknowledged_at ? (
                    <Badge variant="outline"><Clock className="h-3 w-3 mr-1" /> Reconhecido</Badge>
                  ) : (
                    <Badge variant="secondary">Novo</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {!alert.acknowledged_at && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleAction(alert.id, 'acknowledge')}
                        disabled={processingId === alert.id}
                      >
                        {processingId === alert.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'ACK'}
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      onClick={() => handleAction(alert.id, 'resolve')}
                      disabled={processingId === alert.id}
                    >
                      {processingId === alert.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Resolver'}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => handleAction(alert.id, 'dismiss')}
                      disabled={processingId === alert.id}
                    >
                      Descartar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {alerts?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  Nenhum alerta aberto
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
