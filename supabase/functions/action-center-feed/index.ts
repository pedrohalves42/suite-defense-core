import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  generated_at: string;
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

    // Create client with user token for RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's tenant
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (roleError || !userRole) {
      return new Response(
        JSON.stringify({ error: 'User has no tenant' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = userRole.tenant_id;

    if (req.method === 'GET') {
      // Fetch action center feed using RPC
      const { data, error } = await supabase.rpc('get_action_center_feed', {
        p_tenant_id: tenantId,
      });

      if (error) {
        console.error('[action-center-feed] RPC error:', error);
        
        // Fallback: query directly from playbook_executions
        const { data: executions, error: execError } = await supabase
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
          throw execError;
        }

        // Transform to action items
        const actionItems: ActionItem[] = (executions || []).map((exec: any) => ({
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

        // Get healthy count
        const { count: healthyCount } = await supabase
          .from('agents')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'online')
          .eq('agent_state', 'healthy');

        const feed: ActionCenterFeed = {
          urgent: actionItems
            .filter(i => i.severity === 'critical' || i.severity === 'high' || i.priority_score >= 70)
            .map(enrichActionItem) as any,
          recommended: actionItems
            .filter(i => i.severity !== 'critical' && i.severity !== 'high' && i.priority_score >= 30 && i.priority_score < 70)
            .map(enrichActionItem) as any,
          informational: actionItems
            .filter(i => i.priority_score < 30)
            .map(enrichActionItem) as any,
          healthy_count: healthyCount || 0,
          generated_at: new Date().toISOString(),
        };

        return new Response(
          JSON.stringify(feed),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Enrich with human-readable copy
      const feed = data as ActionCenterFeed;
      const enrichedFeed = {
        ...feed,
        urgent: feed.urgent.map(enrichActionItem),
        recommended: feed.recommended.map(enrichActionItem),
        informational: feed.informational.map(enrichActionItem),
      };

      console.log('[action-center-feed] Feed generated:', {
        urgent: enrichedFeed.urgent.length,
        recommended: enrichedFeed.recommended.length,
        informational: enrichedFeed.informational.length,
        healthy: enrichedFeed.healthy_count,
      });

      return new Response(
        JSON.stringify(enrichedFeed),
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
        
        const { error } = await supabase
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
        const { error } = await supabase
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
