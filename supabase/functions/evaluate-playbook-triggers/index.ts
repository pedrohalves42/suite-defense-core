import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { timingSafeEqual } from '../_shared/crypto-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TriggerEvent {
  tenant_id: string;
  trigger_type: 
    | 'agent_offline' 
    | 'dns_blocked' 
    | 'job_failed' 
    | 'integrity_low' 
    | 'manual'
    | 'suspicious_web_activity'
    | 'vulnerability_critical'
    | 'vulnerability_high'
    | 'multiple_malicious_access'
    | 'suspicious_process'
    | 'unauthorized_service';
  agent_id?: string;
  context?: Record<string, unknown>;
}

interface PlaybookAction {
  id: string;
  order_index: number;
  action_type: string;
  label: string;
  description: string;
  action_payload: Record<string, unknown>;
  risk_level: string;
}

interface RiskAnalysis {
  risk_score: number;
  threshold: number;
  should_auto_execute: boolean;
  has_destructive_actions: boolean;
  require_approval: boolean;
  is_enabled: boolean;
  decision_reason: string;
}

interface TenantSettings {
  enable_dry_run_mode: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ✅ P0 RED TEAM FIX: Validar origem da requisição
    const internalSecret = req.headers.get('X-Internal-Secret');
    const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const authHeader = req.headers.get('Authorization');
    
    // Verificar se é chamada interna (cron) via secret
    const isInternalCall = internalSecret && expectedSecret && await timingSafeEqual(internalSecret, expectedSecret);
    
