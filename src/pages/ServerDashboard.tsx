import { useState, useEffect, useMemo, useCallback } from "react";
import { Shield, Server, Users, Briefcase, FileText, Download, Activity, TrendingUp, AlertCircle, Network, Zap, Clock, ShieldAlert, Key, Settings, BarChart3, PieChart, LineChart, CheckCircle2, XCircle, Info, Package, Monitor, ArrowRight } from "lucide-react";
import { EvidenceBundleExport } from "@/components/admin/EvidenceBundleExport";
import { IntegrityScoreCard } from "@/components/integrity/IntegrityScoreCard";
import { JobWasteCard } from "@/components/dashboard/JobWasteCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogoutButton } from "@/components/LogoutButton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { OnboardingTour } from "@/components/OnboardingTour";
import { useOnboarding } from "@/hooks/useOnboarding";
import { Progress } from "@/components/ui/progress";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Line, LineChart as RechartsLineChart, Bar, BarChart as RechartsBarChart, Pie, PieChart as RechartsPieChart, Cell, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, Tooltip } from "recharts";
import { logger } from "@/lib/logger";
import { getJobTypeLabel, getJobTypeLabelNoEmoji } from "@/lib/job-labels";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cn } from "@/lib/utils";
import { useTenant } from "@/hooks/useTenant";
import { formatBrazilDateTime } from "@/lib/date-utils";

interface Agent {
  id: string;
  agent_name: string;
  status: string;
  enrolled_at: string;
  last_heartbeat: string | null;
  tenant_id: string;
}

interface Job {
  id: string;
  agent_name: string;
  type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface Report {
  id: string;
  agent_name: string;
  kind: string;
  file_path: string;
  created_at: string;
}

interface AgentToken {
  id: string;
  agent_id: string;
  token_hash: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  agents?: {
    agent_name: string;
  } | null;
}

interface RateLimit {
  id: string;
  identifier: string;
  endpoint: string;
  request_count: number;
  window_start: string;
  last_request_at: string;
  blocked_until: string | null;
}

interface VirusScan {
  id: string;
  agent_name: string;
  file_path: string;
  file_hash: string;
  is_malicious: boolean | null;
  positives: number | null;
  total_scans: number | null;
  scanned_at: string;
}

interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  created_at: string;
  success: boolean;
  user_id: string | null;
}

// Helper: Formatar ações desconhecidas de forma legível
const formatUnknownAction = (action: string, resource: string): string => {
  // Mapear recursos para português
  const resourceMap: Record<string, string> = {
    'agent': 'computador',
    'job': 'verificação',
    'report': 'relatório',
    'user': 'usuário',
    'ai_action': 'sistema automático',
    'enrollment_key': 'chave de registro',
    'invite': 'convite',
    'tenant': 'empresa',
    'policy': 'política',
  };
  
  // Transformar snake_case/camelCase para texto legível
  const actionText = action
    .replace(/^(UPDATE|INSERT|DELETE|SELECT)_/i, '')
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim();
  
  const resourceText = resourceMap[resource] || resource;
  return `Ação em ${resourceText}`;
};

// Helper: Humanizar ações do sistema
const humanizeAction = (action: string, resource: string): { icon: string; text: string } => {
  const map: Record<string, { icon: string; text: string }> = {
    // Computadores
    'agent.enroll': { icon: '✓', text: 'Novo computador registrado' },
    'agent_enrolled': { icon: '✓', text: 'Novo computador conectado' },
    'agent.heartbeat': { icon: '💓', text: 'Computador se comunicou' },
    'cleanup_agent': { icon: '🗑️', text: 'Computador foi removido' },
    
    // Verificações (Jobs)
    'job.create': { icon: '⚙️', text: 'Nova verificação iniciada' },
    'job_created': { icon: '⚙️', text: 'Nova verificação criada' },
    'job.complete': { icon: '✓', text: 'Verificação concluída com sucesso' },
    'job.fail': { icon: '⚠️', text: 'Verificação não foi concluída' },
    'job_creation_denied': { icon: '🚫', text: 'Verificação não autorizada' },
    
    // Sistema inteligente (AI)
    'UPDATE_ai_action': { icon: '🤖', text: 'Sistema aplicou correção automática' },
    'ai_action': { icon: '🤖', text: 'Ação automática executada' },
    'INSERT_ai_action': { icon: '🤖', text: 'Correção automática registrada' },
    
    // Chaves de registro
    'enrollment_key_used': { icon: '🔑', text: 'Computador registrado com chave' },
    'create_enrollment_key': { icon: '🔑', text: 'Nova chave de registro criada' },
    'list_enrollment_key': { icon: '📋', text: 'Chaves de registro consultadas' },
    
    // Usuários
    'create_user': { icon: '👤', text: 'Novo usuário criado' },
    'invite_sent': { icon: '📧', text: 'Convite enviado para novo usuário' },
    
    // Scans e relatórios
    'scan.complete': { icon: '🛡️', text: 'Verificação de vírus realizada' },
    'report.create': { icon: '📄', text: 'Novo relatório gerado' },
    
    // Login
    'login.success': { icon: '🔐', text: 'Login realizado' },
    'login.fail': { icon: '⚠️', text: 'Tentativa de login falhou' },
    
    // Alertas
    'alert.create': { icon: '🚨', text: 'Novo alerta detectado' },
    'alert.resolve': { icon: '✓', text: 'Alerta resolvido' },
  };
  
  return map[action] || { icon: '•', text: formatUnknownAction(action, resource) };
};

