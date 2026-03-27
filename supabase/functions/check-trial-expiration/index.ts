import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

logger.info("[CHECK-TRIAL-EXPIRATION] Cron job started");

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1114: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  
  try {

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find subscriptions expiring in 7 days
    const { data: expiringSoon } = await supabase
      .from("tenant_subscriptions")
      .select(`
        tenant_id,
        trial_end,
        tenants!inner(id, name, owner_user_id),
        subscription_plans!inner(name)
      `)
      .eq("status", "trialing")
      .gte("trial_end", now.toISOString())
      .lte("trial_end", sevenDaysFromNow.toISOString())
      .is("metadata->trial_7day_email_sent", null);

    // Find subscriptions expiring in 1 day
    const { data: expiringTomorrow } = await supabase
      .from("tenant_subscriptions")
      .select(`
        tenant_id,
        trial_end,
        tenants!inner(id, name, owner_user_id),
        subscription_plans!inner(name)
      `)
      .eq("status", "trialing")
      .gte("trial_end", now.toISOString())
      .lte("trial_end", oneDayFromNow.toISOString())
      .is("metadata->trial_1day_email_sent", null);

    logger.info(`[CHECK-TRIAL-EXPIRATION] Found ${expiringSoon?.length || 0} trials expiring in 7 days`);
    logger.info(`[CHECK-TRIAL-EXPIRATION] Found ${expiringTomorrow?.length || 0} trials expiring in 1 day`);

    // Send 7-day reminders
    for (const sub of expiringSoon || []) {
      await supabase.functions.invoke("send-trial-reminder", {
        body: {
          tenant_id: sub.tenant_id,
          tenant_name: (sub as any).tenants.name,
          owner_user_id: (sub as any).tenants.owner_user_id,
          trial_end: sub.trial_end,
          days_remaining: 7,
        },
      });

      // Mark as sent
      const metadata = { trial_7day_email_sent: new Date().toISOString() };
      await supabase
        .from("tenant_subscriptions")
        .update({ metadata })
        .eq("tenant_id", sub.tenant_id);
    }

    // Send 1-day reminders
    for (const sub of expiringTomorrow || []) {
      await supabase.functions.invoke("send-trial-reminder", {
        body: {
          tenant_id: sub.tenant_id,
          tenant_name: (sub as any).tenants.name,
          owner_user_id: (sub as any).tenants.owner_user_id,
          trial_end: sub.trial_end,
          days_remaining: 1,
        },
      });

      // Mark as sent
      const currentMetadata = { trial_1day_email_sent: new Date().toISOString() };
      await supabase
        .from("tenant_subscriptions")
        .update({ metadata: currentMetadata })
        .eq("tenant_id", sub.tenant_id);
    }

    logger.info("[CHECK-TRIAL-EXPIRATION] Completed successfully");

    const result = { 
      success: true,
      sent_7day: expiringSoon?.length || 0,
      sent_1day: expiringTomorrow?.length || 0,
    };

    // Log observability
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'check-trial-expiration',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: result,
      p_processed_count: (expiringSoon?.length || 0) + (expiringTomorrow?.length || 0),
      p_job_source: 'cron'
    });

    return new Response(
      JSON.stringify(result),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    logger.error("[CHECK-TRIAL-EXPIRATION] Error:", error);
    
    // Log error observability
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'check-trial-expiration',
        p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: error instanceof Error ? error.message : "Unknown error",
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (e) { logger.warn('[check-trial-expiration] Failed to log job run:', e); }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});
