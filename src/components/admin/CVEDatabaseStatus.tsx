import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, RefreshCw, Clock, Database, AlertTriangle, CheckCircle, Languages } from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/lib/date-utils';
import { logger } from '@/lib/logger';

interface CVESyncStatus {
  id: string;
  last_sync_at: string | null;
  sync_status: string;
  total_cves_synced: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  last_modified_date: string | null;
}

interface TopCVE {
  cve_id: string;
  cvss_score: number | null;
  description: string | null;
  published_date: string | null;
}

// Cache de traduções para evitar chamadas repetidas
const translationCache: Record<string, string> = {};

export default function CVEDatabaseStatus() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const queryClient = useQueryClient();
  
  const { data: syncStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['cve-sync-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cve_sync_status')
        .select('id, sync_status, last_sync_at, total_cves_synced, error_message, last_modified_date, created_at, updated_at')
        .order('last_sync_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as CVESyncStatus | null;
    },
  });
  
  const { data: cveCount, isLoading: countLoading } = useQuery({
    queryKey: ['cve-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('cve_database')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      return count || 0;
    },
  });
  
  const { data: topCVEs, isLoading: topLoading } = useQuery({
    queryKey: ['top-cves'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cve_database')
        .select('cve_id, cvss_score, description, published_date')
        .not('cvss_score', 'is', null)
        .order('cvss_score', { ascending: false })
        .order('published_date', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data as TopCVE[];
    },
  });

  // Função para traduzir CVEs automaticamente
  const translateCVEs = async () => {
    if (!topCVEs || topCVEs.length === 0) return;
    
    setIsTranslating(true);
    const newTranslations: Record<string, string> = { ...translations };
    
    for (const cve of topCVEs) {
      if (!cve.description || translationCache[cve.cve_id]) {
        if (translationCache[cve.cve_id]) {
          newTranslations[cve.cve_id] = translationCache[cve.cve_id];
        }
        continue;
      }
      
      try {
        const { data, error } = await supabase.functions.invoke('translate-cve', {
          body: { cve_id: cve.cve_id, description: cve.description },
        });
        
        if (!error && data?.translated) {
          translationCache[cve.cve_id] = data.translated;
          newTranslations[cve.cve_id] = data.translated;
        }
      } catch (err) {
        logger.error('Translation error for', cve.cve_id, err);
      }
    }
    
    setTranslations(newTranslations);
    setIsTranslating(false);
    toast.success('CVEs traduzidos para português');
  };

  // Auto-traduzir quando CVEs carregarem
  useEffect(() => {
    if (topCVEs && topCVEs.length > 0 && Object.keys(translations).length === 0) {
      translateCVEs();
    }
  }, [topCVEs]);
  
  const syncMutation = useMutation({
    mutationFn: async () => {
      setIsSyncing(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      
      const response = await supabase.functions.invoke('sync-cve-database', {
        body: {},
      });
      
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Sincronização concluída: ${data.cves_upserted} CVEs atualizados`);
      queryClient.invalidateQueries({ queryKey: ['cve-sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['cve-count'] });
      queryClient.invalidateQueries({ queryKey: ['top-cves'] });
      // Limpar traduções para re-traduzir novos CVEs
      setTranslations({});
    },
    onError: (error) => {
      toast.error(`Erro na sincronização: ${error.message}`);
    },
    onSettled: () => {
      setIsSyncing(false);
    },
  });
  
  const getSeverityFromScore = (score: number | null): string => {
    if (!score) return 'N/A';
    if (score >= 9.0) return 'CRITICAL';
    if (score >= 7.0) return 'HIGH';
    if (score >= 4.0) return 'MEDIUM';
    return 'LOW';
  };
  
  const getSeverityColor = (score: number | null) => {
    if (!score) return 'outline';
    if (score >= 9.0) return 'destructive';
    if (score >= 7.0) return 'destructive';
    if (score >= 4.0) return 'secondary';
    return 'outline';
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'default';
      case 'partial': return 'secondary';
      case 'failed': return 'destructive';
      default: return 'outline';
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Main Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Banco de CVEs
              </CardTitle>
              <CardDescription>
                Vulnerabilidades conhecidas do National Vulnerability Database
              </CardDescription>
            </div>
            <Button 
              onClick={() => syncMutation.mutate()} 
              disabled={isSyncing}
              variant="outline"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Total CVEs */}
            <div className="p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Shield className="h-4 w-4" />
                <span className="text-sm">Total de CVEs</span>
              </div>
              {countLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <span className="text-2xl font-bold">{cveCount?.toLocaleString()}</span>
              )}
            </div>
            
            {/* Last Sync */}
            <div className="p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-sm">Última Sincronização</span>
              </div>
              {statusLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : syncStatus?.last_sync_at ? (
                <span className="text-lg font-medium">
                  {formatRelativeTime(syncStatus.last_sync_at)}
                </span>
              ) : (
                <span className="text-lg text-muted-foreground">Nunca</span>
              )}
            </div>
            
            {/* Sync Status */}
            <div className="p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                {syncStatus?.sync_status === 'success' ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : syncStatus?.sync_status === 'failed' ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="text-sm">Status</span>
              </div>
              {statusLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <Badge variant={getStatusColor(syncStatus?.sync_status || '')}>
                  {syncStatus?.sync_status === 'success' ? 'Sucesso' : 
                   syncStatus?.sync_status === 'partial' ? 'Parcial' : 
                   syncStatus?.sync_status === 'failed' ? 'Falhou' : 'Pendente'}
                </Badge>
              )}
            </div>
            
            {/* Total Synced */}
            <div className="p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Database className="h-4 w-4" />
                <span className="text-sm">CVEs Sincronizados</span>
              </div>
              {statusLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <span className="text-lg font-medium">
                  {syncStatus?.total_cves_synced?.toLocaleString() || 0}
                </span>
              )}
            </div>
          </div>
          
          {syncStatus?.error_message && (
            <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Erro na última sincronização:</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{syncStatus.error_message}</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Top CVEs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">CVEs Críticos Recentes</CardTitle>
              <CardDescription>Vulnerabilidades com maior pontuação CVSS</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={translateCVEs}
              disabled={isTranslating || !topCVEs?.length}
            >
              <Languages className={`h-4 w-4 mr-2 ${isTranslating ? 'animate-pulse' : ''}`} />
              {isTranslating ? 'Traduzindo...' : 'Traduzir'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {topLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : topCVEs && topCVEs.length > 0 ? (
            <div className="space-y-2">
              {topCVEs.map((cve) => (
                <div 
                  key={cve.cve_id}
                  className="p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <a 
                      href={`https://nvd.nist.gov/vuln/detail/${cve.cve_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm font-medium hover:underline text-primary"
                    >
                      {cve.cve_id}
                    </a>
                    <div className="flex items-center gap-2">
                      {translations[cve.cve_id] && (
                        <Badge variant="outline" className="text-xs">
                          <Languages className="h-3 w-3 mr-1" />
                          PT
                        </Badge>
                      )}
                      <Badge variant={getSeverityColor(cve.cvss_score)}>
                        {getSeverityFromScore(cve.cvss_score)}
                      </Badge>
                      <span className="font-bold text-sm">
                        {cve.cvss_score?.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {translations[cve.cve_id] || cve.description}
                  </p>
                  {cve.published_date && (
                    <span className="text-xs text-muted-foreground">
                      Publicado: {new Date(cve.published_date).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>Nenhum CVE no banco de dados</p>
              <p className="text-sm">Clique em "Sincronizar Agora" para popular</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
