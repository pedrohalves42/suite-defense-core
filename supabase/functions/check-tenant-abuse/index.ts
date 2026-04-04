import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

const THRESHOLDS = {
  JOBS_PER_HOUR: 500,
  FAILED_AUTH_PER_HOUR: 50,
  AGENTS_OVER_LIMIT_RATIO: 1.2,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  logger.info(`[${requestId}] check-tenant-abuse started`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all active tenants
    const { data: tenants, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('status', 'active');

    if (tenantErr) {
      logger.error(`[${requestId}] Failed to fetch tenants`, tenantErr);
      return new Response(JSON.stringify({ error: 'Failed to fetch tenants' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const alerts: Array<{ tenant_id: string; tenant_name: string; abuse_type: string; value: number; threshold: number }> = [];

    for (const tenant of tenants || []) {
      // Check jobs/hour
      const { count: jobCount } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .gte('created_at', oneHourAgo);

      if ((jobCount ?? 0) > THRESHOLDS.JOBS_PER_HOUR) {
        alerts.push({
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          abuse_type: 'excessive_jobs',
          value: jobCount ?? 0,
          threshold: THRESHOLDS.JOBS_PER_HOUR,
        });
      }

      // Check failed auth attempts
      const { count: failedAuth } = await supabase
        .from('failed_login_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .gte('attempted_at', oneHourAgo);

      if ((failedAuth ?? 0) > THRESHOLDS.FAILED_AUTH_PER_HOUR) {
        alerts.push({
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          abuse_type: 'brute_force_suspected',
          value: failedAuth ?? 0,
          threshold: THRESHOLDS.FAILED_AUTH_PER_HOUR,
        });
      }

      // Check agent limit overflow
      const { count: agentCount } = await supabase
        .from('agents')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('status', 'active');

      const { data: sub } = await supabase
        .from('tenant_subscriptions')
        .select('agent_limit')
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      const limit = sub?.agent_limit ?? 2;
      if ((agentCount ?? 0) > limit * THRESHOLDS.AGENTS_OVER_LIMIT_RATIO) {
        alerts.push({
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          abuse_type: 'agent_limit_exceeded',
          value: agentCount ?? 0,
          threshold: Math.ceil(limit * THRESHOLDS.AGENTS_OVER_LIMIT_RATIO),
        });
      }
    }

    // Persist alerts
    if (alerts.length > 0) {
      const alertRows = alerts.map(a => ({
        tenant_id: a.tenant_id,
        alert_type: `abuse_${a.abuse_type}`,
        title: `Abuse detected: ${a.abuse_type}`,
        message: `Tenant "${a.tenant_name}" exceeded threshold: ${a.value}/${a.threshold}`,
        severity: a.abuse_type === 'brute_force_suspected' ? 'critical' : 'warning',
        status: 'active',
      }));

      const { error: insertErr } = await supabase
        .from('system_alerts')
        .insert(alertRows);

      if (insertErr) {
        logger.error(`[${requestId}] Failed to insert alerts`, insertErr);
      } else {
        logger.info(`[${requestId}] Created ${alerts.length} abuse alerts`);
      }
    }

    logger.info(`[${requestId}] check-tenant-abuse completed. Tenants checked: ${tenants?.length ?? 0}, Alerts: ${alerts.length}`);

    return new Response(JSON.stringify({
      success: true,
      tenants_checked: tenants?.length ?? 0,
      alerts_created: alerts.length,
      alerts,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error(`[${requestId}] Unexpected error`, error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
