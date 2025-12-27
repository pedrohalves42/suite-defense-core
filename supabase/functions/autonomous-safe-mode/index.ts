import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

interface SafeModeResult {
  success: boolean;
  processed_count: number;
  agents: Array<{
    agent_id: string;
    agent_name: string;
    reason: string;
  }>;
  executed_at: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate internal secret for scheduled calls
    const internalSecret = req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('INTERNAL_SECRET');
    
    // Allow if internal secret matches OR if called via cron (no auth needed for scheduled)
    const isScheduledCall = req.headers.get('x-cron-trigger') === 'true';
    const isInternalCall = internalSecret && internalSecret === expectedSecret;
    
    // For non-scheduled calls, require JWT auth
    if (!isScheduledCall && !isInternalCall) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        console.log('[autonomous-safe-mode] Unauthorized: No auth header');
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[autonomous-safe-mode] Starting autonomous SAFE_MODE check...');

    // 1. Detectar agentes com padrão de falhas
    const { data: agentsWithFailures, error: detectError } = await supabase
      .rpc('detect_critical_failure_pattern', { 
        p_window_minutes: 10, 
        p_min_failures: 3 
      });

    if (detectError) {
      console.error('[autonomous-safe-mode] Error detecting failure patterns:', detectError);
      throw detectError;
    }

    console.log(`[autonomous-safe-mode] Found ${agentsWithFailures?.length || 0} agents with critical failure patterns`);

    // 2. Processar cada agente
    const results: Array<{ agent_id: string; agent_name: string; success: boolean; reason?: string }> = [];
    let processedCount = 0;

    for (const agent of agentsWithFailures || []) {
      // Verificar se heartbeat está ativo (redundante, mas segurança extra)
      if (!agent.heartbeat_active) {
        console.log(`[autonomous-safe-mode] Skipping ${agent.agent_name}: heartbeat not active`);
        continue;
      }

      console.log(`[autonomous-safe-mode] Processing agent ${agent.agent_name}: ${agent.failure_count} failures of type "${agent.failure_type}"`);

      // Chamar função de entrada em SAFE_MODE
      const { data: entryResult, error: entryError } = await supabase
        .rpc('enter_autonomous_safe_mode', {
          p_agent_id: agent.agent_id,
          p_reason: `Detecção automática: ${agent.failure_count} falhas do tipo "${agent.failure_type}" em 10 minutos`,
          p_failure_type: agent.failure_type,
          p_failure_count: agent.failure_count
        });

      if (entryError) {
        console.error(`[autonomous-safe-mode] Error entering SAFE_MODE for ${agent.agent_name}:`, entryError);
        results.push({
          agent_id: agent.agent_id,
          agent_name: agent.agent_name,
          success: false,
          reason: entryError.message
        });
        continue;
      }

      console.log(`[autonomous-safe-mode] Agent ${agent.agent_name} entered SAFE_MODE successfully`);
      results.push({
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
        success: true,
        reason: entryResult?.reason
      });
      processedCount++;

      // Tentar enviar notificação (não crítico se falhar)
      try {
        await supabase.functions.invoke('dispatch-notification', {
          body: {
            tenant_id: agent.tenant_id,
            notification_type: 'safe_mode_auto',
            title: `SAFE_MODE Automático: ${agent.agent_name}`,
            message: `O agente ${agent.agent_name} entrou automaticamente em SAFE_MODE após ${agent.failure_count} falhas do tipo "${agent.failure_type}".`,
            severity: 'high',
            data: {
              agent_id: agent.agent_id,
              agent_name: agent.agent_name,
              failure_type: agent.failure_type,
              failure_count: agent.failure_count
            }
          }
        });
      } catch (notifyError) {
        console.warn(`[autonomous-safe-mode] Failed to send notification for ${agent.agent_name}:`, notifyError);
      }
    }

    const response: SafeModeResult = {
      success: true,
      processed_count: processedCount,
      agents: results.filter(r => r.success).map(r => ({
        agent_id: r.agent_id,
        agent_name: r.agent_name,
        reason: r.reason || ''
      })),
      executed_at: new Date().toISOString()
    };

    console.log(`[autonomous-safe-mode] Completed. Processed ${processedCount} agents.`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[autonomous-safe-mode] Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
