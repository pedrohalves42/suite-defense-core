import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
};

interface ActionItem {
  item_id: string;
  source_type: 'playbook' | 'alert' | 'agent_offline' | 'ai_insight';
  agent_id: string | null;
  agent_name: string | null;
  hostname: string | null;
  title: string;
  description: string | null;
  severity: string;
  risk_score: number | null;
  context: Record<string, unknown>;
  created_at: string;
  trigger_type: string;
  playbook_id: string | null;
  priority_score: number;
}

interface ActionCenterFeed {
  urgent: ActionItem[];
  recommended: ActionItem[];
  informational: ActionItem[];
  healthy_count: number;
  offline_count: number;
  total_agents: number;
  generated_at: string;
  warning?: string;
}

// Human-readable copy map - Expanded for all trigger types
const ACTION_COPY: Record<string, { title: string; description: string; cta: string }> = {
  // === Vulnerability & Software Risk ===
  vulnerability_critical: {
    title: 'Falha crítica que pode permitir invasão',
    description: 'Encontramos uma falha grave com exploit público disponível. Se explorada, um invasor pode assumir o controle.',
    cta: 'Corrigir agora',
  },
  vulnerability_high: {
    title: 'Vulnerabilidade de alto impacto',
    description: 'Vulnerabilidade significativa que pode ser explorada em cenários específicos.',
    cta: 'Avaliar correção',
  },
  software_risk_detected: {
    title: 'Software de alto risco detectado',
    description: 'Este computador possui software classificado como alto risco que pode comprometer a segurança.',
    cta: 'Revisar software',
  },
  software_outdated: {
    title: 'Software desatualizado detectado',
    description: 'Versões antigas de software podem conter vulnerabilidades conhecidas.',
    cta: 'Atualizar software',
  },
  
  // === Agent Status ===
  agent_offline: {
    title: 'Computador offline de forma inesperada',
    description: 'Este computador parou de responder sem desligamento normal registrado.',
    cta: 'Analisar situação',
  },
  agent_offline_suspicious: {
    title: 'Computador offline com comportamento suspeito',
    description: 'Este computador ficou offline após alertas de segurança recentes.',
    cta: 'Investigar agora',
  },
  agent_degraded: {
    title: 'Agente com performance degradada',
    description: 'O agente está respondendo, mas com atrasos ou falhas intermitentes.',
    cta: 'Diagnosticar',
  },
  safe_mode_detected: {
    title: 'Proteções limitadas ativas',
    description: 'Este computador entrou em modo de segurança após falhas e ainda não retornou ao modo normal.',
    cta: 'Reativar proteções',
  },
  
  // === Network & Access ===
  multiple_malicious_access: {
    title: 'Tentativas DNS maliciosas recorrentes',
    description: 'Foram detectadas múltiplas tentativas de acesso a domínios maliciosos.',
    cta: 'Bloquear automaticamente',
  },
  blocked_access_pattern: {
    title: 'Padrão de acesso bloqueado',
    description: 'Múltiplas tentativas de acesso a sites bloqueados foram registradas.',
    cta: 'Revisar política',
  },
  suspicious_network_activity: {
    title: 'Atividade de rede suspeita',
    description: 'Conexões ou transferências de dados incomuns foram detectadas.',
    cta: 'Investigar tráfego',
  },
  
  // === Process & Execution ===
  suspicious_process: {
    title: 'Processo incomum em execução',
    description: 'Um programa que não faz parte do comportamento normal está rodando.',
    cta: 'Encerrar processo',
  },
  unauthorized_execution: {
    title: 'Execução não autorizada',
    description: 'Um programa foi executado sem aprovação prévia.',
    cta: 'Bloquear execução',
  },
  
  // === System Health ===
  high_cpu_usage: {
    title: 'CPU em uso excessivo',
    description: 'O processador está sob carga elevada por período prolongado.',
    cta: 'Identificar causa',
  },
  high_memory_usage: {
    title: 'Memória em uso excessivo',
    description: 'A memória RAM está quase totalmente ocupada.',
    cta: 'Liberar memória',
  },
  high_disk_usage: {
    title: 'Disco quase cheio',
    description: 'O espaço em disco está criticamente baixo.',
    cta: 'Limpar espaço',
  },
  
  // === AI Insight types ===
  vulnerability: {
    title: 'Vulnerabilidade detectada pela IA',
    description: 'Nossa análise automática identificou uma falha de segurança que requer atenção.',
    cta: 'Ver recomendação',
  },
  anomaly: {
    title: 'Comportamento anômalo detectado',
    description: 'Padrão incomum identificado que pode indicar problema de segurança.',
    cta: 'Analisar',
  },
  anomaly_detection: {
    title: 'Anomalia detectada automaticamente',
    description: 'O sistema identificou um desvio significativo do comportamento esperado.',
    cta: 'Investigar anomalia',
  },
  compliance: {
    title: 'Problema de conformidade',
    description: 'Configuração ou comportamento fora dos padrões de segurança esperados.',
    cta: 'Corrigir',
  },
  performance: {
    title: 'Problema de performance detectado',
    description: 'Métricas de sistema indicam degradação que pode afetar operações.',
    cta: 'Otimizar',
  },
  security_posture: {
    title: 'Postura de segurança comprometida',
    description: 'Análise indica configurações ou estados que enfraquecem a segurança.',
    cta: 'Fortalecer',
  },
  threat_intel: {
    title: 'Indicador de ameaça detectado',
    description: 'Inteligência de ameaças identificou potencial risco.',
    cta: 'Investigar',
  },
  root_cause: {
    title: 'Causa raiz identificada',
    description: 'A IA identificou a origem provável de problemas recorrentes.',
    cta: 'Resolver causa',
  },
  optimization: {
    title: 'Oportunidade de otimização',
    description: 'Há espaço para melhorar configurações ou processos.',
    cta: 'Ver sugestões',
  },
  predictive: {
    title: 'Risco futuro previsto',
    description: 'Com base em padrões, um problema pode ocorrer em breve.',
    cta: 'Prevenir',
  },
  
  // === Job & Automation ===
  job_failed: {
    title: 'Tarefa agendada falhou',
    description: 'Uma tarefa automática não foi concluída com sucesso.',
    cta: 'Ver detalhes',
  },
  job_stuck: {
    title: 'Tarefa travada',
    description: 'Uma tarefa está em execução há muito tempo sem progresso.',
    cta: 'Cancelar tarefa',
  },
  playbook_triggered: {
    title: 'Playbook acionado',
    description: 'Uma automação de segurança foi disparada por evento detectado.',
    cta: 'Revisar ação',
  },
  
  // === Antivirus & Protection ===
  antivirus_disabled: {
    title: 'Antivírus desativado',
    description: 'A proteção antivírus foi desabilitada neste computador.',
    cta: 'Reativar proteção',
  },
  antivirus_outdated: {
    title: 'Definições de vírus desatualizadas',
    description: 'As definições de vírus estão antigas e podem não detectar ameaças recentes.',
    cta: 'Atualizar definições',
  },
  malware_detected: {
    title: 'Malware detectado',
    description: 'Software malicioso foi identificado no sistema.',
    cta: 'Remover ameaça',
  },
};

