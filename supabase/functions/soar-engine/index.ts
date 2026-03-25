import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

/**
 * SOAR Lite Engine — Automated Security Response
 * 
 * Evaluates security events against SOAR rules and triggers
 * automated remediation actions with blast radius protection.
 * 
 * Called by: correlate-edr-events, submit-endpoint-events, or scheduled
 * 
 * Flow:
 *   Event → Match Rules → Check Blast Radius → Create Remediation Job
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SOAREvent {
  tenant_id: string;
  agent_id: string;
  agent_name: string;
  event_type: string;
  severity: string;
  details: Record<string, unknown>;
}

interface SOARRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_conditions: Record<string, unknown>;
  action_type: string;
  action_params: Record<string, unknown>;
  severity_filter: string[];
  enabled: boolean;
  requires_approval: boolean;
  cooldown_minutes: number;
}

// Built-in SOAR rules (applied to all tenants)
const BUILTIN_RULES: SOARRule[] = [
  {
    id: 'soar-builtin-001',
    name: 'Ransomware → Isolate Host',
    trigger_type: 'ransomware_detected',
    trigger_conditions: {},
    action_type: 'isolate_host',
    action_params: {},
    severity_filter: ['critical', 'high'],
    enabled: true,
    requires_approval: false, // immediate for ransomware
    cooldown_minutes: 0,
  },
  {
    id: 'soar-builtin-002',
    name: 'Token Exfiltration → Revoke Token',
    trigger_type: 'token_exfiltration',
    trigger_conditions: {},
    action_type: 'revoke_agent_token',
    action_params: {},
    severity_filter: ['critical', 'high'],
    enabled: true,
    requires_approval: false,
    cooldown_minutes: 5,
  },
  {
    id: 'soar-builtin-003',
    name: 'AV Disabled → Re-enable AV',
    trigger_type: 'antivirus_disabled',
    trigger_conditions: {},
    action_type: 'check_antivirus',
    action_params: {},
    severity_filter: ['critical', 'high', 'medium'],
    enabled: true,
    requires_approval: false,
    cooldown_minutes: 30,
  },
  {
    id: 'soar-builtin-004',
    name: 'Firewall Disabled → Re-enable Firewall',
    trigger_type: 'firewall_disabled',
    trigger_conditions: {},
    action_type: 'enable_firewall',
    action_params: {},
    severity_filter: ['critical', 'high', 'medium'],
    enabled: true,
    requires_approval: false,
    cooldown_minutes: 30,
  },
  {
    id: 'soar-builtin-005',
    name: 'Suspicious Process → Kill Process',
    trigger_type: 'suspicious_process',
    trigger_conditions: {},
    action_type: 'kill_process',
    action_params: {},
    severity_filter: ['critical'],
    enabled: true,
    requires_approval: true, // requires approval for process kill
    cooldown_minutes: 5,
  },
  {
    id: 'soar-builtin-006',
    name: 'C2 Communication → Block IP + Isolate',
    trigger_type: 'c2_communication',
    trigger_conditions: {},
    action_type: 'isolate_host',
    action_params: { also_block_ip: true },
    severity_filter: ['critical'],
    enabled: true,
    requires_approval: false,
    cooldown_minutes: 0,
  },
];

// Map event types from EDR to SOAR trigger types
function mapEventToTrigger(eventType: string, details: Record<string, unknown>): string {
  const mapping: Record<string, string> = {
    'ransomware': 'ransomware_detected',
    'ransomware_detected': 'ransomware_detected',
    'token_leak': 'token_exfiltration',
    'token_exfiltration': 'token_exfiltration',
    'antivirus_inactive': 'antivirus_disabled',
    'antivirus_disabled': 'antivirus_disabled',
    'firewall_disabled': 'firewall_disabled',
    'suspicious_process': 'suspicious_process',
    'c2_detected': 'c2_communication',
    'c2_communication': 'c2_communication',
    'DET-015': 'c2_communication', // MITRE C2 detection
    'DET-008': 'suspicious_process', // Privilege escalation
  };
  return mapping[eventType] || eventType;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body: SOAREvent | { events: SOAREvent[] } = await req.json();
    const events: SOAREvent[] = 'events' in body ? body.events : [body];

    if (!events.length) {
      return new Response(JSON.stringify({ success: true, actions: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: Array<{ event_type: string; rule: string; action: string; status: string }> = [];

    for (const event of events) {
      const triggerType = mapEventToTrigger(event.event_type, event.details);

      // Match against built-in rules
      const matchedRules = BUILTIN_RULES.filter(
        (r) =>
          r.enabled &&
          r.trigger_type === triggerType &&
          r.severity_filter.includes(event.severity),
      );

      if (!matchedRules.length) continue;

      for (const rule of matchedRules) {
        // Cooldown check
        if (rule.cooldown_minutes > 0) {
          const cooldownStart = new Date(Date.now() - rule.cooldown_minutes * 60 * 1000).toISOString();
          const { count } = await supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', event.tenant_id)
            .eq('agent_name', event.agent_name)
            .eq('type', rule.action_type)
            .gte('created_at', cooldownStart);

          if ((count || 0) > 0) {
            console.log(`[${requestId}] [SOAR] Cooldown active for ${rule.name} on ${event.agent_name}`);
            results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'cooldown' });
            continue;
          }
        }

        // Blast radius check via existing RPC
        try {
          const { data: blastCheck } = await supabase.rpc('check_blast_radius', {
            p_tenant_id: event.tenant_id,
            p_action_type: rule.action_type,
            p_severity: event.severity,
          });

          if (blastCheck && !blastCheck.allowed) {
            console.warn(`[${requestId}] [SOAR] Blast radius exceeded for ${rule.name}: ${blastCheck.affected_percent}%`);
            results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'blast_radius_blocked' });
            continue;
          }
        } catch (e) {
          // Fail-open for blast radius check
          console.warn(`[${requestId}] [SOAR] Blast radius check failed (fail-open):`, e);
        }

        if (rule.requires_approval) {
          // Create pending approval in playbook_executions
          const { error: approvalError } = await supabase
            .from('playbook_executions')
            .insert({
              tenant_id: event.tenant_id,
              playbook_id: null, // builtin rule, no playbook
              agent_id: event.agent_id,
              status: 'pending',
              trigger_context: {
                soar_rule: rule.id,
                rule_name: rule.name,
                event_type: event.event_type,
                action_type: rule.action_type,
                action_params: rule.action_params,
                details: event.details,
              },
            });

          if (approvalError) {
            console.error(`[${requestId}] [SOAR] Failed to create approval:`, approvalError);
          }

          results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'pending_approval' });
        } else {
          // Execute immediately via auto-remediate
          try {
            const { error: remError } = await supabase.functions.invoke('auto-remediate', {
              body: {
                agent_id: event.agent_id,
                agent_name: event.agent_name,
                tenant_id: event.tenant_id,
                action_type: rule.action_type,
                source: 'soar-engine',
                soar_rule_id: rule.id,
                ...rule.action_params,
              },
            });

            if (remError) {
              console.error(`[${requestId}] [SOAR] Remediation failed for ${rule.name}:`, remError);
              results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'error' });
            } else {
              console.log(`[${requestId}] [SOAR] Executed ${rule.name} on ${event.agent_name}`);
              results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'executed' });
            }
          } catch (execErr) {
            console.error(`[${requestId}] [SOAR] Execution error:`, execErr);
            results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'error' });
          }
        }
      }
    }

    // Log SOAR actions for audit trail
    if (results.length > 0) {
      const tenantId = events[0].tenant_id;
      try {
        await supabase.from('audit_logs').insert(
          results.map((r) => ({
            tenant_id: tenantId,
            action: 'soar_engine_action',
            entity_type: 'soar_rule',
            entity_id: r.rule,
            details: r,
            performed_by: 'system',
          })),
        );
      } catch (auditErr) {
        console.warn(`[${requestId}] [SOAR] Failed to write audit logs:`, auditErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        actions: results.length,
        results,
        request_id: requestId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error(`[${requestId}] [SOAR] Fatal error:`, error);
    return new Response(
      JSON.stringify({ success: false, error: String(error), request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
