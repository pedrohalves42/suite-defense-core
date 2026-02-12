import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsSecurityHeaders, secureJsonResponse, secureErrorResponse, secureCorsPreflightResponse } from '../_shared/security-headers.ts';

/**
 * Evaluate Automation Rules
 * 
 * Called periodically (cron) or on-demand after metric ingestion.
 * Checks active rules against latest agent metrics and executes actions.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return secureCorsPreflightResponse();
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth check: requires authenticated user or internal call
    const authHeader = req.headers.get('authorization');
    let tenantId: string | null = null;

    if (authHeader) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', '')
      );
      if (authError || !user) {
        return secureErrorResponse('Unauthorized', 401);
      }

      // Get tenant from user_roles
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('tenant_id, role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'super_admin'])
        .limit(1)
        .maybeSingle();

      if (!roleData) {
        return secureErrorResponse('Admin access required', 403);
      }
      tenantId = roleData.tenant_id;
    }

    const body = req.method === 'POST' ? await req.json() : {};
    tenantId = tenantId || body.tenant_id;

    if (!tenantId) {
      return secureErrorResponse('tenant_id required', 400);
    }

    // Fetch active automation rules for this tenant
    const { data: rules, error: rulesError } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('priority', { ascending: true });

    if (rulesError) {
      console.error('Error fetching rules:', rulesError);
      return secureErrorResponse('Failed to fetch rules', 500);
    }

    if (!rules || rules.length === 0) {
      return secureJsonResponse({ evaluated: 0, triggered: 0, message: 'No active rules' });
    }

    // Fetch latest metrics for all agents in tenant
    const { data: agents } = await supabase
      .from('agents')
      .select('id, agent_name, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    if (!agents || agents.length === 0) {
      return secureJsonResponse({ evaluated: 0, triggered: 0, message: 'No active agents' });
    }

    const agentIds = agents.map(a => a.id);

    // Get latest system metrics
    const { data: metrics } = await supabase
      .from('agent_system_metrics')
      .select('*')
      .in('agent_id', agentIds)
      .order('collected_at', { ascending: false });

    // Deduplicate: keep only latest per agent
    const latestMetrics = new Map<string, any>();
    (metrics || []).forEach(m => {
      if (!latestMetrics.has(m.agent_id)) {
        latestMetrics.set(m.agent_id, m);
      }
    });

    let triggered = 0;
    const executions: any[] = [];

    for (const rule of rules) {
      const conditions = rule.trigger_conditions as any;

      // Check cooldown
      if (rule.last_triggered_at) {
        const cooldownMs = (rule.cooldown_minutes || 30) * 60 * 1000;
        if (Date.now() - new Date(rule.last_triggered_at).getTime() < cooldownMs) {
          continue; // Skip, in cooldown
        }
      }

      if (rule.trigger_type === 'metric_threshold') {
        for (const [agentId, m] of latestMetrics) {
          // Check scope
          if (rule.target_scope === 'specific_agent' && !(rule.target_ids || []).includes(agentId)) {
            continue;
          }

          const metricMap: Record<string, number | null> = {
            'cpu_usage_percent': m.cpu_usage_percent,
            'memory_usage_percent': m.memory_usage_percent,
            'disk_usage_percent': m.disk_usage_percent,
          };

          const metricValue = metricMap[conditions.metric];
          if (metricValue === null || metricValue === undefined) continue;

          let shouldTrigger = false;
          const threshold = conditions.value;

          switch (conditions.operator) {
            case '>': shouldTrigger = metricValue > threshold; break;
            case '>=': shouldTrigger = metricValue >= threshold; break;
            case '<': shouldTrigger = metricValue < threshold; break;
            case '<=': shouldTrigger = metricValue <= threshold; break;
            case '==': shouldTrigger = metricValue === threshold; break;
          }

          if (shouldTrigger) {
            const actionConfig = rule.action_config as any;
            let actionResult: any = null;
            let status = 'executed';

            try {
              if (rule.action_type === 'send_alert') {
                // Create system alert
                const { data: alertData, error: alertError } = await supabase
                  .from('system_alerts')
                  .insert({
                    tenant_id: tenantId,
                    agent_id: agentId,
                    alert_type: `automation_${conditions.metric}`,
                    severity: conditions.value >= 95 ? 'critical' : 'high',
                    title: `[Auto] ${rule.name}`,
                    message: `${conditions.metric} = ${metricValue}% (threshold: ${conditions.operator} ${threshold}%)`,
                    details: { metric: conditions.metric, value: metricValue, threshold, rule_id: rule.id },
                  })
                  .select('id')
                  .single();

                actionResult = { alert_id: alertData?.id };
                if (alertError) throw alertError;

              } else if (rule.action_type === 'create_job') {
                const agent = agents.find(a => a.id === agentId);
                const { data: jobData, error: jobError } = await supabase
                  .from('jobs')
                  .insert({
                    tenant_id: tenantId,
                    agent_id: agentId,
                    agent_name: agent?.agent_name || 'Unknown',
                    type: actionConfig.job_type || 'health_report',
                    status: 'queued',
                    payload: {
                      source: 'automation_rule',
                      rule_id: rule.id,
                      trigger_metric: conditions.metric,
                      trigger_value: metricValue,
                      ...actionConfig.params,
                    },
                  })
                  .select('id')
                  .single();

                actionResult = { job_id: jobData?.id };
                if (jobError) throw jobError;
              }
            } catch (actionError: any) {
              status = 'failed';
              actionResult = { error: actionError.message };
            }

            executions.push({
              tenant_id: tenantId,
              rule_id: rule.id,
              agent_id: agentId,
              trigger_data: { metric: conditions.metric, value: metricValue, threshold },
              action_taken: rule.action_type,
              action_result: actionResult,
              status,
              executed_at: status === 'executed' ? new Date().toISOString() : null,
            });

            triggered++;
          }
        }
      }
    }

    // Batch insert executions
    if (executions.length > 0) {
      await supabase.from('automation_executions').insert(executions);

      // Update last_triggered_at for triggered rules
      const triggeredRuleIds = [...new Set(executions.map(e => e.rule_id))];
      for (const ruleId of triggeredRuleIds) {
        await supabase
          .from('automation_rules')
          .update({
            last_triggered_at: new Date().toISOString(),
            trigger_count: rules.find(r => r.id === ruleId)!.trigger_count + 1,
          })
          .eq('id', ruleId);
      }
    }

    console.log(`Automation evaluation: ${rules.length} rules, ${triggered} triggered for tenant ${tenantId}`);

    return secureJsonResponse({
      evaluated: rules.length,
      agents_checked: latestMetrics.size,
      triggered,
      executions: executions.length,
    });

  } catch (error) {
    console.error('Error in evaluate-automation-rules:', error);
    return secureErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
});