    // Se não é interno, exigir autenticação JWT
    if (!isInternalCall) {
      if (!authHeader) {
        console.error('[SECURITY] evaluate-playbook-triggers called without auth or internal secret');
        return new Response(JSON.stringify({ 
          error: 'Unauthorized: Authentication required' 
        }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    }

    const body: TriggerEvent = await req.json();
    const { tenant_id, trigger_type, agent_id, context = {} } = body;

    if (!tenant_id || !trigger_type) {
      return new Response(JSON.stringify({ 
        error: 'tenant_id and trigger_type are required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ✅ P0 RED TEAM FIX: Se não é interno, validar que tenant_id pertence ao usuário
    if (!isInternalCall && authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        console.error('[SECURITY] Invalid JWT token in evaluate-playbook-triggers');
        return new Response(JSON.stringify({ 
          error: 'Invalid token' 
        }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      
      // Verificar se o usuário tem acesso ao tenant
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('tenant_id, role')
        .eq('user_id', user.id)
        .eq('tenant_id', tenant_id)
        .maybeSingle();
        
      if (!userRole) {
        console.error(`[SECURITY] User ${user.id} attempted to trigger playbook for unauthorized tenant ${tenant_id}`);
        return new Response(JSON.stringify({ 
          error: 'Access denied: You do not have access to this tenant' 
        }), { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      
      // Apenas admins podem disparar playbooks manualmente
      if (!['admin', 'super_admin'].includes(userRole.role)) {
        console.error(`[SECURITY] User ${user.id} with role ${userRole.role} attempted to trigger playbook`);
        return new Response(JSON.stringify({ 
          error: 'Forbidden: Only admins can trigger playbooks' 
        }), { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    }

    console.log(`[evaluate-playbook-triggers] Evaluating ${trigger_type} for tenant ${tenant_id} (internal: ${isInternalCall})`);

    // ✅ PHASE 3: Verificar se Shadow Mode (dry-run) está ativado para o tenant
    const { data: tenantSettings } = await supabase
      .from('tenant_settings')
      .select('enable_dry_run_mode')
      .eq('tenant_id', tenant_id)
      .single();
    
    const isDryRun = (tenantSettings as TenantSettings)?.enable_dry_run_mode ?? false;
    
    if (isDryRun) {
      console.log(`[evaluate-playbook-triggers] Shadow Mode ACTIVE for tenant ${tenant_id} - no auto-execution will occur`);
    }

    // Buscar playbooks ativos que match o trigger
    const { data: playbooks, error: pbError } = await supabase
      .from('playbooks')
      .select(`
        *,
        actions:playbook_actions(*)
      `)
      .eq('trigger_type', trigger_type)
      .eq('is_enabled', true)
      .or(`tenant_id.eq.${tenant_id},is_system.eq.true`)
      .order('is_system', { ascending: true }); // Tenant-specific primeiro

    if (pbError) {
      console.error('[evaluate-playbook-triggers] Error fetching playbooks:', pbError);
      throw pbError;
    }

    if (!playbooks || playbooks.length === 0) {
      console.log(`[evaluate-playbook-triggers] No active playbooks for ${trigger_type}`);
      return new Response(JSON.stringify({ 
        triggered: false,
        reason: 'No active playbooks for this trigger type',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Usar o primeiro playbook (tenant-specific tem prioridade)
    const playbook = playbooks[0];
    const cooldownMinutes = playbook.cooldown_minutes || 60;

    // ✅ ANTI-LOOP: Usar função robusta do banco
    const { data: hasRecentExec } = await supabase.rpc('has_recent_playbook_execution', {
      p_playbook_id: playbook.id,
      p_tenant_id: tenant_id,
      p_agent_id: agent_id || null,
      p_cooldown_minutes: cooldownMinutes
    });

    if (hasRecentExec) {
      console.log(`[evaluate-playbook-triggers] Cooldown active for playbook ${playbook.id} (${cooldownMinutes}min)`);
      return new Response(JSON.stringify({
        triggered: false,
        reason: 'Cooldown active - recent execution exists',
        cooldown_minutes: cooldownMinutes,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Avaliar condições do trigger
    const conditions = playbook.trigger_conditions || {};
    const conditionsMet = evaluateConditions(trigger_type, conditions, context);

    if (!conditionsMet) {
      console.log(`[evaluate-playbook-triggers] Conditions not met for playbook ${playbook.id}`);
      return new Response(JSON.stringify({
        triggered: false,
        reason: 'Trigger conditions not met',
        conditions,
        context,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ✅ FASE 2: Motor de Risco - Calcular risk score via RPC
    const { data: riskData, error: riskError } = await supabase.rpc('should_auto_execute_playbook', {
      p_playbook_id: playbook.id,
      p_event_type: trigger_type,
      p_context: context
    });

    const riskAnalysis: RiskAnalysis = riskError ? {
      risk_score: 0.5,
      threshold: 0.8,
      should_auto_execute: false,
      has_destructive_actions: false,
      require_approval: playbook.require_approval,
      is_enabled: playbook.is_enabled,
      decision_reason: 'risk_calculation_failed'
    } : riskData as RiskAnalysis;

    console.log(`[evaluate-playbook-triggers] Risk analysis: score=${riskAnalysis.risk_score}, auto_execute=${riskAnalysis.should_auto_execute}, reason=${riskAnalysis.decision_reason}`);

    // Buscar informações do agente se fornecido
    let agentInfo = null;
    if (agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('agent_name, hostname, os_type, status, last_heartbeat')
        .eq('id', agent_id)
        .single();
      agentInfo = agent;
    }

    // ✅ ENTERPRISE: Criar snapshot imutável do playbook
    const playbookSnapshot = {
      id: playbook.id,
      name: playbook.name,
      description: playbook.description,
      severity: playbook.severity,
      trigger_type: playbook.trigger_type,
      trigger_conditions: playbook.trigger_conditions,
      version: playbook.version,
      require_approval: playbook.require_approval,
      cooldown_minutes: cooldownMinutes,
      execution_mode: playbook.execution_mode || 'assistive', // ✅ AJUSTE 4: Incluir execution_mode no snapshot
      snapshot_created_at: new Date().toISOString(),
    };

    // ✅ ENTERPRISE: Criar snapshot imutável das ações
    const actionsSnapshot = (playbook.actions as PlaybookAction[] || [])
      .sort((a, b) => a.order_index - b.order_index)
      .map((action) => ({
        id: action.id,
        order_index: action.order_index,
        action_type: action.action_type,
        label: action.label,
        description: action.description,
        action_payload: action.action_payload,
        risk_level: action.risk_level,
      }));

    // ✅ HUMAN-IN-THE-LOOP: Force human review for critical/high severity
    const playbookSeverity = playbook.severity || 'medium';
    const { data: needsHumanReview } = await supabase.rpc('requires_human_review', {
      p_tenant_id: tenant_id,
      p_severity: playbookSeverity,
      p_action_type: trigger_type,
    });

    // ✅ PHASE 3: Em Shadow Mode, NUNCA auto-executar
    const wouldAutoExecute = riskAnalysis.should_auto_execute;
    // CRITICAL: If human review required, NEVER auto-execute regardless of risk engine
    const shouldAutoExecute = isDryRun ? false : (needsHumanReview ? false : wouldAutoExecute);
    
    // Determinar decisão para logging
    let decision: 'auto_execute' | 'require_approval' | 'dry_run' = 'require_approval';
    if (isDryRun) {
      decision = 'dry_run';
    } else if (shouldAutoExecute) {
      decision = 'auto_execute';
    }
    
    const triggeredBy = shouldAutoExecute ? 'risk_engine' : (isDryRun ? 'dry_run' : 'trigger');

    // Criar execução pendente COM SNAPSHOTS e dados de risco
    const { data: execution, error: execError } = await supabase
      .from('playbook_executions')
      .insert({
        playbook_id: playbook.id,
        tenant_id,
        agent_id: agent_id || null,
        trigger_source: trigger_type,
        trigger_context: {
          ...context,
          agent_info: agentInfo,
          evaluated_at: new Date().toISOString(),
          risk_analysis: riskAnalysis,
          dry_run: isDryRun, // ✅ Incluir flag de dry_run no contexto
        },
        // ✅ IMUTÁVEL: Snapshots congelados no momento do trigger
        playbook_snapshot: playbookSnapshot,
        actions_snapshot: actionsSnapshot,
        status: shouldAutoExecute ? 'in_progress' : 'pending',
        // ✅ FASE 2 + 3: Novos campos de rastreio
        auto_executed: shouldAutoExecute,
        risk_score: riskAnalysis.risk_score,
        triggered_by: triggeredBy,
        dry_run: isDryRun, // ✅ PHASE 3: Marcar como dry_run
      })
      .select('id')
      .single();

    if (execError) {
      console.error('[evaluate-playbook-triggers] Error creating execution:', execError);
      throw execError;
    }

    console.log(`[evaluate-playbook-triggers] Created execution ${execution.id} with immutable snapshots (v${playbook.version}), auto_executed=${shouldAutoExecute}, risk_score=${riskAnalysis.risk_score}, dry_run=${isDryRun}`);

    // ✅ PHASE 3: Log decisão no risk_decision_log
    const { error: logError } = await supabase
      .from('risk_decision_log')
      .insert({
        playbook_execution_id: execution.id,
        tenant_id,
        event_type: trigger_type,
        playbook_id: playbook.id,
        playbook_name: playbook.name,
        agent_id: agent_id || null,
        risk_score: riskAnalysis.risk_score,
        threshold: riskAnalysis.threshold,
        decision,
        decision_reason: isDryRun 
          ? `Shadow Mode ativo - seria ${wouldAutoExecute ? 'auto_execute' : 'require_approval'} (${riskAnalysis.decision_reason})`
          : riskAnalysis.decision_reason,
        context: {
          ...context,
          agent_info: agentInfo,
          has_destructive_actions: riskAnalysis.has_destructive_actions,
          playbook_require_approval: playbook.require_approval,
        },
        dry_run: isDryRun,
      });

    if (logError) {
      console.error('[evaluate-playbook-triggers] Error logging risk decision:', logError);
      // Não falhar a operação por causa do log
    }

    // ✅ SEMI_AUTOMATIC MODE: Criar approval_request com 24h timeout e 1 approver
    const executionMode = playbook.execution_mode || 'assistive';
    
    if (executionMode === 'semi_automatic') {
      console.log(`[evaluate-playbook-triggers] SEMI_AUTOMATIC: Creating approval request for ${playbook.name}`);
      
      // ✅ P1 RED TEAM FIX: Rate limit global de approvals pendentes por tenant
      const MAX_PENDING_APPROVALS_PER_TENANT = 10;
      
      const { count: pendingCount, error: countError } = await supabase
        .from('approval_requests')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant_id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());
      
      if (!countError && (pendingCount || 0) >= MAX_PENDING_APPROVALS_PER_TENANT) {
        console.warn(`[SECURITY] Tenant ${tenant_id} exceeded pending approval limit (${pendingCount}/${MAX_PENDING_APPROVALS_PER_TENANT})`);
        
        // Registrar tentativa bloqueada no audit log
        await supabase.from('audit_logs').insert({
          tenant_id,
          action: 'approval_rate_limit_exceeded',
          resource_type: 'approval_request',
          resource_id: execution.id,
          success: false,
          details: {
            pending_count: pendingCount,
            max_allowed: MAX_PENDING_APPROVALS_PER_TENANT,
            trigger_type,
            playbook_id: playbook.id,
            playbook_name: playbook.name,
            blocked: true,
          },
        });
        
        return new Response(JSON.stringify({
          error: 'Too many pending approval requests',
          message: `Maximum ${MAX_PENDING_APPROVALS_PER_TENANT} pending approvals allowed. Please approve or wait for existing requests to expire.`,
          pending_count: pendingCount,
          max_allowed: MAX_PENDING_APPROVALS_PER_TENANT,
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24h timeout
      
      // ✅ ONE-CLICK APPROVAL: Gerar token seguro para aprovação via link direto
      const approvalToken = `${crypto.randomUUID()}-${Date.now().toString(36)}`;
      const tokenExpiresAt = new Date();
      tokenExpiresAt.setHours(tokenExpiresAt.getHours() + 24); // Token também expira em 24h
      
      // ✅ P1 RED TEAM FIX: NÃO logar o token de aprovação (reduz entropia se logs vazarem)
      console.log(`[evaluate-playbook-triggers] Generated secure approval token for execution ${execution.id}`);
      
      const { data: approvalRequest, error: approvalError } = await supabase
        .from('approval_requests')
        .insert({
          tenant_id,
          playbook_execution_id: execution.id,
          action_type: 'execute_playbook',
          action_payload: {
            playbook_id: playbook.id,
            playbook_name: playbook.name,
            playbook_version: playbook.version,
            execution_id: execution.id,
            actions: actionsSnapshot.map(a => ({
              action_type: a.action_type,
              label: a.label,
              risk_level: a.risk_level,
            })),
            trigger_type,
            agent_id,
            agent_info: agentInfo,
          },
          requested_by: null, // Sistema
          status: 'pending',
          required_approvers: 1, // ✅ APENAS 1 CLIQUE para semi_automatic
          expires_at: expiresAt.toISOString(),
          // ✅ ONE-CLICK APPROVAL: Token para aprovação via link
          approval_token: approvalToken,
          approval_token_expires_at: tokenExpiresAt.toISOString(),
        })
        .select('id, approval_token')
        .single();
      
      if (approvalError) {
        console.error('[evaluate-playbook-triggers] Error creating approval request:', approvalError);
      } else {
        console.log(`[evaluate-playbook-triggers] Created approval request ${approvalRequest?.id} with 24h timeout`);
        
        // Create system alert to notify admins
        await supabase.from('system_alerts').insert({
          tenant_id,
          agent_id: agent_id || null,
          alert_type: 'playbook_approval_required',
          severity: playbook.severity === 'critical' ? 'critical' : 'warning',
          message: `Playbook "${playbook.name}" requer aprovação. Expira em 24h.`,
          metadata: {
            playbook_id: playbook.id,
            playbook_name: playbook.name,
            execution_id: execution.id,
            approval_request_id: approvalRequest?.id,
            expires_at: expiresAt.toISOString(),
            // ✅ ONE-CLICK: Incluir token no metadata (para debug, não expor)
            has_approval_token: !!approvalRequest?.approval_token,
          },
        });

        // Send email notification for semi_automatic playbook approval
        try {
          const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
          const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
          
          // ✅ ONE-CLICK APPROVAL: Construir URL de aprovação direta
          const APP_URL = Deno.env.get('APP_URL') || 'https://cybershield.com.br';
          const approvalUrl = `${SUPABASE_URL}/functions/v1/approve-via-token?token=${approvalRequest?.approval_token}`;
          
          await fetch(`${SUPABASE_URL}/functions/v1/notification-dispatcher`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Secret': INTERNAL_SECRET || '',
            },
            body: JSON.stringify({
              channel: 'all',
              alertType: 'playbook_approval_required',
              severity: playbook.severity === 'critical' ? 'critical' : 'warning',
              title: `🚨 Aprovação necessária: ${playbook.name}`,
              message: `O playbook "${playbook.name}" foi disparado automaticamente e requer aprovação humana para executar ações destrutivas. Esta solicitação expira em 24 horas.`,
              details: {
                playbook_id: playbook.id,
                playbook_name: playbook.name,
                playbook_version: playbook.version,
                execution_id: execution.id,
                approval_request_id: approvalRequest?.id,
                trigger_type,
                agent_id,
                agent_info: agentInfo,
                expires_at: expiresAt.toISOString(),
                actions: actionsSnapshot.map(a => ({
                  type: a.action_type,
                  label: a.label,
                  risk: a.risk_level,
                })),
                // ✅ ONE-CLICK APPROVAL: Incluir URL de aprovação direta
                approval_url: approvalUrl,
                approval_token: approvalRequest?.approval_token,
              },
              tenantId: tenant_id,
            }),
          });
          
          console.log(`[evaluate-playbook-triggers] Email notification sent with one-click approval link for request ${approvalRequest?.id}`);
        } catch (notifyError) {
          console.error('[evaluate-playbook-triggers] Failed to send email notification:', notifyError);
          // Don't fail the operation if notification fails
        }
      }
    }
    // Se deve auto-executar (baseado no motor de risco E NÃO estiver em dry_run), executar automaticamente
    else if (shouldAutoExecute) {
      console.log(`[evaluate-playbook-triggers] Risk-based auto-execution: ${playbook.name} (score: ${riskAnalysis.risk_score}, threshold: ${riskAnalysis.threshold})`);
      
      try {
        const executeUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/execute-playbook-action`;
        await fetch(executeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ execution_id: execution.id }),
        });
      } catch (autoExecError) {
        console.error('[evaluate-playbook-triggers] Auto-execute error:', autoExecError);
      }
    } else if (isDryRun && wouldAutoExecute) {
      console.log(`[evaluate-playbook-triggers] DRY RUN: Would have auto-executed ${playbook.name} (score: ${riskAnalysis.risk_score}, threshold: ${riskAnalysis.threshold})`);
    }

    // Log de segurança com informações de risco
    await supabase.from('security_logs').insert({
      tenant_id,
      ip_address: 'system',
      endpoint: 'playbook/trigger',
      attack_type: 'playbook_triggered',
      severity: playbook.severity === 'critical' ? 'critical' : 'medium',
      blocked: false,
      details: {
        playbook_id: playbook.id,
        playbook_name: playbook.name,
        playbook_version: playbook.version,
        execution_id: execution.id,
        trigger_type,
        agent_id,
        require_approval: playbook.require_approval,
        snapshots_created: true,
        // ✅ FASE 2 + 3: Adicionar dados de risco ao log
        risk_analysis: {
          risk_score: riskAnalysis.risk_score,
          threshold: riskAnalysis.threshold,
          decision_reason: riskAnalysis.decision_reason,
          has_destructive_actions: riskAnalysis.has_destructive_actions,
        },
        auto_executed: shouldAutoExecute,
        triggered_by: triggeredBy,
        dry_run: isDryRun, // ✅ PHASE 3
        would_auto_execute: wouldAutoExecute, // ✅ PHASE 3: O que teria acontecido
      },
    });

    return new Response(JSON.stringify({
      triggered: true,
      execution_id: execution.id,
      playbook: {
        id: playbook.id,
        name: playbook.name,
        version: playbook.version,
        severity: playbook.severity,
        require_approval: playbook.require_approval,
        actions_count: actionsSnapshot.length,
      },
      agent_info: agentInfo,
      snapshots_created: true,
      // ✅ FASE 2 + 3: Incluir dados de risco na resposta
      risk_analysis: riskAnalysis,
      auto_executed: shouldAutoExecute,
      triggered_by: triggeredBy,
      // ✅ PHASE 3: Informações de Shadow Mode
      dry_run: isDryRun,
      would_auto_execute: wouldAutoExecute,
      execution_time_ms: Date.now() - startTime,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[evaluate-playbook-triggers] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function evaluateConditions(
  triggerType: string,
  conditions: Record<string, unknown>,
  context: Record<string, unknown>
): boolean {
  switch (triggerType) {
    case 'agent_offline': {
      const hoursThreshold = (conditions.hours_threshold as number) || 24;
      const hoursOffline = (context.hours_offline as number) || 0;
      return hoursOffline >= hoursThreshold;
    }

    case 'dns_blocked': {
      const minBlocked = (conditions.min_blocked_requests as number) || 10;
      const blockedCount = (context.blocked_requests as number) || 0;
      return blockedCount >= minBlocked;
    }

    case 'job_failed': {
      const minFailures = (conditions.min_failures as number) || 3;
      const failureCount = (context.failure_count as number) || 0;
      const criticalTypes = (conditions.critical_job_types as string[]) || [];
      const jobType = context.job_type as string;
      
      if (criticalTypes.length > 0 && jobType) {
        return failureCount >= minFailures && criticalTypes.includes(jobType);
      }
      return failureCount >= minFailures;
    }

    case 'integrity_low': {
      const threshold = (conditions.integrity_threshold as number) || 80;
      const currentScore = (context.integrity_score as number) || 100;
      return currentScore < threshold;
    }

    case 'suspicious_web_activity': {
      const minRiskScore = (conditions.min_risk_score as number) || 70;
      const riskScore = (context.risk_score as number) || 0;
      const categories = (conditions.categories as string[]) || [];
      const domain_category = (context.domain_category as string) || '';
      
      if (categories.length > 0 && domain_category) {
        return riskScore >= minRiskScore && categories.includes(domain_category);
      }
      return riskScore >= minRiskScore;
    }

    case 'vulnerability_critical': {
      const minCvss = (conditions.min_cvss as number) || 9.0;
      const cvssScore = (context.cvss_score as number) || 0;
      const vulnsFound = (context.vulns_found as number) || 0;
      return cvssScore >= minCvss || vulnsFound > 0;
    }

    case 'vulnerability_high': {
      const minCvss = (conditions.min_cvss as number) || 7.0;
      const maxCvss = (conditions.max_cvss as number) || 8.9;
      const cvssScore = (context.cvss_score as number) || 0;
      return cvssScore >= minCvss && cvssScore <= maxCvss;
    }

    case 'multiple_malicious_access': {
      const minCount = (conditions.min_count as number) || 3;
      const accessCount = (context.access_count as number) || 0;
      return accessCount >= minCount;
    }

    case 'suspicious_process': {
      const processReputation = (context.process_reputation as string) || '';
      const requiredReputation = (conditions.process_reputation as string) || 'malicious';
      return processReputation === requiredReputation;
    }

    case 'unauthorized_service': {
      const authorized = (context.authorized as boolean) ?? true;
      const serviceState = (context.service_state as string) || '';
      const requiredState = (conditions.service_state as string) || 'running';
      return !authorized && serviceState === requiredState;
    }

    case 'manual':
      return true; // Manual triggers always pass

    default:
      return true; // Unknown triggers pass by default
  }
}
