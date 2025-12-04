import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgentReleases } from "@/hooks/useAgentReleases";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Package, CheckCircle, AlertCircle, Download } from "lucide-react";
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from "@/components/ErrorState";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

const CURRENT_VERSION = 'v3.10.24-SMART-UPDATE';

// SHA256 will be calculated automatically WITH BOM by useAgentReleases hook
// No need for manual SHA256 anymore - the hook handles BOM compatibility automatically

export default function AgentReleases() {
  const { releases, isLoading, error, refetch, registerRelease, isRegistering } = useAgentReleases();
  const { isSuperAdmin, loading: isCheckingRole } = useSuperAdmin();
  const [isProcessingUpdates, setIsProcessingUpdates] = useState(false);
  const [isForceReregistering, setIsForceReregistering] = useState(false);

  const handleForceUpdateCheck = async () => {
    try {
      setIsProcessingUpdates(true);
      const { data, error } = await supabase.functions.invoke('process-agent-updates');
      
      if (error) throw error;
      
      // Defensive parsing: validate response structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format from process-agent-updates');
      }
      
      const result = data as { 
        success?: boolean; 
        total_jobs_created?: number; 
        platforms?: Array<{platform: string; outdated_count: number; jobs_created: number}>
      };
      
      const totalJobs = result.total_jobs_created ?? 0;
      const platformsInfo = result.platforms && Array.isArray(result.platforms)
        ? result.platforms.map(p => `${p.platform}: ${p.jobs_created ?? 0} jobs`).join(', ')
        : 'Nenhuma plataforma processada';
      
      toast.success(`Verificação concluída: ${totalJobs} jobs de atualização criados`, {
        description: platformsInfo
      });
      
      refetch();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Erro ao forçar verificação de updates', {
        description: errorMessage
      });
    } finally {
      setIsProcessingUpdates(false);
    }
  };
  const [fetchingScript, setFetchingScript] = useState(false);

  const handleRegisterCurrentVersion = async () => {
    if (!confirm(`Registrar ${CURRENT_VERSION} com script completo?\n\nIsso ira buscar o script atual e registrar no agent_releases.`)) {
      return;
    }

    try {
      setFetchingScript(true);
      toast.info('Buscando script do agente...');

      // Fetch the embedded agent script directly (no enrollment key needed)
      const { data: scriptData, error: scriptError } = await supabase.functions.invoke(
        'get-agent-script-content'
      );

      if (scriptError) throw scriptError;
      if (!scriptData?.script_content) {
        throw new Error('No script content received');
      }

      const scriptContent = scriptData.script_content;
      if (scriptContent.length < 10000) {
        throw new Error(`Script too small (${scriptContent.length} bytes) - likely placeholder`);
      }

      toast.success(`Script obtido: ${(scriptContent.length / 1024).toFixed(1)} KB`);

      // Register the release - SHA256 with BOM will be calculated automatically
      registerRelease({
        version: CURRENT_VERSION,
        platform: 'windows',
        script_content: scriptContent,
        release_notes: 'OPEN-PORTS-FIX: Corrige coleta de portas abertas usando Get-NetTCPConnection/Get-NetUDPEndpoint (mais confiável que netstat). Coleta TCP e UDP listening ports com nome do processo.',
        channel: 'stable'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Erro ao registrar release: ${errorMessage}`);
    } finally {
      setFetchingScript(false);
    }
  };

  const handleForceReregister = async () => {
    if (!confirm(`FORÇAR RE-REGISTRO de ${CURRENT_VERSION}?\n\nIsso ira:\n1. Deletar a entrada atual do banco\n2. Buscar o script atualizado\n3. Re-registrar a versao\n\nContinuar?`)) {
      return;
    }

    try {
      setIsForceReregistering(true);
      toast.info('Deletando entrada atual...');

      // Delete existing entry
      const { error: deleteError } = await supabase
        .from('agent_releases')
        .delete()
        .eq('version', CURRENT_VERSION)
        .eq('platform', 'windows');

      if (deleteError) throw deleteError;

      toast.success('Entrada deletada. Buscando script...');

      // Now register the correct version
      const { data: scriptData, error: scriptError } = await supabase.functions.invoke(
        'get-agent-script-content'
      );

      if (scriptError) throw scriptError;
      if (!scriptData?.script_content) {
        throw new Error('No script content received');
      }

      const scriptContent = scriptData.script_content;
      if (scriptContent.length < 10000) {
        throw new Error(`Script too small (${scriptContent.length} bytes) - likely placeholder`);
      }

      toast.success(`Script obtido: ${(scriptContent.length / 1024).toFixed(1)} KB`);

      // Register the release - SHA256 with BOM will be calculated automatically
      registerRelease({
        version: CURRENT_VERSION,
        platform: 'windows',
        script_content: scriptContent,
        release_notes: 'OPEN-PORTS-FIX: Corrige coleta de portas abertas usando Get-NetTCPConnection/Get-NetUDPEndpoint (mais confiável que netstat). Coleta TCP e UDP listening ports com nome do processo.',
        channel: 'stable'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Erro ao forcar re-registro: ${errorMessage}`);
    } finally {
      setIsForceReregistering(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <ErrorState 
          error={error} 
          onRetry={refetch}
          title="Erro ao Carregar Releases"
        />
      </div>
    );
  }

  const currentVersion = releases.find(r => r.version === CURRENT_VERSION && r.platform === 'windows');
  const scriptSizeKB = currentVersion ? Math.round(currentVersion.script_content.length / 1024) : 0;
  const needsRegistration = !currentVersion || scriptSizeKB < 40;
  const latestRelease = releases[0]; // First release is the most recent (order by created_at desc)

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Agent Releases</h1>
          <p className="text-muted-foreground">Gerenciar versoes de agentes e auto-update</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleForceReregister}
            disabled={isForceReregistering || fetchingScript || isRegistering}
            variant="destructive"
          >
            {isForceReregistering ? "Re-registrando..." : "Forçar Re-registro"}
          </Button>
          <Button 
            onClick={handleForceUpdateCheck}
            disabled={isProcessingUpdates}
            variant="outline"
          >
            {isProcessingUpdates ? "Processando..." : "Forçar Verificação de Updates"}
          </Button>
        </div>
      </div>

      {/* Action Card */}
      {needsRegistration && (
        <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Acao Necessaria
            </CardTitle>
            <CardDescription className="text-orange-800 dark:text-orange-200">
              {CURRENT_VERSION} precisa ser registrado com script completo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-orange-800 dark:text-orange-200">
                {currentVersion 
                  ? `Script atual: ${scriptSizeKB}KB (placeholder). Necessario: >40KB`
                  : 'Release nao encontrada no banco de dados'}
              </p>
              
              {!isSuperAdmin && !isCheckingRole && (
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                  ⚠️ Apenas super_admin pode registrar releases
                </p>
              )}
              
              <Button
                onClick={handleRegisterCurrentVersion}
                disabled={!isSuperAdmin || fetchingScript || isRegistering || isCheckingRole}
                className="gap-2"
              >
                <Package className="h-4 w-4" />
                {fetchingScript ? 'Buscando Script...' : isRegistering ? 'Registrando...' : `Registrar ${CURRENT_VERSION}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Releases List */}
      <div className="grid gap-4">
        {releases.map((release, idx) => {
          const sizeKB = Math.round(release.script_content.length / 1024);
          const isValid = sizeKB > 40;

          return (
            <motion.div
              key={release.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
            >
              <Card className={isValid ? '' : 'border-red-200 dark:border-red-900'}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        {release.version}
                        {release.is_active && (
                          <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30 border-green-500">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Ativo
                          </Badge>
                        )}
                        {latestRelease?.id === release.id && (
                          <Badge variant="default">Latest</Badge>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="secondary">{release.platform}</Badge>
                        <Badge variant="outline">{release.channel}</Badge>
                        <span>•</span>
                        <span>{format(new Date(release.created_at), 'PPp', { locale: ptBR })}</span>
                      </div>
                    </div>
                    {isValid ? (
                      <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30 border-green-500">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {sizeKB}KB
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 dark:bg-red-950/30 border-red-500">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {sizeKB}KB (Placeholder)
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                {release.release_notes && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {release.release_notes}
                    </p>
                  </CardContent>
                )}
              </Card>
            </motion.div>
          );
        })}

        {releases.length === 0 && (
          <Card className="p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <Download className="h-12 w-12 text-muted-foreground/50" />
              <div>
                <p className="text-lg font-medium">Nenhuma release registrada</p>
                <p className="text-sm text-muted-foreground">
                  Registre a primeira release para ativar auto-update
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
