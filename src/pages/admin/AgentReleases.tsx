import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgentReleases } from "@/hooks/useAgentReleases";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Package, CheckCircle, AlertCircle } from "lucide-react";
import { formatBrazilDateTime } from '@/lib/date-utils';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from "@/components/ErrorState";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { AgentVersionSync } from "@/components/admin/AgentVersionSync";
// Versões específicas por plataforma - DEVE corresponder às versões ativas em agent_releases
const CURRENT_VERSIONS = {
  windows: 'v4.0.7',
  linux: 'v4.0.7',
  macos: 'v4.0.7'
} as const;

// SHA256 will be calculated automatically WITHOUT BOM by useAgentReleases hook (v3.10.12+ standard)
// No need for manual SHA256 anymore - the hook handles calculation automatically

export default function AgentReleases() {
  const { releases, isLoading, error, refetch, registerRelease, isRegistering } = useAgentReleases();
  const { isSuperAdmin, loading: isCheckingRole } = useSuperAdmin();
  const [isProcessingUpdates, setIsProcessingUpdates] = useState(false);
  const [isForceReregistering, setIsForceReregistering] = useState(false);
  const [fetchingScript, setFetchingScript] = useState(false);
  const [validatingHash, setValidatingHash] = useState<string | null>(null);

  // Validate SHA256 of a release against the public script
  const handleValidateSHA256 = async (platform: 'windows' | 'linux' | 'macos', releaseId: string, dbSha256: string) => {
    const scriptFileName = platform === 'windows' 
      ? 'cybershield-agent-windows-v4.ps1'
      : platform === 'linux'
        ? 'cybershield-agent-linux-v4.sh'
        : 'cybershield-agent-macos-v4.sh';
    
    try {
      setValidatingHash(releaseId);
      
      // Fetch script from public folder
      const response = await fetch(`/agent-scripts/${scriptFileName}`);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      
      const scriptContent = await response.text();
      
      // Calculate SHA256
      const encoder = new TextEncoder();
      const data = encoder.encode(scriptContent);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const calculatedSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Compare
      const match = calculatedSha256 === dbSha256;
      
      if (match) {
        toast.success(`SHA256 válido para ${platform}`, {
          description: `Hash: ${calculatedSha256.substring(0, 16)}...`
        });
      } else {
        toast.error(`SHA256 INVÁLIDO para ${platform}`, {
          description: `DB: ${dbSha256.substring(0, 16)}...\nCalculado: ${calculatedSha256.substring(0, 16)}...`
        });
      }
    } catch (error) {
      toast.error(`Erro ao validar ${platform}: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setValidatingHash(null);
    }
  };

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

  // Fetch and register script directly from public/agent-scripts folder
  // Also uploads to storage bucket for Edge Functions to access
  const handleRegisterFromPublic = async (platform: 'windows' | 'linux' | 'macos') => {
    const platformLabel = platform === 'windows' ? 'Windows' : platform === 'linux' ? 'Linux' : 'macOS';
    const version = CURRENT_VERSIONS[platform];
    const scriptFileName = platform === 'windows' 
      ? 'cybershield-agent-windows-v4.ps1'
      : platform === 'linux'
        ? 'cybershield-agent-linux-v4.sh'
        : 'cybershield-agent-macos-v4.sh';
    
    if (!confirm(`Registrar ${version} (${platformLabel}) com script completo?\n\nIsso irá:\n1. Carregar o script de /agent-scripts/${scriptFileName}\n2. Upload para storage bucket\n3. Calcular SHA256\n4. Registrar no banco de dados\n\nContinuar?`)) {
      return;
    }

    try {
      setFetchingScript(true);
      toast.info(`Carregando script ${platformLabel} de /agent-scripts/...`);

      // Fetch the script directly from the public folder
      const response = await fetch(`/agent-scripts/${scriptFileName}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch script: ${response.status} ${response.statusText}`);
      }

      const scriptContent = await response.text();
      const minSize = platform === 'windows' ? 40000 : 20000;
      
      if (scriptContent.length < minSize) {
        throw new Error(`Script ${platformLabel} muito pequeno (${(scriptContent.length / 1024).toFixed(1)} KB). Esperado: >${(minSize / 1024).toFixed(0)} KB`);
      }

      toast.success(`Script ${platformLabel} carregado: ${(scriptContent.length / 1024).toFixed(1)} KB`);

      // Upload to storage bucket
      toast.info(`Fazendo upload para storage bucket...`);
      try {
        const { error: uploadError } = await supabase.functions.invoke('upload-agent-script', {
          body: { platform, script_content: scriptContent }
        });
        
        if (uploadError) {
          console.warn(`Upload to storage failed: ${uploadError.message}, continuing with DB registration...`);
          toast.warning(`Upload para storage falhou: ${uploadError.message}. Continuando com registro no banco...`);
        } else {
          toast.success(`Script ${platformLabel} enviado para storage bucket`);
        }
      } catch (uploadErr) {
        console.warn(`Upload to storage exception: ${uploadErr}, continuing with DB registration...`);
        toast.warning(`Upload para storage falhou. Continuando com registro no banco...`);
      }

      // Generate release notes based on version
      const releaseNotes = version === 'v4.0.7'
        ? `${version}: BUGFIX - Corrigido endpoint de heartbeat de /agent-heartbeat para /heartbeat. Mantidas funcionalidades de auto-rollback, health check, e Safe Mode.`
        : (version as string).includes('SAFE-ROLLBACK') 
        ? `${version}: Auto-rollback com backup estruturado, health check pós-update, Safe Mode após 2 rollbacks consecutivos, telemetria de eventos de rollback.`
        : `${version}: Script ${platformLabel} com otimizações (heartbeat 60s, metrics 10min, log rotation 7d/10MB).`;

      // Register the release - SHA256 will be calculated automatically by the hook
      registerRelease({
        version: version,
        platform: platform,
        script_content: scriptContent,
        release_notes: releaseNotes,
        channel: 'stable'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Erro ao registrar ${platformLabel}: ${errorMessage}`);
    } finally {
      setFetchingScript(false);
    }
  };

  // Legacy function for backward compatibility
  const handleRegisterCurrentVersion = async () => {
    await handleRegisterFromPublic('windows');
  };

  const handleForceReregister = async (platform: 'windows' | 'linux' | 'macos' = 'windows') => {
    const platformLabel = platform === 'windows' ? 'Windows' : platform === 'linux' ? 'Linux' : 'macOS';
    const currentVersion = CURRENT_VERSIONS[platform];
    const scriptFileName = platform === 'windows' 
      ? 'cybershield-agent-windows-v4.ps1'
      : platform === 'linux'
        ? 'cybershield-agent-linux-v4.sh'
        : 'cybershield-agent-macos-v4.sh';
    
    if (!confirm(`FORÇAR RE-REGISTRO de ${currentVersion} (${platformLabel})?\n\nIsso irá:\n1. Deletar a entrada atual do banco\n2. Carregar script de /agent-scripts/${scriptFileName}\n3. Re-registrar a versão\n\nContinuar?`)) {
      return;
    }

    try {
      setIsForceReregistering(true);
      toast.info(`Deletando entrada atual (${platformLabel})...`);

      // Delete existing entry for this platform
      const { error: deleteError } = await supabase
        .from('agent_releases')
        .delete()
        .eq('version', currentVersion)
        .eq('platform', platform);

      if (deleteError) throw deleteError;

      toast.success('Entrada deletada. Carregando script...');

      // Fetch the script directly from the public folder
      const response = await fetch(`/agent-scripts/${scriptFileName}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch script: ${response.status} ${response.statusText}`);
      }

      const scriptContent = await response.text();
      const minSize = platform === 'windows' ? 40000 : 20000;
      
      if (scriptContent.length < minSize) {
        throw new Error(`Script ${platformLabel} muito pequeno (${(scriptContent.length / 1024).toFixed(1)} KB). Esperado: >${(minSize / 1024).toFixed(0)} KB`);
      }

      toast.success(`Script ${platformLabel} carregado: ${(scriptContent.length / 1024).toFixed(1)} KB`);

      // Upload to storage bucket
      try {
        await supabase.functions.invoke('upload-agent-script', {
          body: { platform, script_content: scriptContent }
        });
        toast.success(`Script enviado para storage bucket`);
      } catch (uploadErr) {
        console.warn(`Upload to storage failed, continuing...`);
      }

      // Generate release notes based on version
      const releaseNotes = currentVersion === 'v4.0.7'
        ? `${currentVersion}: BUGFIX - Corrigido endpoint de heartbeat de /agent-heartbeat para /heartbeat.`
        : (currentVersion as string).includes('SAFE-ROLLBACK') 
        ? `${currentVersion}: Auto-rollback com backup estruturado, health check pós-update, Safe Mode após 2 rollbacks consecutivos.`
        : `${currentVersion}: Script ${platformLabel} com otimizações (heartbeat 60s, metrics 10min, log rotation 7d/10MB).`;

      // Register the release - SHA256 will be calculated automatically
      registerRelease({
        version: currentVersion,
        platform: platform,
        script_content: scriptContent,
        release_notes: releaseNotes,
        channel: 'stable'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Erro ao re-registrar ${platformLabel}: ${errorMessage}`);
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

  const windowsRelease = releases.find(r => r.version === CURRENT_VERSIONS.windows && r.platform === 'windows');
  const scriptSizeKB = windowsRelease ? Math.round(windowsRelease.script_content.length / 1024) : 0;
  const needsRegistration = !windowsRelease || scriptSizeKB < 40;
  const latestRelease = releases[0]; // First release is the most recent (order by created_at desc)

  return (
    <div className="container mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Agent Releases</h1>
          <p className="text-muted-foreground">Gerenciar versoes de agentes e auto-update</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Register from public folder - primary method */}
          <Button 
            onClick={() => handleRegisterFromPublic('windows')}
            disabled={fetchingScript || isRegistering}
            variant="default"
            size="sm"
            className="gap-1"
          >
            <Package className="h-3 w-3" />
            Registrar Windows
          </Button>
          <Button 
            onClick={() => handleRegisterFromPublic('linux')}
            disabled={fetchingScript || isRegistering}
            variant="secondary"
            size="sm"
            className="gap-1"
          >
            <Package className="h-3 w-3" />
            Registrar Linux
          </Button>
          <Button 
            onClick={() => handleRegisterFromPublic('macos')}
            disabled={fetchingScript || isRegistering}
            variant="secondary"
            size="sm"
            className="gap-1"
          >
            <Package className="h-3 w-3" />
            Registrar macOS
          </Button>
          <Button 
            onClick={handleForceUpdateCheck}
            disabled={isProcessingUpdates}
            variant="outline"
            size="sm"
          >
            {isProcessingUpdates ? "Processando..." : "Verificar Updates"}
          </Button>
        </div>
      </div>

      {/* Agent Version Sync */}
      <AgentVersionSync latestVersions={CURRENT_VERSIONS} />

      {/* Action Card */}
      {needsRegistration && (
        <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Acao Necessaria
            </CardTitle>
          <CardDescription className="text-orange-800 dark:text-orange-200">
              {CURRENT_VERSIONS.windows} precisa ser registrado com script completo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-orange-800 dark:text-orange-200">
                {windowsRelease 
                  ? `Script atual: ${scriptSizeKB}KB (placeholder). Necessario: >40KB`
                  : 'Release nao encontrada no banco de dados'}
              </p>
              
              {!isSuperAdmin && !isCheckingRole && (
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                  ⚠️ Apenas super_admin pode registrar releases
                </p>
              )}
              
              <Button
                onClick={() => handleRegisterFromPublic('windows')}
                disabled={!isSuperAdmin || fetchingScript || isRegistering || isCheckingRole}
                className="gap-2"
              >
                <Package className="h-4 w-4" />
                {fetchingScript ? 'Carregando Script...' : isRegistering ? 'Registrando...' : `Registrar ${CURRENT_VERSIONS.windows}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Releases List */}
      <div className="grid gap-4">
        {releases.map((release, idx) => {
          const sizeKB = Math.round(release.script_content.length / 1024);
          const minSizeKB = release.platform === 'windows' ? 40 : 20;
          const isValid = sizeKB > minSizeKB;

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
                        <span>{formatBrazilDateTime(release.created_at, 'datetime')}</span>
                      </div>
                    </div>
                    {isValid ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleValidateSHA256(
                            release.platform as 'windows' | 'linux' | 'macos',
                            release.id,
                            release.sha256
                          )}
                          disabled={validatingHash === release.id}
                          className="text-xs"
                        >
                          {validatingHash === release.id ? 'Validando...' : 'Validar SHA256'}
                        </Button>
                        <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30 border-green-500">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {sizeKB}KB
                        </Badge>
                      </div>
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
              <Package className="h-12 w-12 text-muted-foreground/50" />
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
