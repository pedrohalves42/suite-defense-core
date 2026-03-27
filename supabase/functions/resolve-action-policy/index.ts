/**
 * Resolve Action Policy - Enterprise Policy Engine
 * 
 * Ponto único de decisão para políticas de ação.
 * Hierarquia determinística:
 * 1. Política específica do tenant (por insight_type)
 * 2. Mapeamento padrão do sistema (code-level)
 * 3. Modo global do tenant (fallback)
 * 
 * Também atualiza last_applied_at quando política é usada.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'
import { validateCallerTenant } from '../_shared/validate-caller-tenant.ts'
import { logger } from '../_shared/logger.ts';

interface PolicyRequest {
  tenant_id: string;
  insight_type: string;
}

interface PolicyResponse {
  source: 'tenant_policy' | 'default_mapping' | 'tenant_fallback';
  execution_mode: 'auto' | 'approval' | 'disabled';
  policy_details?: {
    tenant_policy_id?: string;
    default_mapping_mode?: string;
    tenant_global_mode?: string;
  };
}

// Default mappings for ALL insight_types used in the system
// These must match the insight_type values in ai_insights table
const DEFAULT_MAPPINGS: Record<string, 'auto' | 'approval'> = {
  // === Tipos principais de insight (mais usados) ===
  // Ameaças de segurança: auto para remediação rápida
  security_threat: 'auto',
  
  // Detecção de anomalias: auto para alertar/remediar automaticamente
  anomaly_detection: 'auto',
  anomaly: 'auto', // variant
  
  // Predições: approval (ações preventivas podem ter impacto)
  prediction: 'approval',
  
  // Análise de causa raiz: approval (requer revisão)
  root_cause: 'approval',
  
  // Otimizações: approval (mudanças de configuração)
  optimization: 'approval',
  
  // === Tipos específicos de agente ===
  agent_improdutive: 'auto',
  agent_recovered: 'auto', // apenas notificação
  
  // Violação de integridade: auto (urgente)
  integrity_violation: 'auto',
  
  // Informativos: disabled (sem ação)
  info: 'auto',
  
  // === Tipos legados (mantidos para compatibilidade) ===
  antivirus_disabled: 'auto',
  antivirus_outdated: 'auto',
  dns_malicious_activity: 'auto',
  agent_offline_suspicious: 'auto',
  agent_tampering: 'auto',
  anomaly_stuck_jobs: 'auto',
  job_failed_recurring: 'auto',
  blocked_access_detected: 'auto',
  
  // Requer aprovação (alto impacto)
  vulnerability_critical: 'approval',
  vulnerability_high: 'approval',
  safe_mode_prolonged: 'approval',
  process_anomaly: 'approval',
  data_exfiltration_suspected: 'approval',
  unauthorized_software: 'approval',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID()
  logger.info(`[${requestId}] resolve-action-policy started`)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const body: PolicyRequest = await req.json()
    const { tenant_id, insight_type } = body

    if (!tenant_id || !insight_type) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields', 
          required: ['tenant_id', 'insight_type'] 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // V-1015 FIX: Validate caller has access to requested tenant
    const validation = await validateCallerTenant(req, supabase, tenant_id)
    if (!validation.authorized) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: validation.statusCode || 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info(`[${requestId}] Resolving policy for tenant=${tenant_id}, insight_type=${insight_type}`)

    /**
     * 1️⃣ Buscar política específica do tenant para este insight_type
     */
    const { data: tenantPolicy, error: policyError } = await supabase
      .from('tenant_action_policies')
      .select('id, execution_mode')
      .eq('tenant_id', tenant_id)
      .eq('insight_type', insight_type)
      .maybeSingle()

    if (policyError) {
      logger.error(`[${requestId}] Error fetching tenant policy:`, policyError)
      throw policyError
    }

    if (tenantPolicy?.execution_mode) {
      // Atualizar last_applied_at para auditoria
      await supabase
        .from('tenant_action_policies')
        .update({ last_applied_at: new Date().toISOString() })
        .eq('id', tenantPolicy.id)

      logger.info(`[${requestId}] Using tenant policy: ${tenantPolicy.execution_mode}`)
      
      const response: PolicyResponse = {
        source: 'tenant_policy',
        execution_mode: tenantPolicy.execution_mode as 'auto' | 'approval' | 'disabled',
        policy_details: {
          tenant_policy_id: tenantPolicy.id,
        }
      }
      
      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    /**
     * 2️⃣ Verificar mapeamento padrão do sistema
     */
    const defaultMode = DEFAULT_MAPPINGS[insight_type]
    
    if (defaultMode) {
      logger.info(`[${requestId}] Using default mapping: ${defaultMode}`)
      
      const response: PolicyResponse = {
        source: 'default_mapping',
        execution_mode: defaultMode,
        policy_details: {
          default_mapping_mode: defaultMode,
        }
      }
      
      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    /**
     * 3️⃣ Fallback: modo global do tenant
     */
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('auto_action_mode')
      .eq('id', tenant_id)
      .single()

    if (tenantError) {
      logger.error(`[${requestId}] Error fetching tenant:`, tenantError)
      // Default to approval if tenant not found
      const response: PolicyResponse = {
        source: 'tenant_fallback',
        execution_mode: 'approval',
      }
      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Map tenant auto_action_mode to execution_mode
    let fallbackMode: 'auto' | 'approval' | 'disabled' = 'approval'
    
    if (tenant?.auto_action_mode === 'auto_full') {
      fallbackMode = 'auto'
    } else if (tenant?.auto_action_mode === 'auto_low') {
      fallbackMode = 'approval' // Only low risk auto, others need approval
    } else if (tenant?.auto_action_mode === 'disabled') {
      fallbackMode = 'disabled'
    }
    // 'suggest' and undefined default to 'approval'

    logger.info(`[${requestId}] Using tenant fallback: ${fallbackMode} (from ${tenant?.auto_action_mode})`)
    
    const response: PolicyResponse = {
      source: 'tenant_fallback',
      execution_mode: fallbackMode,
      policy_details: {
        tenant_global_mode: tenant?.auto_action_mode || 'suggest',
      }
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    logger.error(`[${requestId}] Error:`, error)
    return new Response(
      JSON.stringify({ 
        error: 'policy_resolution_failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
