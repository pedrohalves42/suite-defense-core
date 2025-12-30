import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
};

interface ActionItem {
  item_id: string;
  source_type: 'playbook' | 'alert' | 'agent_offline';
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

// Human-readable copy map
const ACTION_COPY: Record<string, { title: string; description: string; cta: string }> = {
  vulnerability_critical: {
    title: 'Falha crítica que pode permitir invasão',
    description: 'Encontramos uma falha grave com exploit público disponível. Se explorada, um invasor pode assumir o controle.',
    cta: 'Corrigir agora',
  },
  software_risk_detected: {
    title: 'Software de alto risco detectado',
    description: 'Este computador possui software classificado como alto risco que pode comprometer a segurança.',
    cta: 'Revisar software',
  },
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
  multiple_malicious_access: {
    title: 'Tentativas DNS maliciosas recorrentes',
    description: 'Foram detectadas múltiplas tentativas de acesso a domínios maliciosos.',
    cta: 'Bloquear automaticamente',
  },
  suspicious_process: {
    title: 'Processo incomum em execução',
    description: 'Um programa que não faz parte do comportamento normal está rodando.',
    cta: 'Encerrar processo',
  },
  safe_mode_detected: {
    title: 'Proteções limitadas ativas',
    description: 'Este computador entrou em modo de segurança após falhas e ainda não retornou ao modo normal.',
    cta: 'Reativar proteções',
  },
};

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

      // Merge all action items
      const allItems = [...playbookItems, ...offlineActionItems];

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
