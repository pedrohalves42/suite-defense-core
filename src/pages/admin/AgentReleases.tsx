import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgentReleases } from "@/hooks/useAgentReleases";
import { Package, CheckCircle, AlertCircle, Download } from "lucide-react";
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from "@/components/ErrorState";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

export default function AgentReleases() {
  const { releases, isLoading, error, refetch, registerRelease, isRegistering } = useAgentReleases();
  const [fetchingScript, setFetchingScript] = useState(false);

  const handleRegisterV3_10_0 = async () => {
    if (!confirm('Registrar v3.10.0-SECURITY-FEATURES com script completo?\n\nIsso ira buscar o script atual do serve-installer e registrar no agent_releases.')) {
      return;
    }

    setFetchingScript(true);
    
    try {
      // First, get an enrollment key to fetch the installer
      const { data: keyData, error: keyError } = await supabase
        .from('enrollment_keys')
        .select('key')
        .eq('is_active', true)
        .gte('expires_at', new Date().toISOString())
        .limit(1)
        .single();

      if (keyError) throw new Error('No active enrollment key found');

      // Fetch the installer script from serve-installer
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-installer?key=${keyData.key}&platform=windows`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch installer: ${response.status}`);
      }

      const scriptContent = await response.text();

      // Extract embedded agent script using regex
      const embedMatch = scriptContent.match(/@["'][\r\n]+([\s\S]+?)[\r\n]+["']@/);
      
      if (!embedMatch || !embedMatch[1]) {
        throw new Error('Could not extract embedded agent script from installer');
      }

      const agentScript = embedMatch[1].trim();

      if (agentScript.length < 50000) {
        throw new Error(`Extracted script too small (${agentScript.length} bytes). Expected >50KB.`);
      }

      // Register the release
      registerRelease({
        version: 'v3.10.0-SECURITY-FEATURES',
        platform: 'windows',
        script_content: agentScript,
        release_notes: '10 security features: Software Inventory, URL Analysis, Vulnerability Scanning, Security Policies, Scheduled Jobs, Agent Groups, Antivirus Integration, Anomaly Detection, Auto-remediation, Agent Timeline + Web Activity tracking',
        channel: 'stable',
      });

      toast.success(`Script extraido (${Math.round(agentScript.length / 1024)}KB) e enviado para registro`);
    } catch (error: any) {
      console.error('Error fetching/registering script:', error);
      toast.error(`Erro: ${error.message}`);
    } finally {
      setFetchingScript(false);
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

  const v3_10_0 = releases.find(r => r.version === 'v3.10.0-SECURITY-FEATURES' && r.platform === 'windows');
  const scriptSizeKB = v3_10_0 ? Math.round(v3_10_0.script_content.length / 1024) : 0;
  const needsRegistration = !v3_10_0 || scriptSizeKB < 50;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Agent Releases</h1>
        <p className="text-muted-foreground">Gerenciar versoes de agentes e auto-update</p>
      </div>

      {/* Action Card */}
      {needsRegistration && (
        <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Acao Necessaria
            </CardTitle>
            <CardDescription>
              v3.10.0-SECURITY-FEATURES precisa ser registrado com script completo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {v3_10_0 
                  ? `Script atual: ${scriptSizeKB}KB (placeholder). Necessario: >50KB`
                  : 'Release nao encontrada no banco de dados'}
              </p>
              <Button
                onClick={handleRegisterV3_10_0}
                disabled={fetchingScript || isRegistering}
                className="gap-2"
              >
                <Package className="h-4 w-4" />
                {fetchingScript ? 'Buscando Script...' : isRegistering ? 'Registrando...' : 'Registrar v3.10.0-SECURITY-FEATURES'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Releases List */}
      <div className="grid gap-4">
        {releases.map((release, idx) => {
          const sizeKB = Math.round(release.script_content.length / 1024);
          const isValid = sizeKB > 50;

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
