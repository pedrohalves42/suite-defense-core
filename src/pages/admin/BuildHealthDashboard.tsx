import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Activity, AlertCircle, CheckCircle2, Clock, XCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export default function BuildHealthDashboard() {
  const queryClient = useQueryClient();
  
  const { data: builds, isLoading } = useQuery({
    queryKey: ["recent-builds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_builds')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    refetchInterval: 15000, // Atualizar a cada 15s
  });

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('cleanup-stuck-builds');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`✅ Limpeza concluída: ${data.cleaned_count} build(s) marcados como falhos`);
      queryClient.invalidateQueries({ queryKey: ["recent-builds"] });
    },
    onError: (error: Error) => {
      toast.error(`❌ Erro na limpeza: ${error.message}`);
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-success text-success-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />Sucesso</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Falhou</Badge>;
      case 'building':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1 animate-spin" />Building</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
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
          Monitore a saúde e o desempenho do sistema de builds
        </p>
      </div>

      {/* Alertas Críticos */}
      {stuckBuilds.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>⚠ Builds Travados Detectados</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              {stuckBuilds.length} build(s) estão travados há mais de 15 minutos. 
              O watchdog deve limpá-los automaticamente.
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

      {/* Métricas */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground">
              Últimos 10 builds
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgBuildTime}s</div>
            <p className="text-xs text-muted-foreground">
              Duração média de build
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
              Aguardando conclusão
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Builds Recentes */}
      <Card>
        <CardHeader>
          <CardTitle>Builds Recentes</CardTitle>
          <CardDescription>Últimos 10 builds do sistema</CardDescription>
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
                      {format(new Date(build.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
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
