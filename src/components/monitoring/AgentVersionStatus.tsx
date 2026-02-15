import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Download, ChevronDown, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { prepareJobsForInsert } from '@/lib/job-utils';

interface Agent {
  id: string;
  name: string;
  agent_version?: string;
  is_online?: boolean;
}

interface AgentVersionStatusProps {
  agents: Agent[];
  tenantId: string | null;
  onRefresh?: () => void;
}

export function AgentVersionStatus({ agents, tenantId, onRefresh }: AgentVersionStatusProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch latest version on component mount
  useEffect(() => {
    const fetchLatestVersion = async () => {
      const { data } = await supabase
        .from('agent_versions')
        .select('version')
        .eq('platform', 'windows')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (data) {
        setLatestVersion(data.version);
      }
    };
    fetchLatestVersion();
  }, []);

  // Compare versions - returns true if v1 < v2
  const isVersionOutdated = (agentVersion: string | undefined, latest: string): boolean => {
    if (!agentVersion) return true;
    
    const parseVersion = (v: string) => {
      const clean = v.replace(/^v/, '');
      return clean.split('.').map(n => parseInt(n, 10) || 0);
    };
    
    const v1Parts = parseVersion(agentVersion);
    const v2Parts = parseVersion(latest);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1 = v1Parts[i] || 0;
      const v2 = v2Parts[i] || 0;
      if (v1 < v2) return true;
      if (v1 > v2) return false;
    }
    return false;
  };

  const outdatedAgents = latestVersion 
    ? agents.filter(a => isVersionOutdated(a.agent_version, latestVersion))
    : [];
  
  const updatedAgents = latestVersion
    ? agents.filter(a => !isVersionOutdated(a.agent_version, latestVersion))
    : agents;

  const handleMassUpdate = async () => {
    if (!tenantId || outdatedAgents.length === 0) return;
    
    setIsUpdating(true);
    try {
      const onlineOutdated = outdatedAgents.filter(a => a.is_online);
      
      if (onlineOutdated.length === 0) {
        toast({
          title: 'Nenhum agente online',
          description: 'Os agentes desatualizados estão offline. A atualização será feita quando ficarem online.',
          variant: 'default',
        });
        return;
      }

      const jobs = onlineOutdated.map(agent => ({
        tenant_id: tenantId,
        agent_id: agent.id,
        agent_name: agent.name,
        type: 'update_agent',
        status: 'queued',
        payload: { 
          target_version: latestVersion,
          source: 'mass_update',
        },
      }));

      const jobsWithHash = await prepareJobsForInsert(jobs);
      
      const { error } = await supabase
        .from('jobs')
        .insert(jobsWithHash);

      if (error) throw error;

      toast({
        title: 'Atualização iniciada',
        description: `${onlineOutdated.length} agente(s) serão atualizados para v${latestVersion}`,
      });
      
      onRefresh?.();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao iniciar atualização em massa',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (!latestVersion || agents.length === 0) return null;

  const hasOutdated = outdatedAgents.length > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={hasOutdated ? 'border-warning/50 bg-warning/5' : 'border-success/50 bg-success/5'}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full p-4 h-auto justify-between hover:bg-transparent"
          >
            <div className="flex items-center gap-3">
              {hasOutdated ? (
                <AlertTriangle className="w-5 h-5 text-warning" />
              ) : (
                <CheckCircle className="w-5 h-5 text-success" />
              )}
              <span className="text-lg font-semibold">
                Status de Versões
              </span>
              {hasOutdated ? (
                <Badge variant="outline" className="bg-warning/20 text-warning border-warning">
                  {outdatedAgents.length} desatualizado(s)
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-success/20 text-success border-success">
                  Todos atualizados
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                (última: v{latestVersion})
              </span>
            </div>
            <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Atualizados */}
              <div className="p-4 bg-success/10 rounded-lg border border-success/20">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span className="font-medium text-success">Atualizados ({updatedAgents.length})</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {updatedAgents.slice(0, 8).map(agent => (
                    <Badge key={agent.id} variant="secondary" className="text-xs">
                      {agent.name}
                    </Badge>
                  ))}
                  {updatedAgents.length > 8 && (
                    <Badge variant="outline" className="text-xs">
                      +{updatedAgents.length - 8} mais
                    </Badge>
                  )}
                </div>
              </div>

              {/* Desatualizados */}
              {hasOutdated && (
                <div className="p-4 bg-warning/10 rounded-lg border border-warning/20">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-warning" />
                    <span className="font-medium text-warning">Desatualizados ({outdatedAgents.length})</span>
                  </div>
                  <div className="space-y-1">
                    {outdatedAgents.map(agent => (
                      <div key={agent.id} className="flex items-center justify-between text-sm">
                        <span>{agent.name}</span>
                        <Badge variant="outline" className="text-xs font-mono">
                          {agent.agent_version || 'desconhecida'} → v{latestVersion}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {hasOutdated && (
              <Button 
                onClick={handleMassUpdate} 
                disabled={isUpdating}
                className="w-full"
              >
                <Download className="w-4 h-4 mr-2" />
                {isUpdating ? 'Iniciando atualizações...' : `Atualizar ${outdatedAgents.length} agente(s)`}
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