const ServerDashboard = () => {
  const navigate = useNavigate();
  const { showOnboarding, completeOnboarding, dismissFor7Days } = useOnboarding();
  const { isAdmin } = useIsAdmin();
  const { isSuperAdmin } = useSuperAdmin();
  const { isOnline } = useOnlineStatus();
  const { tenant, loading: tenantLoading } = useTenant();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [agentTokens, setAgentTokens] = useState<AgentToken[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimit[]>([]);
  const [virusScans, setVirusScans] = useState<VirusScan[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<number>(0);

  // Buscar mapeamento de tenant_id para tenant_name
  const [tenantNames, setTenantNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadTenantNames = async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name');
      
      if (!error && data) {
        const map: Record<string, string> = {};
        data.forEach(t => map[t.id] = t.name);
        setTenantNames(map);
      }
    };
    
    loadTenantNames();
  }, []);

  const loadDashboardData = useCallback(async () => {
    if (!tenant?.id) {
      setLoading(false);
      return;
    }

    try {
      const [agentsRes, jobsRes, reportsRes, tokensRes, rateLimitsRes, scansRes, logsRes] = await Promise.all([
        // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
        supabase.rpc('get_agents_list', { p_tenant_id: tenant.id, p_include_archived: false }),
        supabase.from("jobs").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(100),
        supabase.from("reports").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(100),
        supabase.from("agent_tokens" as any).select("*").order("created_at", { ascending: false }),
        supabase.from("rate_limits").select("*").order("last_request_at", { ascending: false }).limit(100),
        supabase.from("virus_scans").select("*").eq("tenant_id", tenant.id).order("scanned_at", { ascending: false }).limit(100),
        supabase.from("audit_logs").select("id, action, resource_type, created_at, success, user_id").order("created_at", { ascending: false }).limit(50),
      ]);

      if (agentsRes.data) {
        // Map RPC response to expected Agent interface
        const mappedAgents: Agent[] = ((agentsRes.data || []) as any[]).map((agent) => ({
          id: agent.id,
          agent_name: agent.agent_name,
          status: agent.status,
          enrolled_at: agent.enrolled_at,
          last_heartbeat: agent.last_heartbeat,
          tenant_id: agent.tenant_id,
        }));
        setAgents(mappedAgents);
        const inactiveCount = mappedAgents.filter(a => {
          if (!a.last_heartbeat) return true;
          const lastHeartbeat = new Date(a.last_heartbeat);
          return (new Date().getTime() - lastHeartbeat.getTime()) > 5 * 60 * 1000;
        }).length;
        setAlerts(inactiveCount);
      }
      if (jobsRes.data) setJobs(jobsRes.data);
      if (reportsRes.data) setReports(reportsRes.data);
      if (tokensRes.data) setAgentTokens(tokensRes.data as unknown as AgentToken[]);
      if (rateLimitsRes.data) setRateLimits(rateLimitsRes.data);
      if (scansRes.data) setVirusScans(scansRes.data);
      if (logsRes.data) setAuditLogs(logsRes.data);
    } catch (error) {
      logger.error("Erro ao carregar dados", error);
      toast.error("Erro ao carregar dados do dashboard");
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    if (!tenant?.id) return;
    
    loadDashboardData();
    
    // Only poll when online
    const interval = setInterval(() => {
      if (isOnline) {
        loadDashboardData();
      } else {
        logger.info('[ServerDashboard] Pausing polling - offline');
      }
    }, 10000);
    
    // Realtime subscription para agentes do tenant atual
    const agentsChannel = supabase
      .channel(`agents-changes-${tenant.id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'agents',
        filter: `tenant_id=eq.${tenant.id}`
      }, () => {
        loadDashboardData();
      })
      .subscribe();

    // Realtime subscription para jobs do tenant atual
    const jobsChannel = supabase
      .channel(`jobs-changes-${tenant.id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'jobs',
        filter: `tenant_id=eq.${tenant.id}`
      }, () => {
        loadDashboardData();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(agentsChannel);
      supabase.removeChannel(jobsChannel);
    };
  }, [tenant?.id, isOnline, loadDashboardData]);

  // Cálculo robusto de agentes online (FASE 1)
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  
  const activeAgents = agents.filter(a => {
    if (!a.last_heartbeat) return false;
    
    try {
      const lastHeartbeat = new Date(a.last_heartbeat);
      const now = new Date();
      const diffMs = now.getTime() - lastHeartbeat.getTime();
      
      return diffMs >= 0 && diffMs < FIVE_MINUTES_MS;
    } catch (err) {
      console.error(`[ERROR] Failed to parse last_heartbeat for ${a.agent_name}:`, err);
      return false;
    }
  });

  const offlineCount = agents.length - activeAgents.length;
  const pendingJobs = jobs.filter(j => j.status === "queued").length;
  const completedJobs = jobs.filter(j => j.status === "completed").length;
  const failedJobs = jobs.filter(j => j.status === "failed").length;
  const successRate = completedJobs + failedJobs > 0 
    ? ((completedJobs / (completedJobs + failedJobs)) * 100).toFixed(0)
    : '100';
  
  // Agrupar agentes por tenant
  const agentsByTenant = agents.reduce((acc, agent) => {
    acc[agent.tenant_id] = (acc[agent.tenant_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calcular empresas com pendências (offline ou falhas)
  const tenantStats = useMemo(() => {
    const stats: Record<string, { 
      name: string;
      agentCount: number; 
      offlineCount: number; 
      failedJobsCount: number;
    }> = {};
    
    // Contar agentes por tenant
    agents.forEach(agent => {
      if (!stats[agent.tenant_id]) {
        stats[agent.tenant_id] = {
          name: tenantNames[agent.tenant_id] || agent.tenant_id.slice(0, 8) + '...',
          agentCount: 0,
          offlineCount: 0,
          failedJobsCount: 0
        };
      }
      stats[agent.tenant_id].agentCount++;
      
      // Verificar se está offline
      const isOffline = !agent.last_heartbeat || 
        (new Date().getTime() - new Date(agent.last_heartbeat).getTime()) > FIVE_MINUTES_MS;
      if (isOffline) {
        stats[agent.tenant_id].offlineCount++;
      }
    });
    
    // Contar falhas de jobs nas últimas 24h por tenant
    const now = new Date();
    const last24h = 24 * 60 * 60 * 1000;
    jobs.forEach(job => {
      if (job.status === 'failed' && job.created_at) {
        const createdAt = new Date(job.created_at);
        if (now.getTime() - createdAt.getTime() < last24h) {
          const agent = agents.find(a => a.agent_name === job.agent_name);
          if (agent && stats[agent.tenant_id]) {
            stats[agent.tenant_id].failedJobsCount++;
          }
        }
      }
    });
    
    return stats;
  }, [agents, jobs, tenantNames]);

  // Ordenar tenants por gravidade
  const sortedTenantsByGravity = useMemo(() => {
    return Object.entries(tenantStats)
      .map(([tenantId, data]) => ({
        tenantId,
        ...data,
        severity: data.offlineCount > 2 || data.failedJobsCount > 3 ? 'critical' :
                  data.offlineCount > 0 || data.failedJobsCount > 0 ? 'warning' : 'healthy'
      }))
      .sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, healthy: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
  }, [tenantStats]);

  const tenantsWithIssues = sortedTenantsByGravity.filter(t => t.severity !== 'healthy').length;

  // Jobs completados nas ultimas 24h
  const recentJobs = jobs.filter(j => {
    if (!j.completed_at) return false;
    const completed = new Date(j.completed_at);
    return (new Date().getTime() - completed.getTime()) < 24 * 60 * 60 * 1000;
  }).length;

  // Preparar dados para graficos
  const getLast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().split('T')[0]);
    }
    return days;
  };

  const last7Days = getLast7Days();

  // Dados para grafico de tendencia de jobs
  const jobsTrendData = last7Days.map(day => {
    const dayJobs = jobs.filter(j => j.created_at.startsWith(day));
    return {
      date: formatBrazilDateTime(day, 'day-month'),
      total: dayJobs.length,
      completed: dayJobs.filter(j => j.status === 'completed').length,
      failed: dayJobs.filter(j => j.status === 'failed').length,
    };
  });

  // Dados para grafico de scans de virus
  const scansTrendData = last7Days.map(day => {
    const dayScans = virusScans.filter(s => s.scanned_at.startsWith(day));
    return {
      date: formatBrazilDateTime(day, 'day-month'),
      total: dayScans.length,
      malicious: dayScans.filter(s => s.is_malicious).length,
      clean: dayScans.filter(s => s.is_malicious === false).length,
    };
  });

  // Dados para distribuicao por tipo de job (com nomes amigáveis)
  // Agrupa categorias menores como "Outros" para melhor visualização
  const jobTypeDataRaw = Object.entries(
    jobs.reduce((acc, job) => {
      acc[job.type] = (acc[job.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([type, count]) => ({ 
    name: getJobTypeLabelNoEmoji(type), 
    originalType: type,
    value: count 
  })).sort((a, b) => b.value - a.value);

  const MAX_PIE_CATEGORIES = 8;
  const jobTypeData = useMemo(() => {
    if (jobTypeDataRaw.length <= MAX_PIE_CATEGORIES) return jobTypeDataRaw;
    const top = jobTypeDataRaw.slice(0, MAX_PIE_CATEGORIES - 1);
    const othersValue = jobTypeDataRaw.slice(MAX_PIE_CATEGORIES - 1).reduce((sum, d) => sum + d.value, 0);
    const othersCount = jobTypeDataRaw.length - (MAX_PIE_CATEGORIES - 1);
    return [...top, { name: `Outros (${othersCount} tipos)`, originalType: 'others', value: othersValue }];
  }, [jobTypeDataRaw]);

  // Dados para jobs por agente (top 10)
  const jobsByAgentData = Object.entries(
    jobs.reduce((acc, job) => {
      acc[job.agent_name] = (acc[job.agent_name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([agent, count]) => ({ agent, jobs: count }));

  // Humanizar resource_type
  const friendlyResource = (resource: string): string => {
    const map: Record<string, string> = {
      'agent': 'Computador',
      'enrollment_key': 'Chave de Registro',
      'job': 'Verificação',
      'user': 'Usuário',
      'scan': 'Análise de Vírus',
      'report': 'Relatório',
      'alert': 'Alerta',
      'ai_action': 'Ação Automática',
      'login': 'Acesso',
      'tenant': 'Empresa',
      'policy': 'Política',
      'session': 'Sessão',
    };
    return map[resource] || resource;
  };

  // Timeline de eventos de seguranca - humanizada e agrupada
  const rawEvents = auditLogs.slice(0, 30).map(log => {
    const { icon, text } = humanizeAction(log.action, log.resource_type);
    return {
      time: formatBrazilDateTime(log.created_at, 'time'),
      date: formatBrazilDateTime(log.created_at, 'day-month'),
      icon,
      text,
      action: log.action,
      resource: friendlyResource(log.resource_type),
      status: log.success ? 'success' as const : 'failed' as const,
    };
  });

  // Agrupar eventos consecutivos idênticos
  const securityEvents = useMemo(() => {
    const grouped: Array<typeof rawEvents[0] & { count: number }> = [];
    for (const event of rawEvents) {
      const last = grouped[grouped.length - 1];
      if (last && last.text === event.text && last.status === event.status && last.date === event.date) {
        last.count++;
      } else {
        grouped.push({ ...event, count: 1 });
      }
    }
    return grouped.slice(0, 10);
  }, [rawEvents]);

  const COLORS = [
    'hsl(217 91% 60%)',   // blue
    'hsl(142 71% 45%)',   // green
    'hsl(38 92% 50%)',    // amber
    'hsl(262 83% 58%)',   // violet
    'hsl(0 84% 60%)',     // red
    'hsl(189 94% 43%)',   // cyan
    'hsl(330 81% 60%)',   // pink
    'hsl(24 95% 53%)',    // orange
  ];

  // Determinar estado global do sistema
  const systemState = useMemo(() => {
    if (alerts === 0 && failedJobs === 0) return 'healthy';
    if (alerts > 2 || failedJobs > 5) return 'critical';
    return 'warning';
  }, [alerts, failedJobs]);

  const onlinePercentage = agents.length > 0 
    ? ((activeAgents.length / agents.length) * 100).toFixed(0)
    : '0';

  // Show loading while tenant is loading
  if (tenantLoading || !tenant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Server className="h-12 w-12 text-primary animate-pulse" />
          <p className="text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  // Empty state: tenant has no agents yet
  if (!loading && agents.length === 0) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-3xl mx-auto space-y-8 pt-12">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
              <Server className="h-8 w-8 text-primary animate-pulse-glow" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Painel Principal
              </h1>
              <p className="text-sm text-muted-foreground">
                {tenant.name}
              </p>
            </div>
          </div>

          {/* Empty State Card */}
          <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
            <CardContent className="py-16 text-center">
              <div className="inline-flex p-5 rounded-full bg-primary/10 mb-6">
                <Monitor className="h-14 w-14 text-primary" />
              </div>
              
              <h2 className="text-2xl font-bold text-foreground mb-3">
                Nenhum computador cadastrado ainda
              </h2>
              
              <p className="text-muted-foreground max-w-md mx-auto mb-8">
                Para começar a monitorar e proteger seus computadores, instale o agente de proteção nos equipamentos da sua empresa.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button size="lg" onClick={() => navigate('/installer')} className="gap-2">
                  <Download className="h-5 w-5" />
                  Instalar Agente de Proteção
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Setup Steps */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                Como começar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">1</div>
                  <div>
                    <p className="font-medium text-foreground">Instale o agente</p>
                    <p className="text-sm text-muted-foreground">Baixe e execute o instalador nos computadores que deseja proteger</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">2</div>
                  <div>
                    <p className="font-medium text-foreground">Aguarde a conexão</p>
                    <p className="text-sm text-muted-foreground">O agente se conectará automaticamente em poucos minutos</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">3</div>
                  <div>
                    <p className="font-medium text-foreground">Monitore tudo aqui</p>
                    <p className="text-sm text-muted-foreground">Este painel mostrará o status de proteção em tempo real</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
            <Server className="h-8 w-8 text-primary animate-pulse-glow" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Painel Principal
            </h1>
            <p className="text-sm text-muted-foreground">
              {tenant.name} — Visão global do sistema
            </p>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            CAMADA 1 — ESTADO GLOBAL (Executivo)
            Responde: "Está tudo bem?" em 3 segundos
        ═══════════════════════════════════════════════════════════════════ */}
        <Card className={cn(
          "border-2 transition-all",
          systemState === 'healthy' ? "bg-success/5 border-success/30" :
          systemState === 'critical' ? "bg-destructive/5 border-destructive/30" :
          "bg-warning/5 border-warning/30"
        )}>
          <CardContent className="py-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-3">
                  <span className="text-5xl">
                    {systemState === 'healthy' ? '🟢' : 
                     systemState === 'critical' ? '🔴' : '🟡'}
                  </span>
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">
                      {systemState === 'healthy' ? 'Tudo funcionando normalmente' : 
                       systemState === 'critical' ? 'Alguns pontos precisam de atenção' : 
                       'Pequenos ajustes recomendados'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Última atualização: {new Date().toLocaleTimeString('pt-BR')}
                    </p>
                  </div>
                </div>
                
                {/* Detalhes contextuais */}
                <div className="space-y-1 text-sm ml-16">
                  {systemState === 'healthy' ? (
                    <>
                      <p className="text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        {onlinePercentage}% dos computadores estão online
                      </p>
                      <p className="text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        Nenhum incidente crítico ativo
                      </p>
                      <p className="text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        Sistema estável nas últimas 24h
                      </p>
                    </>
                  ) : (
                    <>
                      {offlineCount > 0 && (
                        <p className="text-warning flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          {offlineCount} computador(es) offline precisam de verificação
                        </p>
                      )}
                      {failedJobs > 0 && (
                        <p className="text-warning flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          {failedJobs} verificação(ões) com erro nas últimas 24h
                        </p>
                      )}
                      {tenantsWithIssues > 0 && (
                        <p className="text-warning flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          {tenantsWithIssues} empresa(s) com pendências
                        </p>
                      )}
                      <p className="text-muted-foreground text-xs mt-2 italic">
                        Esses problemas podem impactar operações se persistirem
                      </p>
                    </>
                  )}
                </div>
              </div>
              
              {/* Contador de monitoramento */}
              <div className="text-center md:text-right bg-secondary/30 rounded-xl p-6 border border-border">
                <p className="text-4xl font-bold text-foreground">{agents.length}</p>
                <p className="text-sm text-muted-foreground">
                  computadores monitorados
                </p>
                <p className="text-xs text-primary mt-1">
                  em {Object.keys(agentsByTenant).length} empresa(s)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════
            CAMADA 2 — INDICADORES COM AFIRMAÇÕES (não perguntas)
            Cada card mostra um fato claro e acionável
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Card 1: Computadores Protegidos - AFIRMAÇÃO */}
          <Card className="bg-gradient-card border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4 text-primary" />
                Proteção Ativa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {agents.length} computador{agents.length !== 1 ? 'es' : ''}
              </div>
              <p className="text-xs text-success mt-1">
                ✓ Monitorados em tempo real
              </p>
            </CardContent>
          </Card>

          {/* Card 2: Conectividade - AFIRMAÇÃO */}
          <Card className={cn(
            "bg-gradient-card",
            offlineCount > 0 ? "border-warning/30" : "border-success/20"
          )}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
                <Network className="h-4 w-4" />
                Conexão
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{onlinePercentage}% online</div>
              <p className={cn(
                "text-xs mt-1",
                offlineCount > 0 ? "text-warning" : "text-success"
              )}>
                {offlineCount > 0 
                  ? `${offlineCount} precisa${offlineCount !== 1 ? 'm' : ''} de atenção` 
                  : '✓ Todos conectados'}
              </p>
            </CardContent>
          </Card>

          {/* Card 3: Alertas - AFIRMAÇÃO */}
          <Card className={cn(
            "bg-gradient-card",
            alerts > 0 ? "border-destructive/30" : "border-success/20"
          )}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                Alertas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-2xl font-bold",
                alerts > 0 ? "text-destructive" : "text-success"
              )}>
                {alerts > 0 ? `${alerts} ativo${alerts !== 1 ? 's' : ''}` : 'Nenhum'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {alerts > 0 ? 'Requer verificação' : '✓ Sem ações pendentes'}
              </p>
            </CardContent>
          </Card>

          {/* Card 4: Taxa de Sucesso - AFIRMAÇÃO */}
          <Card className={cn(
            "bg-gradient-card",
            failedJobs > 0 ? "border-warning/30" : "border-success/20"
          )}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                Verificações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{successRate}% sucesso</div>
              <p className={cn(
                "text-xs mt-1",
                failedJobs > 0 ? "text-warning" : "text-success"
              )}>
                {failedJobs > 0 
                  ? `${failedJobs} falha${failedJobs !== 1 ? 's' : ''} nas 24h` 
                  : '✓ Tudo funcionando'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            CAMADA 2.5 — INTEGRIDADE DO SISTEMA (Simplificado)
            Mostra estado geral com mensagem humanizada
        ═══════════════════════════════════════════════════════════════════ */}
        {isAdmin && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <IntegrityScoreCard />
            <JobWasteCard jobs={jobs} agents={agents} />
            {/* Card de credenciais de acesso - só para admin */}
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
                  <Key className="h-4 w-4 text-primary" />
                  Credenciais
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  {agentTokens.filter(t => t.is_active).length || agents.length} ativas
                </div>
                <p className="text-xs text-success mt-1">
                  ✓ Acessos autorizados
                </p>
              </CardContent>
            </Card>

            {/* Card de Rate Limits - só para admin */}
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                  Proteção
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  {rateLimits.filter(r => r.blocked_until && new Date(r.blocked_until) > new Date()).length} bloqueados
                </div>
                <p className="text-xs text-success mt-1">
                  ✓ Rate limiting ativo
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            CAMADA 3 — DISTRIBUIÇÃO POR EMPRESA (Só para super_admin com múltiplos tenants)
            Mostra visão multi-tenant apenas quando relevante
        ═══════════════════════════════════════════════════════════════════ */}
        {isSuperAdmin && Object.keys(agentsByTenant).length > 1 && (
          <Card className="bg-gradient-card border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                Visão Multi-Empresa
              </CardTitle>
              <CardDescription>
                {Object.keys(agentsByTenant).length} empresas • Ordenado por prioridade de atenção
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedTenantsByGravity.map(({ tenantId, name, agentCount, offlineCount, failedJobsCount, severity }) => (
                  <div 
                    key={tenantId} 
                    className={cn(
                      "p-4 rounded-lg border transition-all hover:shadow-md",
                      severity === 'critical' ? "bg-destructive/10 border-destructive/30" :
                      severity === 'warning' ? "bg-warning/10 border-warning/30" :
                      "bg-success/10 border-success/30"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-foreground truncate">{name}</p>
                      <Badge 
                        variant={severity === 'critical' ? 'destructive' : 
                                severity === 'warning' ? 'outline' : 'default'}
                        className={cn(
                          "text-xs",
                          severity === 'healthy' && "bg-success text-success-foreground"
                        )}
                      >
                        {severity === 'critical' ? '🔴 Atenção' :
                         severity === 'warning' ? '🟡 Atenção leve' : '🟢 Ok'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{agentCount} computador{agentCount !== 1 ? 'es' : ''}</p>
                    
                    {/* Detalhes dos problemas */}
                    {(offlineCount > 0 || failedJobsCount > 0) && (
                      <div className="mt-3 pt-3 border-t border-border space-y-1">
                        {offlineCount > 0 && (
                          <p className="text-xs text-warning flex items-center gap-1">
                            <XCircle className="h-3 w-3" />
                            {offlineCount} offline
                          </p>
                        )}
                        {failedJobsCount > 0 && (
                          <p className="text-xs text-orange-500 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {failedJobsCount} erro{failedJobsCount !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    )}
                    
                    {severity === 'healthy' && (
                      <p className="mt-3 text-xs text-success flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Funcionando normalmente
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Graficos e Visualizacoes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Tendência de Verificações */}
          <Card className="bg-gradient-card border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LineChart className="h-5 w-5 text-primary" />
                Tendência de Verificações (7 dias)
              </CardTitle>
              <CardDescription>
                Volume de verificações por dia
                <span className="block text-[10px] text-muted-foreground/70 mt-1">
                  📊 Subindo = demanda aumentando • Estável = sistema saudável • Descendo = menos atividade
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Carregando...</p>
              ) : jobsTrendData.every(d => d.total === 0) ? (
                <div className="text-center py-8">
                  <Activity className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground">Nenhuma verificação nos últimos 7 dias</p>
                  <p className="text-xs text-success mt-2 flex items-center justify-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Isso pode indicar estabilidade operacional
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <RechartsLineChart data={jobsTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 25%)" />
                    <XAxis dataKey="date" stroke="hsl(180 20% 60%)" style={{ fontSize: '12px' }} />
                    <YAxis stroke="hsl(180 20% 60%)" style={{ fontSize: '12px' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(222 47% 11%)', border: '1px solid hsl(215 20% 25%)', borderRadius: '6px' }} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="total" stroke="hsl(195 100% 50%)" strokeWidth={2} name="Total" dot={{ fill: 'hsl(195 100% 50%)' }} />
                    <Line type="monotone" dataKey="completed" stroke="hsl(142 76% 45%)" strokeWidth={2} name="Concluídas" dot={{ fill: 'hsl(142 76% 45%)' }} />
                    <Line type="monotone" dataKey="failed" stroke="hsl(0 70% 55%)" strokeWidth={2} name="Com Erro" dot={{ fill: 'hsl(0 70% 55%)' }} />
                  </RechartsLineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Tendência de Verificações de Vírus */}
          <Card className="bg-gradient-card border-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-accent" />
                Verificações de Vírus (7 dias)
              </CardTitle>
              <CardDescription>
                Arquivos verificados por dia
                <span className="block text-[10px] text-muted-foreground/70 mt-1">
                  🛡️ Vermelho = ameaças detectadas • Verde = arquivos limpos
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Carregando...</p>
              ) : scansTrendData.every(d => d.total === 0) ? (
                <div className="text-center py-8">
                  <Shield className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground">Nenhuma verificação nos últimos 7 dias</p>
                  <p className="text-xs text-muted-foreground/70 mt-2">
                    As verificações aparecerão quando forem executadas
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <RechartsLineChart data={scansTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 25%)" />
                    <XAxis dataKey="date" stroke="hsl(180 20% 60%)" style={{ fontSize: '12px' }} />
                    <YAxis stroke="hsl(180 20% 60%)" style={{ fontSize: '12px' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(222 47% 11%)', border: '1px solid hsl(215 20% 25%)', borderRadius: '6px' }} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="total" stroke="hsl(160 100% 45%)" strokeWidth={2} name="Total" dot={{ fill: 'hsl(160 100% 45%)' }} />
                    <Line type="monotone" dataKey="malicious" stroke="hsl(0 70% 55%)" strokeWidth={2} name="Maliciosos" dot={{ fill: 'hsl(0 70% 55%)' }} />
                    <Line type="monotone" dataKey="clean" stroke="hsl(142 76% 45%)" strokeWidth={2} name="Limpos" dot={{ fill: 'hsl(142 76% 45%)' }} />
                  </RechartsLineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Distribuição por Tipo de Tarefa — Barras horizontais */}
          <Card className="bg-gradient-card border-warning/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5 text-warning" />
                Tipos de Tarefas
              </CardTitle>
              <CardDescription>
                Distribuição por categoria
                {jobTypeDataRaw.length > MAX_PIE_CATEGORIES && (
                  <span className="block text-[10px] text-muted-foreground/70 mt-1">
                    Top {MAX_PIE_CATEGORIES - 1} categorias · {jobTypeDataRaw.length} tipos no total
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Carregando...</p>
              ) : jobTypeData.length === 0 ? (
                <div className="text-center py-8">
                  <PieChart className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground">Sem dados para exibir</p>
                  <p className="text-xs text-muted-foreground/70 mt-2">
                    O gráfico aparecerá quando houver tarefas
                  </p>
                </div>
              ) : (() => {
                const maxVal = Math.max(...jobTypeData.map(d => d.value));
                return (
                  <div className="space-y-2.5">
                    {jobTypeData.map((entry, index) => {
                      const pct = maxVal > 0 ? (entry.value / maxVal) * 100 : 0;
                      const color = COLORS[index % COLORS.length];
                      return (
                        <div key={entry.name} className="group">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground truncate max-w-[65%]" title={entry.name}>
                              {entry.name}
                            </span>
                            <span className="text-xs font-semibold text-foreground tabular-nums">
                              {entry.value}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500 ease-out"
                              style={{ width: `${pct}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Tarefas por Computador */}
          <Card className="bg-gradient-card border-success/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-success" />
                Tarefas por Computador (Top 10)
              </CardTitle>
              <CardDescription>
                Computadores mais ativos
                <span className="block text-[10px] text-muted-foreground/70 mt-1">
                  Concentração alta pode indicar problemas recorrentes
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Carregando...</p>
              ) : jobsByAgentData.length === 0 ? (
                <div className="text-center py-8">
                  <BarChart3 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground">Sem dados para exibir</p>
                  <p className="text-xs text-muted-foreground/70 mt-2">
                    O gráfico aparecerá quando houver tarefas por agente
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <RechartsBarChart data={jobsByAgentData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 25%)" />
                    <XAxis type="number" stroke="hsl(180 20% 60%)" style={{ fontSize: '12px' }} />
                    <YAxis dataKey="agent" type="category" width={100} stroke="hsl(180 20% 60%)" style={{ fontSize: '10px' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(222 47% 11%)', border: '1px solid hsl(215 20% 25%)', borderRadius: '6px' }} />
                    <Bar dataKey="jobs" fill="hsl(142 76% 45%)" radius={[0, 4, 4, 0]} />
                  </RechartsBarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Timeline de Eventos de Segurança - HUMANIZADA */}
        <Card className="bg-gradient-card border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Linha do Tempo de Segurança
            </CardTitle>
            <CardDescription>
              História recente do sistema — o que aconteceu
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-4">Carregando...</p>
            ) : securityEvents.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground">Nenhum evento registrado</p>
                <p className="text-xs text-muted-foreground/70 mt-2">
                  Os eventos aparecerão conforme ações forem realizadas
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {securityEvents.map((event, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-lg",
                        event.status === 'success' ? 'bg-success/20' : 'bg-destructive/20'
                      )}>
                        {event.icon}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {event.text}
                          {event.count > 1 && (
                            <span className="ml-2 text-xs font-normal bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                              ×{event.count}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{event.resource}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={event.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                        {event.status === 'success' ? 'Sucesso' : 'Erro'}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">{event.date} às {event.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs - Detalhes */}
        <Tabs defaultValue="agents" className="w-full">
          <TabsList className="grid w-full grid-cols-5 bg-secondary">
            <TabsTrigger value="agents">Computadores</TabsTrigger>
            <TabsTrigger value="jobs">Verificações</TabsTrigger>
            <TabsTrigger value="reports">Relatórios</TabsTrigger>
            <TabsTrigger value="evidence" className="gap-1">
              <Package className="h-3 w-3" />
              Evidências
            </TabsTrigger>
            <TabsTrigger value="security">Segurança</TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="mt-4">
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle>Computadores Registrados</CardTitle>
                <CardDescription>Lista completa com status em tempo real</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-8">Carregando...</p>
                ) : agents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Nenhum computador registrado</p>
                    <Button onClick={() => navigate("/installer")} variant="outline" className="mt-4">
                      Criar Instalador
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {agents.map((agent) => {
                      const isActive = agent.last_heartbeat && 
                        (new Date().getTime() - new Date(agent.last_heartbeat).getTime()) < 5 * 60 * 1000;
                      
                      const agentJobs = jobs.filter(j => j.agent_name === agent.agent_name);
                      const agentReports = reports.filter(r => r.agent_name === agent.agent_name);
                      const lastJob = agentJobs[0];
                      
                      return (
                        <div
                          key={agent.id}
                          className="p-4 bg-secondary/30 rounded-lg border border-border hover:border-primary/30 transition-all"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4 flex-1">
                              <div className={`w-3 h-3 rounded-full mt-1 ${isActive ? 'bg-success animate-pulse shadow-glow-success' : 'bg-muted'}`} />
                              <div className="flex-1 space-y-2">
                                <div>
                                  <p className="font-mono font-bold text-lg text-foreground">{agent.agent_name}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className="text-xs">
                                      {tenantNames[agent.tenant_id] || agent.tenant_id.slice(0, 8) + '...'}
                                    </Badge>
                                    <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
                                      {isActive ? 'Online' : 'Offline'}
                                    </Badge>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                  <div>
                                    <p className="text-muted-foreground">Verificações</p>
                                    <p className="font-semibold text-foreground">{agentJobs.length}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Relatórios</p>
                                    <p className="font-semibold text-foreground">{agentReports.length}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Registrado em</p>
                                    <p className="font-semibold text-foreground">
                                      {new Date(agent.enrolled_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Último Sinal</p>
                                    <p className="font-semibold text-foreground">
                                      {agent.last_heartbeat 
                                        ? new Date(agent.last_heartbeat).toLocaleTimeString()
                                        : "Nunca"}
                                    </p>
                                  </div>
                                </div>

                                {lastJob && (
                                  <div className="pt-2 border-t border-border">
                                    <p className="text-xs text-muted-foreground mb-1">Última verificação:</p>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-xs">
                                        {getJobTypeLabel(lastJob.type)}
                                      </Badge>
                                      <Badge variant={
                                        lastJob.status === "completed" ? "default" :
                                        lastJob.status === "queued" ? "secondary" :
                                        "destructive"
                                      } className="text-xs">
                                        {lastJob.status === "completed" ? "Concluída" :
                                         lastJob.status === "queued" ? "Aguardando" :
                                         "Com erro"}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">
                                        {formatBrazilDateTime(lastJob.created_at, 'short')}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs" className="mt-4">
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle>Verificações do Sistema</CardTitle>
                <CardDescription>Histórico e status das verificações executadas</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-8">Carregando...</p>
                ) : jobs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhuma verificação encontrada</p>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {jobs.map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {getJobTypeLabel(job.type)}
                            </Badge>
                            <span className="text-sm font-mono text-foreground">{job.agent_name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Iniciado: {formatBrazilDateTime(job.created_at, 'short')}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge 
                            variant={
                              job.status === "completed" ? "default" :
                              job.status === "delivered" ? "secondary" :
                              job.status === "failed" ? "destructive" :
                              "outline"
                            }
                          >
                            {job.status === "completed" ? "Concluída" :
                             job.status === "delivered" ? "Entregue" :
                             job.status === "failed" ? "Com erro" :
                             job.status === "queued" ? "Aguardando" :
                             job.status}
                          </Badge>
                          {job.completed_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Finalizado: {formatBrazilDateTime(job.completed_at, 'short')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle>Relatórios Recebidos</CardTitle>
                <CardDescription>Relatórios de segurança enviados pelos computadores</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-8">Carregando...</p>
                ) : reports.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum relatório encontrado</p>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {reports.map((report) => (
                      <div
                        key={report.id}
                        className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {report.kind}
                            </Badge>
                            <span className="text-sm font-mono text-foreground">{report.agent_name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {report.file_path}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatBrazilDateTime(report.created_at, 'short')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="evidence" className="mt-4">
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Pacote de Evidências
                </CardTitle>
                <CardDescription>
                  Exporte bundles de evidências criptograficamente verificáveis para auditoria
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EvidenceBundleExport />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="mt-4 space-y-4">
            {/* Security Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-gradient-card border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Status dos Computadores
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Ativos</span>
                    <span className="text-lg font-bold text-success">{activeAgents.length}</span>
                  </div>
                  <Progress value={(activeAgents.length / Math.max(agents.length, 1)) * 100} className="h-2" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Inativos: {agents.length - activeAgents.length}</span>
                    <span className="text-primary font-semibold">
                      {((activeAgents.length / Math.max(agents.length, 1)) * 100).toFixed(0)}%
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-card border-warning/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Key className="h-4 w-4 text-warning" />
                    Credenciais de Acesso
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span className="text-lg font-bold text-foreground">{agentTokens.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Ativos</span>
                    <span className="text-success font-semibold">
                      {agentTokens.filter(t => t.is_active).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Expirados</span>
                    <span className="text-destructive font-semibold">
                      {agentTokens.filter(t => t.expires_at && new Date(t.expires_at) < new Date()).length}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-card border-destructive/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                    Rate Limiting
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Endpoints Monitorados</span>
                    <span className="text-lg font-bold text-foreground">
                      {new Set(rateLimits.map(r => r.endpoint)).size}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Bloqueios Ativos</span>
                    <span className="text-destructive font-semibold">
                      {rateLimits.filter(r => r.blocked_until && new Date(r.blocked_until) > new Date()).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Total de Requests</span>
                    <span className="text-muted-foreground font-semibold">
                      {rateLimits.reduce((sum, r) => sum + r.request_count, 0)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Heartbeats Recentes */}
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Últimos Heartbeats
                </CardTitle>
                <CardDescription>Atividade recente dos agentes</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-4">Carregando...</p>
                ) : agents.filter(a => a.last_heartbeat).length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">Nenhum heartbeat registrado</p>
                ) : (
                  <div className="space-y-2">
                    {agents
                      .filter(a => a.last_heartbeat)
                      .sort((a, b) => new Date(b.last_heartbeat!).getTime() - new Date(a.last_heartbeat!).getTime())
                      .slice(0, 10)
                      .map((agent) => {
                        const isActive = agent.last_heartbeat && 
                          (new Date().getTime() - new Date(agent.last_heartbeat).getTime()) < 5 * 60 * 1000;
                        const timeSince = agent.last_heartbeat 
                          ? Math.floor((new Date().getTime() - new Date(agent.last_heartbeat).getTime()) / 1000)
                          : 0;
                        
                        return (
                          <div
                            key={agent.id}
                            className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border hover:border-primary/30 transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-success animate-pulse' : 'bg-muted'}`} />
                              <div>
                                <p className="font-mono font-semibold text-sm text-foreground">{agent.agent_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {tenantNames[agent.tenant_id] || agent.tenant_id.slice(0, 8) + '...'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">
                                {timeSince < 60 ? `${timeSince}s atrás` : 
                                 timeSince < 3600 ? `${Math.floor(timeSince / 60)}m atrás` :
                                 `${Math.floor(timeSince / 3600)}h atrás`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(agent.last_heartbeat!).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tokens Expirados */}
            <Card className="bg-gradient-card border-warning/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-warning" />
                  Tokens Expirados e Inativos
                </CardTitle>
                <CardDescription>Tokens que precisam de atenção</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-4">Carregando...</p>
                ) : (() => {
                  const expiredOrInactive = agentTokens.filter(t => 
                    !t.is_active || (t.expires_at && new Date(t.expires_at) < new Date())
                  );
                  
                  return expiredOrInactive.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-success/50" />
                      <p>Todos os tokens estão ativos e válidos</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {expiredOrInactive.slice(0, 10).map((token) => {
                        const isExpired = token.expires_at && new Date(token.expires_at) < new Date();
                        const agentName = token.agents?.agent_name || 'Desconhecido';
                        
                        return (
                          <div
                            key={token.id}
                            className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border"
                          >
                            <div className="flex-1">
                              <p className="font-mono font-semibold text-sm text-foreground">{agentName}</p>
                              <p className="text-xs text-muted-foreground font-mono mt-1">
                                {token.token_prefix}...****
                              </p>
                            </div>
                            <div className="text-right space-y-1">
                              <Badge variant={isExpired ? "destructive" : "secondary"} className="text-xs">
                                {isExpired ? "Expirado" : "Inativo"}
                              </Badge>
                              {token.expires_at && (
                                <p className="text-xs text-muted-foreground">
                                  {new Date(token.expires_at).toLocaleDateString()}
                                </p>
                              )}
                              {token.last_used_at && (
                                <p className="text-xs text-muted-foreground">
                                  Último uso: {new Date(token.last_used_at).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Estatisticas de Rate Limiting */}
            <Card className="bg-gradient-card border-destructive/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                  Estatísticas de Rate Limiting
                </CardTitle>
                <CardDescription>Proteção contra abuso de recursos</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-4">Carregando...</p>
                ) : rateLimits.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-success/50" />
                    <p>Nenhuma atividade de rate limiting registrada</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Estatisticas por Endpoint */}
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-3">Por Endpoint</h4>
                      <div className="space-y-2">
                        {Object.entries(
                          rateLimits.reduce((acc, r) => {
                            if (!acc[r.endpoint]) {
                              acc[r.endpoint] = { count: 0, blocked: 0 };
                            }
                            acc[r.endpoint].count += r.request_count;
                            if (r.blocked_until && new Date(r.blocked_until) > new Date()) {
                              acc[r.endpoint].blocked++;
                            }
                            return acc;
                          }, {} as Record<string, { count: number; blocked: number }>)
                        ).map(([endpoint, stats]) => (
                          <div
                            key={endpoint}
                            className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border"
                          >
                            <div>
                              <p className="font-mono font-semibold text-sm text-foreground">{endpoint}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {stats.count} requests • {stats.blocked} bloqueados
                              </p>
                            </div>
                            <Badge variant={stats.blocked > 0 ? "destructive" : "default"} className="text-xs">
                              {stats.blocked > 0 ? `${stats.blocked} bloqueios` : "Normal"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bloqueios Ativos */}
                    {(() => {
                      const activeBlocks = rateLimits.filter(r => 
                        r.blocked_until && new Date(r.blocked_until) > new Date()
                      );
                      
                      return activeBlocks.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-foreground mb-3">Bloqueios Ativos</h4>
                          <div className="space-y-2">
                            {activeBlocks.map((limit) => (
                              <div
                                key={limit.id}
                                className="flex items-center justify-between p-3 bg-destructive/10 rounded-lg border border-destructive/30"
                              >
                                <div>
                                  <p className="font-mono font-semibold text-sm text-foreground">{limit.identifier}</p>
                                  <p className="text-xs text-muted-foreground mt-1">{limit.endpoint}</p>
                                </div>
                                <div className="text-right">
                                  <Badge variant="destructive" className="text-xs mb-1">
                                    Bloqueado
                                  </Badge>
                                  <p className="text-xs text-muted-foreground">
                                    Até: {new Date(limit.blocked_until!).toLocaleTimeString()}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ═══════════════════════════════════════════════════════════════════
            FRASE ÂNCORA — Confiança Operacional
        ═══════════════════════════════════════════════════════════════════ */}
        <Card className="bg-muted/20 border-dashed border-muted-foreground/20">
          <CardContent className="py-4 text-center">
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Info className="h-4 w-4" />
              Este painel monitora a saúde global do sistema em tempo real (atualiza a cada 10s).
            </p>
            <p className="text-sm text-primary mt-1">
              Se algo crítico surgir, você será alertado automaticamente.
            </p>
          </CardContent>
        </Card>
      </div>

      <OnboardingTour
        open={showOnboarding}
        onClose={() => {}}
        onComplete={completeOnboarding}
        onDismiss7Days={dismissFor7Days}
        onDismissForever={completeOnboarding}
      />
    </div>
  );
};

export default ServerDashboard;
