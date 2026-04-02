import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HardDrive, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { callGateway } from "@/lib/gateway";

interface SyncResult {
  platform: string;
  success: boolean;
  synced: boolean;
  message?: string;
  version?: string;
  error?: string;
}

/**
 * SyncStorageBucket Component
 * 
 * Sincroniza scripts de agent_releases para o storage bucket como fallback de emergência.
 * Isso garante que mesmo se o serve-installer tiver problemas ao buscar do banco,
 * há um fallback no storage bucket.
 */
export function SyncStorageBucket() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [results, setResults] = useState<SyncResult[]>([]);

  const syncPlatform = async (platform: string): Promise<SyncResult> => {
    try {
      const data = await callGateway<{ synced?: boolean; message?: string; version?: string; error?: string }>(
        'sync',
        'sync-storage-bucket',
        { platform, force: false }
      );

      return {
        platform,
        success: true,
        synced: data.synced ?? false,
        message: data.message,
        version: data.version
      };
    } catch (error) {
      return {
        platform,
        success: false,
        synced: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  };

  const handleSync = async () => {
    if (!confirm('Sincronizar storage bucket com releases ativas?\n\nIsso irá:\n1. Copiar scripts de agent_releases para o storage bucket\n2. Garantir fallback de emergência para instalações\n\nContinuar?')) {
      return;
    }

    setIsSyncing(true);
    setResults([]);
    toast.info('Sincronizando storage bucket...', { duration: 3000 });

    try {
      const platforms = ['windows', 'linux', 'macos'];
      const syncResults: SyncResult[] = [];

      for (const platform of platforms) {
        const result = await syncPlatform(platform);
        syncResults.push(result);
        setResults([...syncResults]);
      }

      const successCount = syncResults.filter(r => r.success).length;
      const syncedCount = syncResults.filter(r => r.synced).length;

      if (successCount === platforms.length) {
        if (syncedCount > 0) {
          toast.success(`Storage bucket sincronizado!`, {
            description: `${syncedCount} plataforma(s) atualizada(s)`
          });
        } else {
          toast.info('Storage bucket já está sincronizado', {
            description: 'Nenhuma atualização necessária'
          });
        }
      } else {
        toast.warning('Algumas plataformas falharam', {
          description: `Sucesso: ${successCount}/${platforms.length}`
        });
      }
    } catch (error) {
      toast.error('Erro ao sincronizar', {
        description: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Card className="border-amber-500/30 bg-amber-950/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-lg">Storage Bucket (Fallback)</CardTitle>
          </div>
          <Badge variant="outline" className="text-amber-500 border-amber-500/50">
            Emergência
          </Badge>
        </div>
        <CardDescription>
          Sincroniza scripts do banco de dados para o storage bucket como fallback de emergência.
          Use apenas se houver problemas de desincronização.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={handleSync}
          disabled={isSyncing}
          variant="outline"
          className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
        >
          {isSyncing ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Sincronizar Storage Bucket
            </>
          )}
        </Button>

        {results.length > 0 && (
          <div className="space-y-2 mt-4">
            {results.map((result) => (
              <div 
                key={result.platform}
                className={`flex items-center justify-between p-2 rounded text-sm ${
                  result.success 
                    ? 'bg-emerald-950/30 border border-emerald-500/30' 
                    : 'bg-red-950/30 border border-red-500/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  {result.success ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="font-medium capitalize">{result.platform}</span>
                </div>
                <div className="text-muted-foreground">
                  {result.success ? (
                    result.synced ? (
                      <span className="text-emerald-400">Atualizado para {result.version}</span>
                    ) : (
                      <span className="text-blue-400">Já sincronizado</span>
                    )
                  ) : (
                    <span className="text-red-400">{result.error}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
