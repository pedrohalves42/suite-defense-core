import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Monitor DLQ Exhaustion
 * Detecta jobs que falharam definitivamente após todos os retries
 * e gera alertas + notificações via webhook
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1126: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const startTime = Date.now();
  console.log('[monitor-dlq-exhaustion] Starting scan...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find exhausted DLQ items that don't have alerts yet
    const { data: exhaustedItems, error: dlqError } = await supabase
      .from('failed_jobs_dlq')
      .select('id, original_job_id, agent_id, tenant_id, failure_class, retry_count, error_message, resolved_at')
      .eq('status', 'exhausted')
      .order('resolved_at', { ascending: false })
      .limit(100);

    if (dlqError) throw new Error(`Failed to fetch DLQ: ${dlqError.message}`);
    if (!exhaustedItems || exhaustedItems.length === 0) {
      console.log('[monitor-dlq-exhaustion] No exhausted items found');
      return new Response(JSON.stringify({ alerts_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check which items already have alerts
    const dlqIds = exhaustedItems.map(i => i.id);
    const { data: existingAlerts } = await supabase
      .from('dlq_exhaustion_alerts')
      .select('dlq_item_id')
      .in('dlq_item_id', dlqIds);

    const existingSet = new Set((existingAlerts || []).map(a => a.dlq_item_id));
    const newItems = exhaustedItems.filter(i => !existingSet.has(i.id));

    if (newItems.length === 0) {
      console.log('[monitor-dlq-exhaustion] All items already have alerts');
      return new Response(JSON.stringify({ alerts_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[monitor-dlq-exhaustion] Creating ${newItems.length} new alerts`);

    // Create alerts
    const alerts = newItems.map(item => ({
      tenant_id: item.tenant_id,
      dlq_item_id: item.id,
      job_id: item.original_job_id,
      agent_id: item.agent_id,
      failure_class: item.failure_class || 'UNKNOWN',
      total_retries: item.retry_count || 0,
      last_error: item.error_message,
      alert_sent: false,
    }));

    const { error: insertError } = await supabase
      .from('dlq_exhaustion_alerts')
      .insert(alerts);

    if (insertError) {
      console.error('[monitor-dlq-exhaustion] Failed to insert alerts:', insertError.message);
      throw insertError;
    }

    // Dispatch webhooks for each tenant
    const tenantIds = [...new Set(newItems.map(i => i.tenant_id))];
    let webhooksSent = 0;

    for (const tenantId of tenantIds) {
      const tenantItems = newItems.filter(i => i.tenant_id === tenantId);

      // Check if tenant has webhook configs for dlq_exhausted events
      const { data: webhooks } = await supabase
        .from('webhook_configs')
        .select('id, url, secret, headers')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .contains('event_types', ['dlq_exhausted']);

      if (!webhooks || webhooks.length === 0) continue;

      for (const webhook of webhooks) {
        const payload = {
          event: 'dlq_exhausted',
          timestamp: new Date().toISOString(),
          severity: 'critical',
          title: `${tenantItems.length} job(s) falharam definitivamente`,
          message: `Jobs exauriram todos os retries: ${tenantItems.map(i => i.failure_class).join(', ')}`,
          metadata: {
            total_exhausted: tenantItems.length,
            failure_classes: tenantItems.map(i => i.failure_class),
            job_ids: tenantItems.map(i => i.original_job_id),
          },
          source: 'cybershield-dlq-monitor',
        };

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'CyberShield-DLQ-Monitor/1.0',
          ...(webhook.headers as Record<string, string> || {}),
        };

        // HMAC signature
        if (webhook.secret) {
          const encoder = new TextEncoder();
          const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(webhook.secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
          );
          const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(JSON.stringify(payload)));
          headers['X-Webhook-Signature'] = `sha256=${Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
        }

        try {
          const resp = await fetch(webhook.url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000),
          });

          if (resp.ok) {
            webhooksSent++;
            // Mark alerts as sent
            await supabase
              .from('dlq_exhaustion_alerts')
              .update({ alert_sent: true, alert_sent_at: new Date().toISOString() })
              .eq('tenant_id', tenantId)
              .in('dlq_item_id', tenantItems.map(i => i.id));
          } else {
            console.warn(`[monitor-dlq-exhaustion] Webhook failed: HTTP ${resp.status}`);
          }
        } catch (fetchErr) {
          console.error(`[monitor-dlq-exhaustion] Webhook error: ${String(fetchErr)}`);
        }
      }

      // Also create action center alerts
      for (const item of tenantItems) {
        await supabase.from('action_center').insert({
          tenant_id: tenantId,
          type: 'dlq_exhaustion',
          severity: 'critical',
          title: `Job falhou definitivamente: ${item.failure_class}`,
          description: `O job ${item.original_job_id?.slice(0, 8)} exauriu ${item.retry_count || 0} retries. Última falha: ${item.error_message?.slice(0, 100) || 'desconhecida'}`,
          metadata: { dlq_item_id: item.id, job_id: item.original_job_id, agent_id: item.agent_id },
          status: 'open',
          auto_resolve: false,
        }).then(({ error }) => {
          if (error) console.warn('[monitor-dlq-exhaustion] Action center insert failed:', error.message);
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[monitor-dlq-exhaustion] Complete: ${alerts.length} alerts, ${webhooksSent} webhooks, ${duration}ms`);

    return new Response(JSON.stringify({
      success: true,
      alerts_created: alerts.length,
      webhooks_sent: webhooksSent,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[monitor-dlq-exhaustion] Fatal error:', String(error));
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
