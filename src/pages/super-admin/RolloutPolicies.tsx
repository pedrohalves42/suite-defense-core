import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Monitor, 
  Apple, 
  Terminal, 
  Percent, 
  Power, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Save,
  Activity,
  TrendingUp,
  TrendingDown,
  Clock,
  RotateCcw,
  ShieldAlert
} from "lucide-react";
import { format, ptBR } from '@/lib/date-utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

interface RolloutPolicy {
  id: string;
  platform: string;
  target_version: string;
  rollout_percentage: number;
  enabled: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const PLATFORMS = [
  { id: 'windows', label: 'Windows', icon: Monitor },
  { id: 'linux', label: 'Linux', icon: Terminal },
  { id: 'macos', label: 'macOS', icon: Apple },
];

export default function RolloutPolicies() {
  const adaptiveInterval = useAdaptivePolling(300000);
  const queryClient = useQueryClient();
  const [editingPolicy, setEditingPolicy] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<RolloutPolicy>>({});

  // Buscar políticas existentes
  const { data: policies, isLoading } = useQuery({
    queryKey: ['rollout-policies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_update_policies')
        .select('*')
        .order('platform');
      
      if (error) throw error;
      return data as RolloutPolicy[];
    }
  });

  // Buscar releases disponíveis
  const { data: releases } = useQuery({
    queryKey: ['agent-releases-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_releases_public')
        .select('version, platform')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  // Criar/atualizar policy
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<RolloutPolicy> & { platform: string }) => {
      const existing = policies?.find(p => p.platform === data.platform);
      
      if (existing) {
        const { error } = await supabase
          .from('agent_update_policies')
          .update({
            target_version: data.target_version,
            rollout_percentage: data.rollout_percentage,
            enabled: data.enabled,
            notes: data.notes,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('agent_update_policies')
          .insert({
            platform: data.platform,
            target_version: data.target_version || '',
            rollout_percentage: data.rollout_percentage || 0,
            enabled: data.enabled || false,
            notes: data.notes
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rollout-policies'] });
      toast.success('Política de rollout salva');
      setEditingPolicy(null);
      setFormData({});
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    }
  });

  // Toggle enabled
  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('agent_update_policies')
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rollout-policies'] });
      toast.success(variables.enabled ? 'Rollout ativado' : 'Rollout desativado (Kill Switch)');
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    }
  });

  const getPolicyForPlatform = (platform: string) => {
    return policies?.find(p => p.platform === platform);
  };

  const getLatestVersionForPlatform = (platform: string) => {
    return releases?.find(r => r.platform === platform)?.version || 'N/A';
  };

  const startEditing = (platform: string) => {
    const existing = getPolicyForPlatform(platform);
    setEditingPolicy(platform);
    setFormData(existing || { platform, rollout_percentage: 0, enabled: false });
  };

  const handleSave = (platform: string) => {
    saveMutation.mutate({
      ...formData,
      platform
    } as RolloutPolicy);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Políticas de Rollout</h1>
          <p className="text-muted-foreground">
            Controle gradual de deploy de updates para agentes
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Super Admin Only
        </Badge>
      </div>

      {/* Explicação */}
      <Card className="bg-muted/50 border-dashed">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <Percent className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Como funciona o Rollout Gradual</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• <strong>Percentual:</strong> Define quantos % dos agentes receberão o update</li>
                <li>• <strong>Determinístico:</strong> O mesmo agente sempre cai no mesmo bucket (SHA256 do ID)</li>
                <li>• <strong>Kill Switch:</strong> Desligar &quot;enabled&quot; para TODOS pararem de atualizar imediatamente</li>
                <li>• <strong>Gradual:</strong> Aumente de 5% → 25% → 50% → 100% conforme valida</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards por plataforma */}
      <div className="grid gap-6 md:grid-cols-3">
        {PLATFORMS.map((platform) => {
          const policy = getPolicyForPlatform(platform.id);
          const latestVersion = getLatestVersionForPlatform(platform.id);
          const Icon = platform.icon;
          const isEditing = editingPolicy === platform.id;

          return (
            <Card key={platform.id} className={policy?.enabled ? 'border-green-500/50' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    <CardTitle>{platform.label}</CardTitle>
                  </div>
                  {policy && (
                    <Switch
                      checked={policy.enabled}
                      onCheckedChange={(checked) => 
                        toggleMutation.mutate({ id: policy.id, enabled: checked })
                      }
                    />
                  )}
                </div>
                <CardDescription>
                  Última release: <code className="bg-muted px-1 rounded">{latestVersion}</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!policy && !isEditing ? (
                  <div className="text-center py-4">
                    <XCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">Nenhuma política configurada</p>
                    <Button variant="outline" size="sm" onClick={() => startEditing(platform.id)}>
                      Configurar
                    </Button>
                  </div>
                ) : isEditing ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Versão Alvo</Label>
                      <Input
                        value={formData.target_version || ''}
                        onChange={(e) => setFormData({ ...formData, target_version: e.target.value })}
                        placeholder={latestVersion}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Rollout %</Label>
                        <span className="text-2xl font-bold">{formData.rollout_percentage || 0}%</span>
                      </div>
                      <Slider
                        value={[formData.rollout_percentage || 0]}
                        onValueChange={([value]) => setFormData({ ...formData, rollout_percentage: value })}
                        min={0}
                        max={100}
                        step={5}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0%</span>
                        <span>25%</span>
                        <span>50%</span>
                        <span>75%</span>
                        <span>100%</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Notas</Label>
                      <Input
                        value={formData.notes || ''}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Motivo do rollout..."
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label>Ativado</Label>
                      <Switch
                        checked={formData.enabled || false}
                        onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        className="flex-1" 
                        onClick={() => handleSave(platform.id)}
                        disabled={saveMutation.isPending}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Salvar
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setEditingPolicy(null);
                          setFormData({});
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Status */}
                    <div className="flex items-center gap-2">
                      {policy?.enabled ? (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Power className="h-3 w-3 mr-1" />
                          Desativado
                        </Badge>
                      )}
                    </div>

                    {/* Versão alvo */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Versão Alvo</Label>
                      <p className="font-mono">{policy?.target_version || 'N/A'}</p>
                    </div>

                    {/* Percentual */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Rollout</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all"
                            style={{ width: `${policy?.rollout_percentage || 0}%` }}
                          />
                        </div>
                        <span className="text-lg font-bold">{policy?.rollout_percentage || 0}%</span>
                      </div>
                    </div>

                    {/* Notas */}
                    {policy?.notes && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Notas</Label>
                        <p className="text-sm">{policy.notes}</p>
                      </div>
                    )}

                    {/* Última atualização */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Atualizado</Label>
                      <p className="text-sm">
                        {policy?.updated_at 
                          ? format(new Date(policy.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                          : 'N/A'
                        }
                      </p>
                    </div>

                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => startEditing(platform.id)}
                    >
                      Editar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Telemetria de Decisões */}
      <Tabs defaultValue="telemetry" className="space-y-4">
        <TabsList>
          <TabsTrigger value="telemetry">
            <Activity className="h-4 w-4 mr-2" />
            Telemetria de Rollout
          </TabsTrigger>
          <TabsTrigger value="rollbacks">
            <RotateCcw className="h-4 w-4 mr-2" />
            Eventos de Rollback
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="telemetry">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Telemetria de Rollout
              </CardTitle>
              <CardDescription>
                Histórico de decisões de update para cada agente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RolloutTelemetryDashboard />
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="rollbacks">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5" />
                Eventos de Rollback
              </CardTitle>
              <CardDescription>
                Rollbacks automáticos e agentes em Safe Mode
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RollbackEventsDashboard />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Simulador */}
      <Card>
        <CardHeader>
          <CardTitle>Simulador de Rollout</CardTitle>
          <CardDescription>
            Veja quantos agentes seriam afetados com as configurações atuais
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentRolloutSimulator policies={policies || []} />
        </CardContent>
      </Card>
    </div>
  );
}

function AgentRolloutSimulator({ policies }: { policies: RolloutPolicy[] }) {
  const { data: agents } = useQuery({
    queryKey: ['agents-for-rollout'],
    queryFn: async () => {
      // ADR-026: Use RPC — super-admin context, fetch all tenants' agents
      // For rollout simulator, we need all active agents across tenants
      const { data: rawData, error } = await supabase
        .from('agents_safe')
        .select('id, agent_name, os_type, agent_version, status')
        .eq('status', 'active')
        .is('archived_at', null);
      
      if (error) throw error;
      return rawData;
    }
  });

  const calculateBucket = async (agentId: string) => {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(agentId));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return ((hashArray[0] << 8) | hashArray[1]) % 100;
  };

  const [buckets, setBuckets] = useState<Record<string, number>>({});

  // Calcular buckets para todos os agentes
  useState(() => {
    if (agents) {
      Promise.all(
        agents.map(async (agent) => ({
          id: agent.id,
          bucket: await calculateBucket(agent.id)
        }))
      ).then((results) => {
        const bucketsMap: Record<string, number> = {};
        results.forEach((r) => {
          bucketsMap[r.id] = r.bucket;
        });
        setBuckets(bucketsMap);
      });
    }
  });

  const getAgentsInRollout = (platform: string) => {
    const policy = policies.find(p => p.platform === platform && p.enabled);
    if (!policy || !agents) return { inRollout: 0, total: 0 };

    const platformAgents = agents.filter(a => 
      (a.os_type?.toLowerCase() || 'windows') === platform
    );

    const inRollout = platformAgents.filter(a => 
      (buckets[a.id] ?? 100) < policy.rollout_percentage
    );

    return { inRollout: inRollout.length, total: platformAgents.length };
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {PLATFORMS.map((platform) => {
        const { inRollout, total } = getAgentsInRollout(platform.id);
        const policy = policies.find(p => p.platform === platform.id);
        const Icon = platform.icon;

        return (
          <div key={platform.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium">{platform.label}</p>
              <p className="text-sm text-muted-foreground">
                {policy?.enabled ? (
                  <>
                    <span className="text-green-500 font-bold">{inRollout}</span>
                    {' '}de {total} receberão update
                  </>
                ) : (
                  'Rollout desativado'
                )}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Componente de Telemetria de Decisões de Rollout
function RolloutTelemetryDashboard() {
  const [selectedDecision, setSelectedDecision] = useState<string>('all');

  // Buscar decisões de rollout
  const { data: decisions, isLoading } = useQuery({
    queryKey: ['rollout-decisions', selectedDecision],
    queryFn: async () => {
      let query = supabase
        .from('agent_update_decisions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (selectedDecision !== 'all') {
        query = query.eq('decision', selectedDecision);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    refetchInterval: adaptiveInterval,
  });

  // Calcular estatísticas
  const stats = {
    total: decisions?.length || 0,
    allowed: decisions?.filter(d => d.decision === 'allowed').length || 0,
    skipped: decisions?.filter(d => d.decision === 'skipped').length || 0,
    alreadyCurrent: decisions?.filter(d => d.decision === 'already_current').length || 0,
    noPolicy: decisions?.filter(d => d.decision === 'no_policy').length || 0
  };

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case 'allowed':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><TrendingUp className="h-3 w-3 mr-1" />Permitido</Badge>;
      case 'skipped':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><TrendingDown className="h-3 w-3 mr-1" />Bloqueado</Badge>;
      case 'already_current':
        return <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" />Atual</Badge>;
      case 'no_policy':
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Sem Policy</Badge>;
      default:
        return <Badge variant="outline">{decision}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">Total Decisões</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
          <p className="text-sm text-green-600">Permitidos</p>
          <p className="text-2xl font-bold text-green-600">{stats.allowed}</p>
        </div>
        <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
          <p className="text-sm text-yellow-600">Bloqueados (Rollout)</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.skipped}</p>
        </div>
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">Já Atualizados</p>
          <p className="text-2xl font-bold">{stats.alreadyCurrent}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <Tabs value={selectedDecision} onValueChange={setSelectedDecision}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="allowed">Permitidos</TabsTrigger>
          <TabsTrigger value="skipped">Bloqueados</TabsTrigger>
          <TabsTrigger value="already_current">Atualizados</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Decisions Table */}
      {decisions && decisions.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agente</TableHead>
                <TableHead>Plataforma</TableHead>
                <TableHead>Versão Atual</TableHead>
                <TableHead>Versão Alvo</TableHead>
                <TableHead>Bucket</TableHead>
                <TableHead>Rollout %</TableHead>
                <TableHead>Decisão</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {decisions.map((decision) => (
                <TableRow key={decision.id}>
                  <TableCell className="font-mono text-sm">{decision.agent_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{decision.platform}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{decision.current_version || 'N/A'}</TableCell>
                  <TableCell className="font-mono text-sm">{decision.target_version}</TableCell>
                  <TableCell>{decision.bucket}</TableCell>
                  <TableCell>{decision.rollout_percentage}%</TableCell>
                  <TableCell>{getDecisionBadge(decision.decision)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(decision.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhuma decisão de rollout registrada ainda</p>
          <p className="text-sm">As decisões aparecerão quando agentes solicitarem updates</p>
        </div>
      )}
    </div>
  );
}

// Componente de Eventos de Rollback
function RollbackEventsDashboard() {
  const { data: rollbacks, isLoading } = useQuery({
    queryKey: ['rollback-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_rollback_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: adaptiveInterval,
  });

  const safeModeAgents = rollbacks?.filter(r => r.safe_mode_triggered) || [];
  const recentRollbacks = rollbacks?.filter(r => !r.safe_mode_triggered) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Safe Mode Alerts */}
      {safeModeAgents.length > 0 && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            <span className="font-semibold text-red-500">Agentes em Safe Mode</span>
          </div>
          <div className="space-y-2">
            {safeModeAgents.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="font-mono">{r.agent_name}</span>
                <Badge variant="destructive">Safe Mode - {r.rollback_count} rollbacks</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">Total Rollbacks</p>
          <p className="text-2xl font-bold">{rollbacks?.length || 0}</p>
        </div>
        <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
          <p className="text-sm text-red-600">Em Safe Mode</p>
          <p className="text-2xl font-bold text-red-600">{safeModeAgents.length}</p>
        </div>
        <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
          <p className="text-sm text-yellow-600">Rollbacks Recentes</p>
          <p className="text-2xl font-bold text-yellow-600">{recentRollbacks.length}</p>
        </div>
      </div>

      {/* Rollbacks Table */}
      {rollbacks && rollbacks.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agente</TableHead>
                <TableHead>De</TableHead>
                <TableHead>Para</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Count</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rollbacks.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">{r.agent_name}</TableCell>
                  <TableCell className="font-mono text-sm">{r.from_version}</TableCell>
                  <TableCell className="font-mono text-sm">{r.to_version}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.reason}</Badge>
                  </TableCell>
                  <TableCell>{r.rollback_count}</TableCell>
                  <TableCell>
                    {r.safe_mode_triggered ? (
                      <Badge variant="destructive">Safe Mode</Badge>
                    ) : (
                      <Badge variant="secondary">Rollback</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(r.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <RotateCcw className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhum evento de rollback registrado</p>
          <p className="text-sm">Rollbacks aparecerão quando agentes detectarem problemas pós-update</p>
        </div>
      )}
    </div>
  );
}
