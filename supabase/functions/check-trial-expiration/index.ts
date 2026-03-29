/**
 * check-trial-expiration - Cron function
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startedAt = Date.now();

  logger.info(`[${requestId}] check-trial-expiration: Started`);

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find subscriptions expiring in 7 days
  const { data: expiringSoon } = await supabase
    .from("tenant_subscriptions")
    .select(`tenant_id, trial_end, tenants!inner(id, name, owner_user_id), subscription_plans!inner(name)`)
    .eq("status", "trialing")
    .gte("trial_end", now.toISOString())
    .lte("trial_end", sevenDaysFromNow.toISOString())
    .is("metadata->trial_7day_email_sent", null);

  // Find subscriptions expiring in 1 day
  const { data: expiringTomorrow } = await supabase
    .from("tenant_subscriptions")
    .select(`tenant_id, trial_end, tenants!inner(id, name, owner_user_id), subscription_plans!inner(name)`)
    .eq("status", "trialing")
    .gte("trial_end", now.toISOString())
    .lte("trial_end", oneDayFromNow.toISOString())
    .is("metadata->trial_1day_email_sent", null);

  logger.info(`[${requestId}] Found ${expiringSoon?.length || 0} 7-day, ${expiringTomorrow?.length || 0} 1-day`);

  // Send 7-day reminders
  for (const sub of expiringSoon || []) {
    const tenantData = sub as Record<string, unknown>;
    const tenant = tenantData.tenants as { name: string; owner_user_id: string };
    await supabase.functions.invoke("notification-router", {
      body: {
        action: "trial-reminder",
        payload: {
          tenant_id: sub.tenant_id, tenant_name: tenant.name,
          owner_user_id: tenant.owner_user_id, trial_end: sub.trial_end, days_remaining: 7,
        },
      },
    });
    await supabase.from("tenant_subscriptions")
      .update({ metadata: { trial_7day_email_sent: new Date().toISOString() } })
      .eq("tenant_id", sub.tenant_id);
  }

  // Send 1-day reminders
  for (const sub of expiringTomorrow || []) {
    const tenantData = sub as Record<string, unknown>;
    const tenant = tenantData.tenants as { name: string; owner_user_id: string };
    await supabase.functions.invoke("notification-router", {
      body: {
        action: "trial-reminder",
        payload: {
          tenant_id: sub.tenant_id, tenant_name: tenant.name,
          owner_user_id: tenant.owner_user_id, trial_end: sub.trial_end, days_remaining: 1,
        },
      },
    });
    await supabase.from("tenant_subscriptions")
      .update({ metadata: { trial_1day_email_sent: new Date().toISOString() } })
      .eq("tenant_id", sub.tenant_id);
  }

  const result = {
    success: true,
    sent_7day: expiringSoon?.length || 0,
    sent_1day: expiringTomorrow?.length || 0,
  };

  await supabase.rpc('log_scheduled_job_run', {
    p_job_key: 'check-trial-expiration',
    p_success: true,
    p_duration_ms: Date.now() - startedAt,
    p_result: result,
    p_processed_count: (expiringSoon?.length || 0) + (expiringTomorrow?.length || 0),
    p_job_source: 'cron'
  });

  return result;
});
