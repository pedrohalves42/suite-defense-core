import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Package, CheckCircle, AlertCircle, ShieldCheck, Loader2 } from "lucide-react";
import { formatBrazilDateTime } from '@/lib/date-utils';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from "@/components/ErrorState";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { RegisterLatestRelease } from "@/components/admin/RegisterLatestRelease";
import { useQuery } from "@tanstack/react-query";
import { useAgentActions } from "@/hooks/useAgentActions";

// Admin-only interface with all fields
interface AdminRelease {
  id: string;
  version: string;
  platform: string;
  channel: string;
  sha256: string;
  release_notes: string | null;
  is_active: boolean;
  created_at: string;
  script_content: string;
  signature_base64: string | null;
  signed_at: string | null;
  signed_by: string | null;
}

export default function AgentReleases() {
  const { isSuperAdmin } = useSuperAdmin();
  const [isSigningReleases, setIsSigningReleases] = useState(false);
  const [isProcessingUpdates, setIsProcessingUpdates] = useState(false);
  const [validatingHash, setValidatingHash] = useState<string | null>(null);
  const { unblockVersion } = useAgentActions();

  // SECURITY: Admin-only query via Edge Function (bypasses column-level restrictions)
  const { data: releases = [], isLoading, error, refetch } = useQuery<AdminRelease[]>({
    queryKey: ['admin-agent-releases'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-admin-releases');
      if (error) throw error;
      return data?.releases || [];
    },
    enabled: isSuperAdmin,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });


  const handleSignReleases = async () => {
    if (!isSuperAdmin) {
      toast.error('Apenas super_admin pode assinar releases');
      return;
    }

    try {
      setIsSigningReleases(true);
      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.access_token) throw new Error('Sessão expirada');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-release?action=sign-existing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
          },
          body: JSON.stringify({})
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao assinar');

      const signedCount = result.signed_count || 0;
      if (signedCount > 0) {
        toast.success(`${signedCount} releases assinadas com sucesso!`);
      } else {
        toast.info('Todas as releases já estão assinadas');
      }
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao assinar');
    } finally {
      setIsSigningReleases(false);
    }
  };

  const handleForceUpdateCheck = async () => {
    try {
      setIsProcessingUpdates(true);
      const { data, error } = await supabase.functions.invoke('process-agent-updates');
      if (error) throw error;
      
      const totalJobs = data?.total_jobs_created ?? 0;
      toast.success(`${totalJobs} jobs de atualização criados`);
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao processar');
    } finally {
      setIsProcessingUpdates(false);
    }
  };

  const handleValidateSHA256 = async (platform: string, releaseId: string, dbSha256: string) => {
    const scriptFileName = platform === 'windows' 
      ? 'cybershield-agent-windows-v4.ps1'
      : platform === 'linux'
        ? 'cybershield-agent-linux-v4.sh'
        : 'cybershield-agent-macos-v4.sh';
    
    try {
      setValidatingHash(releaseId);
      const response = await fetch(`/agent-scripts/${scriptFileName}`);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      
      const scriptContent = await response.text();
      const encoder = new TextEncoder();
      const data = encoder.encode(scriptContent);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const calculatedSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      if (calculatedSha256 === dbSha256) {
        toast.success(`SHA256 válido para ${platform}`);
      } else {
        toast.error(`SHA256 INVÁLIDO para ${platform}`);
      }
    } catch (error) {
      toast.error(`Erro ao validar: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setValidatingHash(null);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-96" />
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <ErrorState error={error} onRetry={refetch} title="Erro ao Carregar Releases" />
      </div>
    );
  }

  const latestRelease = releases[0];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Versões do Programa</h1>
          <p className="text-muted-foreground">Gerencie as versões instaladas nos computadores</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleSignReleases}
            disabled={isSigningReleases || !isSuperAdmin}
            variant="outline"
            size="sm"
            className="gap-1"
          >
            {isSigningReleases ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
            Validar Segurança
          </Button>
          <Button 
            onClick={handleForceUpdateCheck}
            disabled={isProcessingUpdates}
            variant="outline"
            size="sm"
          >
            {isProcessingUpdates ? "Processando..." : "Atualizar Computadores"}
          </Button>
        </div>
      </div>

      {/* Register New Release - Single Dynamic Component */}
      {isSuperAdmin && <RegisterLatestRelease />}


      {/* Releases List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Versões Disponíveis</h2>
        <div className="grid gap-4">
          {releases.map((release, idx) => {
            const sizeKB = Math.round((release.script_content?.length || 0) / 1024);
            const minSizeKB = release.platform === 'windows' ? 40 : 20;
            const isValid = sizeKB > minSizeKB;

            return (
              <motion.div
                key={release.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
              >
                <Card className={isValid ? '' : 'border-destructive/50'}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2 flex-wrap text-base">
                          <Package className="h-4 w-4" />
                          {release.version}
                          <Badge variant="secondary" className="text-xs">{release.platform}</Badge>
                          {release.is_active && (
                            <Badge variant="outline" className="bg-green-500/10 border-green-500 text-green-700 dark:text-green-400 text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Ativo
                            </Badge>
                          )}
                          {latestRelease?.id === release.id && (
                            <Badge variant="default" className="text-xs">Latest</Badge>
                          )}
                          {release.signature_base64 ? (
                            <Badge variant="outline" className="bg-blue-500/10 border-blue-500 text-blue-700 dark:text-blue-400 text-xs">
                              <ShieldCheck className="h-3 w-3 mr-1" />
                              Assinada
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-400 text-xs">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Sem Assinatura
                            </Badge>
                          )}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {formatBrazilDateTime(release.created_at, 'datetime')}
                          {release.signed_at && ` • Assinada: ${formatBrazilDateTime(release.signed_at, 'datetime')}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleValidateSHA256(release.platform, release.id, release.sha256)}
                          disabled={validatingHash === release.id}
                          className="text-xs h-7"
                        >
                          {validatingHash === release.id ? 'Verificando...' : 'Verificar Integridade'}
                        </Button>
                        <Badge variant={isValid ? "outline" : "destructive"} className="text-xs">
                          {sizeKB}KB {!isValid && '(Placeholder)'}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  {release.release_notes && (
                    <CardContent className="pt-0">
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
                    Use o formulário acima para registrar a primeira release
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
