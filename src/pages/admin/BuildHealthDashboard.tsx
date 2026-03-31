import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Activity, AlertCircle, CheckCircle, Clock, Trash2 } from "lucide-react";
import { formatBrazilDateTime } from "@/lib/date-utils";
import { toast } from "sonner";
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { getStatusMapping } from '@/lib/status-utils';

export default function BuildHealthDashboard() {
  const queryClient = useQueryClient();
  
  const { data: builds, isLoading } = useRealtimeQuery({
    queryKey: ["recent-builds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_builds')
        .select('id, agent_id, tenant_id, build_status, build_started_at, build_completed_at, build_duration_seconds, error_message, exe_version, ps1_version, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    realtimeTable: 'agent_builds',
    staleTime: 300_000,
  });

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('cleanup-router', {
        body: { action: 'stuck-builds' }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`[OK]  Limpeza concluida: ${data.cleaned_count} build(s) marcados como falhos`);
      queryClient.invalidateQueries({ queryKey: ["recent-builds"] });
    },
    onError: (error: Error) => {
      toast.error(`[ERROR]  Erro na limpeza: ${error.message}`);
    }
  });

  const getStatusBadge = (status: string) => {
    const { label, badgeVariant } = getStatusMapping(status);
    return <StatusBadge variant={badgeVariant}>{label}</StatusBadge>;
  };

  const successRate = builds 
    ? (builds.filter(b => b.build_status === 'completed').length / builds.length * 100).toFixed(1)
    : '0.0';

  const avgBuildTime = builds && builds.length > 0
    ? (builds
        .filter(b => b.build_duration_seconds !== null)
        .reduce((acc, b) => acc + (b.build_duration_seconds || 0), 0) / builds.filter(b => b.build_duration_seconds !== null).length
      ).toFixed(1)
    : '0.0';

  const stuckBuilds = builds?.filter(b => 
    b.build_status === 'building' && 
    new Date(b.build_started_at || b.created_at).getTime() < Date.now() - 15 * 60 * 1000
  ) || [];

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Activity className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <Activity className="h-8 w-8" />
          Build Health Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Monitore a saude e o desempenho do sistema de builds
        </p>
      </div>

      {/* Alertas Criticos */}
      {stuckBuilds.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>[WARN]  Builds Travados Detectados</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              {stuckBuilds.length} build(s) estao travados ha mais de 15 minutos. 
              O watchdog deve limpa-los automaticamente.
            </span>
            <Button 
              size="sm" 
              variant="destructive"
              onClick={() => cleanupMutation.mutate()}
              disabled={cleanupMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {cleanupMutation.isPending ? 'Limpando...' : 'Limpar Agora'}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Metricas */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <CheckCircle className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground">
              Ultimos 10 builds
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Medio</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgBuildTime}s</div>
            <p className="text-xs text-muted-foreground">
              Duracao media de build
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Builds em Andamento</CardTitle>
            <Activity className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {builds?.filter(b => b.build_status === 'building').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Aguardando conclusao
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Builds Recentes */}
      <Card>
        <CardHeader>
          <CardTitle>Builds Recentes</CardTitle>
          <CardDescription>Ultimos 10 builds do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {builds && builds.length > 0 ? (
              builds.map((build) => (
                <div key={build.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      Build ID: {build.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBrazilDateTime(build.created_at, 'datetime')}
                    </p>
                    {build.error_message && (
                      <p className="text-xs text-destructive mt-1">
                        {build.error_message}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {build.build_duration_seconds && (
                      <span className="text-sm text-muted-foreground">
                        {build.build_duration_seconds}s
                      </span>
                    )}
                    {getStatusBadge(build.build_status)}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhum build encontrado
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
