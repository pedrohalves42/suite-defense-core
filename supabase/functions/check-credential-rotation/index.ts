/**
 * check-credential-rotation Edge Function
 * 
 * Verifica tokens de agentes que precisam de rotação
 * e envia alertas para administradores.
 * 
 * Executar diariamente via cron.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface TokenRotationCheck {
  token_id: string;
  agent_id: string;
  agent_name: string;
  tenant_id: string;
  days_since_rotation: number;
  rotation_policy_days: number;
  status: 'warning' | 'expired' | 'ok';
}

import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1117: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[${requestId}] Starting credential rotation check`);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar tokens que precisam de verificação
    const { data: tokens, error: queryError } = await supabase
      .from('agent_tokens')
      .select(`
        id,
        agent_id,
        tenant_id,
        last_rotated_at,
        rotation_policy_days,
        created_at,
        agents!inner (
          agent_name,
          status
        )
      `)
      .eq('is_revoked', false)
      .eq('agents.status', 'active');

    if (queryError) {
      throw new Error(`Failed to query tokens: ${queryError.message}`);
    }

    console.log(`[${requestId}] Found ${tokens?.length || 0} active tokens to check`);

    const rotationChecks: TokenRotationCheck[] = [];
    const alertsToCreate: any[] = [];
    const tokensToFlag: string[] = [];

    for (const token of tokens || []) {
      const policyDays = token.rotation_policy_days || 90;
      const lastRotated = token.last_rotated_at || token.created_at;
      const daysSinceRotation = Math.floor(
        (Date.now() - new Date(lastRotated).getTime()) / (1000 * 60 * 60 * 24)
      );

      let status: TokenRotationCheck['status'] = 'ok';
      
      if (daysSinceRotation > policyDays) {
        status = 'expired';
        tokensToFlag.push(token.id);
      } else if (daysSinceRotation > policyDays - 14) {
        // Aviso 14 dias antes da expiração
        status = 'warning';
      }

      if (status !== 'ok') {
        rotationChecks.push({
          token_id: token.id,
          agent_id: token.agent_id,
          agent_name: (token.agents as any)?.agent_name || 'Unknown',
          tenant_id: token.tenant_id,
          days_since_rotation: daysSinceRotation,
          rotation_policy_days: policyDays,
          status,
        });

        // Criar alerta apenas para tokens expirados
        if (status === 'expired') {
          alertsToCreate.push({
            tenant_id: token.tenant_id,
            agent_id: token.agent_id,
            alert_type: 'token_rotation_required',
            severity: 'medium',
            message: `Token do agente "${(token.agents as any)?.agent_name}" precisa de rotação. ` +
                     `Última rotação há ${daysSinceRotation} dias (política: ${policyDays} dias).`,
            resolved: false,
            metadata: {
              token_id: token.id,
              days_since_rotation: daysSinceRotation,
              rotation_policy_days: policyDays,
              recommendation: 'Rotacionar token do agente para manter conformidade',
            },
          });
        }
      }
    }

    // 2. Marcar tokens que precisam de rotação
    if (tokensToFlag.length > 0) {
      const { error: updateError } = await supabase
        .from('agent_tokens')
        .update({ rotation_required_at: new Date().toISOString() })
        .in('id', tokensToFlag)
        .is('rotation_required_at', null);

      if (updateError) {
        console.warn(`[${requestId}] Error flagging tokens:`, updateError.message);
      } else {
        console.log(`[${requestId}] Flagged ${tokensToFlag.length} tokens for rotation`);
      }
    }

    // 3. Criar alertas (evitar duplicados)
    for (const alert of alertsToCreate) {
      const { data: existingAlert } = await supabase
        .from('system_alerts')
        .select('id')
        .eq('agent_id', alert.agent_id)
        .eq('alert_type', alert.alert_type)
        .eq('resolved', false)
        .maybeSingle();

      if (!existingAlert) {
        const { error: alertError } = await supabase
          .from('system_alerts')
          .insert(alert);

        if (alertError) {
          console.warn(`[${requestId}] Error creating alert:`, alertError.message);
        }
      }
    }

    // 4. Enviar alertas via security-alert-dispatcher para tokens expirados
    const expiredTokens = rotationChecks.filter(t => t.status === 'expired');
    if (expiredTokens.length > 0) {
      // Agrupar por tenant
      const byTenant = expiredTokens.reduce((acc, t) => {
        if (!acc[t.tenant_id]) acc[t.tenant_id] = [];
        acc[t.tenant_id].push(t);
        return acc;
      }, {} as Record<string, TokenRotationCheck[]>);

      for (const [tenantId, tenantTokens] of Object.entries(byTenant)) {
        try {
          await supabase.functions.invoke('security-alert-dispatcher', {
            body: {
              type: 'credential_rotation_required',
              severity: 'medium',
              tenant_id: tenantId,
              count: tenantTokens.length,
              agents: tenantTokens.map(t => t.agent_name).slice(0, 10), // Limitar lista
              message: `${tenantTokens.length} token(s) de agente precisam de rotação.`,
            },
          });
        } catch (dispatchError) {
          console.warn(`[${requestId}] Failed to dispatch alert for tenant ${tenantId}:`, dispatchError);
        }
      }
    }

    const summary = {
      total_checked: tokens?.length || 0,
      tokens_ok: (tokens?.length || 0) - rotationChecks.length,
      tokens_warning: rotationChecks.filter(t => t.status === 'warning').length,
      tokens_expired: expiredTokens.length,
      alerts_created: alertsToCreate.length,
      tokens_flagged: tokensToFlag.length,
    };

    const durationMs = Date.now() - startedAt;

    // Log successful job execution
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'check-credential-rotation',
        p_success: true,
        p_duration_ms: durationMs,
        p_result: summary,
        p_processed_count: tokens?.length || 0,
        p_job_source: 'cron'
      });
    } catch (logErr) {
      console.warn(`[${requestId}] Failed to log job run:`, logErr);
    }

    console.log(`[${requestId}] Credential rotation check completed in ${durationMs}ms:`, summary);

    return new Response(
      JSON.stringify({
        success: true,
        requestId,
        timestamp: new Date().toISOString(),
        summary,
        rotationChecks: rotationChecks.slice(0, 50),
        duration_ms: durationMs,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error(`[${requestId}] Error in credential rotation check:`, error);

    // Log failed job execution
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'check-credential-rotation',
        p_success: false,
        p_duration_ms: durationMs,
        p_error: error instanceof Error ? error.message : 'Unknown error',
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (logErr) {
      console.warn(`[${requestId}] Failed to log error:`, logErr);
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