/**
 * Extract agent name from insight title when agent_id is null
 * Matches patterns like: "... no Agente DESKTOP-4V16Q38", "... em SERVIDOR-01"
 */
function extractAgentFromTitle(title: string): string | null {
  if (!title) return null;
  
  const patterns = [
    /no Agente\s+([A-Z0-9\-_]+)/i,       // "no Agente DESKTOP-4V16Q38"
    /Agente\s+([A-Z0-9\-_]+)/i,           // "Agente DESKTOP-4V16Q38"
    /no\s+([A-Z][A-Z0-9\-_]{4,})/i,       // "no DESKTOP-4V16Q38" (min 5 chars, starts with letter)
    /em\s+([A-Z][A-Z0-9\-_]{4,})/i,       // "em SERVIDOR-01"
  ];
  
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

function enrichActionItem(item: ActionItem): ActionItem & { humanized: typeof ACTION_COPY[string] | null } {
  const copy = ACTION_COPY[item.trigger_type] || null;
  return {
    ...item,
    humanized: copy,
  };
}

function calculateOfflineSeverity(lastHeartbeat: string | null, stateChangedAt: string | null): 'urgent' | 'high' | 'medium' | 'info' {
  const referenceTime = stateChangedAt || lastHeartbeat;
  if (!referenceTime) return 'high';
  
  const offlineDuration = Date.now() - new Date(referenceTime).getTime();
  const hoursOffline = offlineDuration / (1000 * 60 * 60);
  
  if (hoursOffline >= 24) return 'urgent';
  if (hoursOffline >= 6) return 'high';
  if (hoursOffline >= 1) return 'medium';
  return 'info';
}

function formatOfflineDuration(lastHeartbeat: string | null, stateChangedAt: string | null): string {
  const referenceTime = stateChangedAt || lastHeartbeat;
  if (!referenceTime) return 'tempo indeterminado';
  
  const offlineDuration = Date.now() - new Date(referenceTime).getTime();
  const hours = Math.floor(offlineDuration / (1000 * 60 * 60));
  const minutes = Math.floor((offlineDuration % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} ${days === 1 ? 'dia' : 'dias'}`;
  }
  if (hours >= 1) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes} min`;
}

function calculatePriorityScore(severity: string): number {
  switch (severity) {
    case 'urgent': return 100;
    case 'high': return 75;
    case 'medium': return 40;
    case 'info': return 15;
    default: return 20;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create service client for admin operations (bypass RLS)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from token
    const { data: { user }, error: userError } = await serviceClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      console.error('[action-center-feed] User auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[action-center-feed] User authenticated:', user.id);

    // Get tenant from header (sent by frontend) or fallback to user's tenant
    const requestedTenantId = req.headers.get('x-tenant-id');
    let tenantId: string | null = null;

    if (requestedTenantId) {
      // Validate that user has access to this tenant
      const { data: hasAccess, error: accessError } = await serviceClient
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .eq('tenant_id', requestedTenantId)
        .maybeSingle();

      if (accessError) {
        console.error('[action-center-feed] Access check error:', accessError);
      }

      if (hasAccess) {
        tenantId = requestedTenantId;
        console.log('[action-center-feed] Using requested tenant:', tenantId);
      } else {
        console.warn('[action-center-feed] User has no access to requested tenant:', requestedTenantId);
      }
    }

    // Fallback: get first tenant for user
    if (!tenantId) {
      const { data: userRole, error: roleError } = await serviceClient
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (roleError) {
        console.error('[action-center-feed] Role query error:', roleError);
      }

      tenantId = userRole?.tenant_id || null;
    }

    // If no tenant, return empty feed with warning
    if (!tenantId) {
      console.warn('[action-center-feed] User has no tenant:', user.id);
      
      const emptyFeed: ActionCenterFeed = {
        urgent: [],
        recommended: [],
        informational: [],
        healthy_count: 0,
        offline_count: 0,
        total_agents: 0,
        generated_at: new Date().toISOString(),
        warning: 'User has no tenant associated. Please contact your administrator.',
      };

      return new Response(
        JSON.stringify(emptyFeed),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[action-center-feed] Tenant resolved:', tenantId);

    // Create client with user context for subsequent operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    if (req.method === 'GET') {
      // Get agent health metrics - use status = 'active' which is the real status in DB
      const { data: agentStats } = await serviceClient
        .from('agents')
        .select('id, agent_state, last_heartbeat, agent_state_changed_at, agent_name, hostname, offline_reason')
        .eq('tenant_id', tenantId)
        .eq('status', 'active');

      const allAgents = agentStats || [];
      const totalAgents = allAgents.length;
      const healthyAgents = allAgents.filter(a => a.agent_state === 'healthy');
      const offlineAgents = allAgents.filter(a => a.agent_state === 'offline');
      
      console.log('[action-center-feed] Agent stats:', {
        total: totalAgents,
        healthy: healthyAgents.length,
        offline: offlineAgents.length,
      });

      // Generate offline agent action items
      const offlineActionItems: ActionItem[] = offlineAgents.map(agent => {
        const severity = calculateOfflineSeverity(agent.last_heartbeat, agent.agent_state_changed_at);
        const duration = formatOfflineDuration(agent.last_heartbeat, agent.agent_state_changed_at);
        
        return {
          item_id: `offline_${agent.id}`,
          source_type: 'agent_offline' as const,
          agent_id: agent.id,
          agent_name: agent.agent_name,
          hostname: agent.hostname,
          title: `${agent.agent_name || agent.hostname || 'Computador'} está offline`,
          description: `Offline há ${duration}. ${agent.offline_reason || 'Sem desligamento normal registrado.'}`,
          severity,
          risk_score: severity === 'urgent' ? 90 : severity === 'high' ? 70 : severity === 'medium' ? 40 : 20,
          context: {
            last_heartbeat: agent.last_heartbeat,
            agent_state_changed_at: agent.agent_state_changed_at,
            offline_reason: agent.offline_reason,
            duration,
          },
          created_at: agent.agent_state_changed_at || agent.last_heartbeat || new Date().toISOString(),
          trigger_type: 'agent_offline',
          playbook_id: null,
          priority_score: calculatePriorityScore(severity),
        };
      });

      // Fetch playbook executions
      let playbookItems: ActionItem[] = [];
      
      const { data: executions, error: execError } = await serviceClient
        .from('playbook_executions')
        .select(`
          id,
          tenant_id,
          agent_id,
          status,
          risk_score,
          trigger_context,
          triggered_at,
          playbook:playbooks(id, name, description, severity, trigger_type),
          agent:agents(agent_name, hostname)
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
        .order('triggered_at', { ascending: false })
        .limit(50);

      if (execError) {
        console.error('[action-center-feed] Playbook query error:', execError);
      } else {
        playbookItems = (executions || []).map((exec: any) => ({
          item_id: exec.id,
          source_type: 'playbook' as const,
          agent_id: exec.agent_id,
          agent_name: exec.agent?.agent_name || null,
          hostname: exec.agent?.hostname || null,
          title: exec.playbook?.name || 'Ação pendente',
          description: exec.playbook?.description || null,
          severity: exec.playbook?.severity || 'medium',
          risk_score: exec.risk_score,
          context: exec.trigger_context || {},
          created_at: exec.triggered_at,
          trigger_type: exec.playbook?.trigger_type || 'unknown',
          playbook_id: exec.playbook?.id || null,
          priority_score: (exec.risk_score || 0) * 2 + 
            (exec.playbook?.severity === 'critical' ? 100 : 
             exec.playbook?.severity === 'high' ? 50 : 
             exec.playbook?.severity === 'medium' ? 20 : 5),
        }));
      }

      // Fetch AI Insights not acknowledged and not auto-executed
      let aiInsightItems: ActionItem[] = [];
      
      const { data: insights, error: insightsError } = await serviceClient
        .from('ai_insights')
        .select(`
          id,
          tenant_id,
          agent_id,
          insight_type,
          severity,
          title,
          description,
          evidence,
          recommendation,
          confidence_score,
          category,
          recommended_actions,
          auto_action_mode,
          auto_action_executed,
          created_at
        `)
        .eq('tenant_id', tenantId)
        .eq('acknowledged', false)
        .eq('auto_action_executed', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (insightsError) {
        console.error('[action-center-feed] AI Insights query error:', insightsError);
      } else {
        // Get agent info for insights
        const agentIds = (insights || []).filter(i => i.agent_id).map(i => i.agent_id);
        let agentMap: Record<string, { agent_name: string; hostname: string }> = {};
        
        if (agentIds.length > 0) {
          const { data: insightAgents } = await serviceClient
            .from('agents')
            .select('id, agent_name, hostname')
            .in('id', agentIds);
          
          agentMap = (insightAgents || []).reduce((acc, a) => {
            acc[a.id] = { agent_name: a.agent_name, hostname: a.hostname };
            return acc;
          }, {} as Record<string, { agent_name: string; hostname: string }>);
        }

        aiInsightItems = (insights || []).map((insight: any) => {
          const agent = insight.agent_id ? agentMap[insight.agent_id] : null;
          const severityScore = insight.severity === 'critical' ? 100 : 
                                insight.severity === 'high' ? 75 : 
                                insight.severity === 'medium' ? 50 : 25;
          
          // Fallback: extract agent name from title if agent_id is null
          let agentName = agent?.agent_name || null;
          let hostname = agent?.hostname || null;
          
          if (!agentName && insight.title) {
            agentName = extractAgentFromTitle(insight.title);
          }
          
          return {
            item_id: insight.id,
            source_type: 'ai_insight' as const,
            agent_id: insight.agent_id,
            agent_name: agentName,
            hostname: hostname,
            title: insight.title,
            description: insight.description,
            severity: insight.severity,
            risk_score: insight.confidence_score,
            context: {
              insight_type: insight.insight_type,
              category: insight.category,
              recommended_actions: insight.recommended_actions,
              evidence: insight.evidence,
              auto_action_mode: insight.auto_action_mode,
              confidence_score: insight.confidence_score,
              recommendation: insight.recommendation,
            },
            created_at: insight.created_at,
            trigger_type: insight.insight_type,
            playbook_id: null,
            priority_score: severityScore + Math.round((insight.confidence_score || 0) * 10),
          };
        });
      }

      // Merge all action items
      const allItems = [...playbookItems, ...offlineActionItems, ...aiInsightItems];

      // Categorize items
      const urgent = allItems
        .filter(i => i.severity === 'critical' || i.severity === 'urgent' || i.severity === 'high' || i.priority_score >= 70)
        .sort((a, b) => b.priority_score - a.priority_score)
        .map(enrichActionItem) as any;

      const recommended = allItems
        .filter(i => 
          i.severity !== 'critical' && 
          i.severity !== 'urgent' && 
          i.severity !== 'high' && 
          i.priority_score >= 30 && 
          i.priority_score < 70
        )
        .sort((a, b) => b.priority_score - a.priority_score)
        .map(enrichActionItem) as any;

      const informational = allItems
        .filter(i => i.priority_score < 30)
        .sort((a, b) => b.priority_score - a.priority_score)
        .map(enrichActionItem) as any;

      const feed: ActionCenterFeed = {
        urgent,
        recommended,
        informational,
        healthy_count: healthyAgents.length,
        offline_count: offlineAgents.length,
        total_agents: totalAgents,
        generated_at: new Date().toISOString(),
      };

      console.log('[action-center-feed] Feed generated:', {
        urgent: feed.urgent.length,
        recommended: feed.recommended.length,
        informational: feed.informational.length,
        healthy: feed.healthy_count,
        offline: feed.offline_count,
        total: feed.total_agents,
      });

      return new Response(
        JSON.stringify(feed),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      // Execute action on an item
      const body = await req.json();
      const { item_id, source_type, action } = body;

      if (!item_id || !action) {
        return new Response(
          JSON.stringify({ error: 'Missing item_id or action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[action-center-feed] Executing action:', { item_id, source_type, action });

      if (source_type === 'playbook' && action === 'execute') {
        // Execute playbook via existing edge function
        const { data, error } = await supabase.functions.invoke('execute-playbook-action', {
          body: { execution_id: item_id },
        });

        if (error) {
          console.error('[action-center-feed] Execute playbook error:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (source_type === 'playbook' && action === 'ignore') {
        const { reason } = body;
        
        const { error } = await serviceClient
          .from('playbook_executions')
          .update({
            status: 'ignored',
            ignore_reason: reason || 'Ignorado via Action Center',
            completed_at: new Date().toISOString(),
          })
          .eq('id', item_id)
          .eq('tenant_id', tenantId);

        if (error) {
          console.error('[action-center-feed] Ignore error:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (source_type === 'alert' && action === 'acknowledge') {
        const { error } = await serviceClient
          .from('system_alerts')
          .update({
            resolved: true,
            resolved_at: new Date().toISOString(),
            resolved_by: user.id,
          })
          .eq('id', item_id)
          .eq('tenant_id', tenantId);

        if (error) {
          console.error('[action-center-feed] Acknowledge alert error:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Handle agent_offline acknowledge action
      if (source_type === 'agent_offline' && action === 'acknowledge') {
        // Extract agent_id from item_id (format: offline_<agent_id>)
        const agentId = item_id.replace('offline_', '');
        
        // We could update the agent state or create an acknowledgment record
        // For now, just return success - the action is informational
        console.log('[action-center-feed] Acknowledged offline agent:', agentId);
        
        return new Response(
          JSON.stringify({ success: true, message: 'Offline status acknowledged' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Handle ai_insight acknowledge action
      if (source_type === 'ai_insight' && action === 'acknowledge') {
        const { error } = await serviceClient
          .from('ai_insights')
          .update({
            acknowledged: true,
            acknowledged_by: user.id,
            acknowledged_at: new Date().toISOString(),
          })
          .eq('id', item_id)
          .eq('tenant_id', tenantId);

        if (error) {
          console.error('[action-center-feed] Acknowledge insight error:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Handle ai_insight ignore action - closes the cycle as ignored
      if (source_type === 'ai_insight' && action === 'ignore') {
        const { reason } = body;
        
        const { error } = await serviceClient
          .from('ai_insights')
          .update({
            status: 'ignored',
            resolved_at: new Date().toISOString(),
            resolved_by: user.id,
            acknowledged: true,
            acknowledged_by: user.id,
            acknowledged_at: new Date().toISOString(),
          })
          .eq('id', item_id)
          .eq('tenant_id', tenantId);

        if (error) {
          console.error('[action-center-feed] Ignore insight error:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`[action-center-feed] Insight ${item_id} ignored by user ${user.id}${reason ? ` - reason: ${reason}` : ''}`);

        return new Response(
          JSON.stringify({ success: true, status: 'ignored' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Handle ai_insight reject action - formal rejection with reason and audit trail
      if (source_type === 'ai_insight' && action === 'reject') {
        const { reason, reason_category } = body;
        
        if (!reason) {
          return new Response(
            JSON.stringify({ error: 'Rejection reason is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const now = new Date().toISOString();

        // Get insight details for audit
        const { data: insight, error: insightError } = await serviceClient
          .from('ai_insights')
          .select('id, title, insight_type, severity, agent_id')
          .eq('id', item_id)
          .eq('tenant_id', tenantId)
          .single();

        if (insightError) {
          console.error('[action-center-feed] Get insight for reject error:', insightError);
          return new Response(
            JSON.stringify({ error: 'Insight not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update insight with rejection
        const { error: updateError } = await serviceClient
          .from('ai_insights')
          .update({
            rejected_at: now,
            rejected_by: user.id,
            rejection_reason: reason,
            acknowledged: true,
            acknowledged_at: now,
            acknowledged_by: user.id,
            status: 'rejected',
          })
          .eq('id', item_id)
          .eq('tenant_id', tenantId);

        if (updateError) {
          console.error('[action-center-feed] Reject insight error:', updateError);
          return new Response(
            JSON.stringify({ error: updateError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create decision event for audit trail
        const { error: eventError } = await serviceClient
          .from('decision_events')
          .insert({
            tenant_id: tenantId,
            rule_code: 'AI_INSIGHT_REJECTION',
            action: 'reject_ai_insight',
            evidence: {
              insight_id: item_id,
              insight_type: insight?.insight_type,
              insight_title: insight?.title,
              severity: insight?.severity,
              rejection_reason: reason,
              rejection_category: reason_category || 'unspecified',
              rejected_at: now,
              rejected_by: user.id,
              user_email: user.email,
              agent_id: insight?.agent_id,
            },
            decision_source: 'human',
            decision_type: 'rejection',
          });

        if (eventError) {
          console.warn('[action-center-feed] Failed to create rejection event:', eventError);
          // Don't fail the request, the insight was already rejected
        }

        console.log(`[action-center-feed] Insight ${item_id} REJECTED by user ${user.id} - reason: ${reason}`);

        return new Response(
          JSON.stringify({ success: true, status: 'rejected' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Handle agent_offline execute action - treat as acknowledge
      if (source_type === 'agent_offline' && action === 'execute') {
        const agentId = item_id.replace('offline_', '');
        console.log('[action-center-feed] Execute on offline agent (treated as acknowledge):', agentId);
        
        return new Response(
          JSON.stringify({ success: true, message: 'Offline status acknowledged' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Handle agent_offline ignore action
      if (source_type === 'agent_offline' && action === 'ignore') {
        const agentId = item_id.replace('offline_', '');
        console.log('[action-center-feed] Ignore offline agent:', agentId);
        
        return new Response(
          JSON.stringify({ success: true, message: 'Offline status ignored' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Handle alert execute action - resolve the alert
      if (source_type === 'alert' && action === 'execute') {
        const { error } = await serviceClient
          .from('system_alerts')
          .update({
            resolved: true,
            resolved_at: new Date().toISOString(),
            resolved_by: user.id,
          })
          .eq('id', item_id)
          .eq('tenant_id', tenantId);

        if (error) {
          console.error('[action-center-feed] Execute alert error:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Handle alert ignore action - resolve with reason
      if (source_type === 'alert' && action === 'ignore') {
        const { error } = await serviceClient
          .from('system_alerts')
          .update({
            resolved: true,
            resolved_at: new Date().toISOString(),
            resolved_by: user.id,
          })
          .eq('id', item_id)
          .eq('tenant_id', tenantId);

        if (error) {
          console.error('[action-center-feed] Ignore alert error:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Handle ai_insight execute action - creates ai_action and calls dispatcher
      if (source_type === 'ai_insight' && action === 'execute') {
        // Get the insight to access recommended_actions
        const { data: insight, error: insightError } = await serviceClient
          .from('ai_insights')
          .select('id, tenant_id, agent_id, recommended_actions, insight_type, severity')
          .eq('id', item_id)
          .eq('tenant_id', tenantId)
          .single();

        if (insightError || !insight) {
          console.error('[action-center-feed] Get insight error:', insightError);
          return new Response(
            JSON.stringify({ error: 'Insight not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const recommendedActions = insight.recommended_actions as Array<{ action_type: string; parameters?: Record<string, unknown> }> | null;
        
        // Handle insights without recommended actions gracefully
        if (!recommendedActions || recommendedActions.length === 0) {
          // Auto-acknowledge insights without actions - this is a valid state
          await serviceClient
            .from('ai_insights')
            .update({
              acknowledged: true,
              acknowledged_by: user.id,
              acknowledged_at: new Date().toISOString(),
              status: 'reviewed_no_action',
              resolution_method: 'no_action_available',
              resolved_at: new Date().toISOString(),
              resolved_by: user.id,
              final_outcome: 'Insight revisado - nenhuma ação automatizada disponível.',
            })
            .eq('id', item_id);

          console.log(`[action-center-feed] Insight ${item_id} acknowledged (no actions) by user ${user.id}`);

          return new Response(
            JSON.stringify({ 
              success: true, 
              message: 'Insight acknowledged - no automated actions available',
              status: 'reviewed_no_action',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create ai_action for the first recommended action
        const firstAction = recommendedActions[0];
        const { data: createdAction, error: createError } = await serviceClient
          .from('ai_actions')
          .insert({
            tenant_id: tenantId,
            insight_id: insight.id,
            agent_id: insight.agent_id,
            action_type: firstAction.action_type,
            parameters: firstAction.parameters || {},
            status: 'pending',
            triggered_by: 'user_manual',
            created_by: user.id,
          })
          .select()
          .single();

        if (createError) {
          console.error('[action-center-feed] Create action error:', createError);
          return new Response(
            JSON.stringify({ error: createError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Call the ai-action-executor to execute
        try {
          const { data: execResult, error: execError } = await supabase.functions.invoke('ai-action-executor', {
            body: { action_id: createdAction.id },
          });

          if (execError) {
            console.error('[action-center-feed] Execute action error:', execError);
            // Action was created but execution failed - still return success with warning
            return new Response(
              JSON.stringify({ 
                success: true, 
                action_id: createdAction.id,
                warning: 'Action created but execution may have failed',
                error: execError.message,
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // CLOSE THE CYCLE: Mark insight as resolved after successful execution
          await serviceClient
            .from('ai_insights')
            .update({ 
              auto_action_executed: true,
              auto_action_executed_at: new Date().toISOString(),
              status: 'resolved',
              resolved_at: new Date().toISOString(),
              resolved_by: user.id,
            })
            .eq('id', item_id);

          console.log(`[action-center-feed] Insight ${item_id} resolved via execute by user ${user.id}`);

          return new Response(
            JSON.stringify({ success: true, action_id: createdAction.id, result: execResult, status: 'resolved' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (execErr) {
          console.error('[action-center-feed] Execute action exception:', execErr);
          return new Response(
            JSON.stringify({ 
              success: true, 
              action_id: createdAction.id,
              warning: 'Action created but execution threw exception',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      return new Response(
        JSON.stringify({ error: 'Unknown action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[action-center-feed] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
