/**
 * get-installation-pipeline-metrics — Migrated to serveTenant
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const ParamsSchema = z.object({
  hours_back: z.coerce.number().int().min(1).max(720).optional(),
}).passthrough();

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, requestId, body } = ctx;

  logger.info(`[${requestId}] Get installation pipeline metrics request started`);

  // Parse hours_back from body or URL
  const parsed = ParamsSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid input', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  let hoursBack: number | null = parsed.data.hours_back ?? null;
  
  if (hoursBack === null) {
    const url = new URL(req.url);
    const hoursBackRaw = url.searchParams.get("hours_back");
    if (hoursBackRaw) {
      hoursBack = parseInt(hoursBackRaw);
    }
  }

  if (hoursBack !== null && (isNaN(hoursBack) || hoursBack < 1 || hoursBack > 720)) {
    logger.error(`[${requestId}] Invalid hours_back: ${hoursBack}`);
    return new Response(
      JSON.stringify({ success: false, error: "Invalid hours_back parameter. Must be between 1 and 720 (30 days).", request_id: requestId }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[${requestId}] Fetching metrics for tenant ${tenantId}, hours_back: ${hoursBack ?? 'all time'}`);

  const { data: metrics, error: metricsError } = await supabase
    .rpc("calculate_pipeline_metrics", { p_tenant_id: tenantId, p_hours_back: hoursBack });

  if (metricsError) {
    logger.error(`[${requestId}] Error calling calculate_pipeline_metrics:`, metricsError);
    throw metricsError;
  }

  logger.info(`[${requestId}] Metrics calculated successfully:`, metrics);

  const result = metrics && metrics.length > 0 ? metrics[0] : {
    total_generated: 0, total_downloaded: 0, total_command_copied: 0,
    total_installed: 0, total_active: 0, total_stuck: 0,
    success_rate_pct: 0, avg_install_time_seconds: 0,
    conversion_rate_generated_to_installed_pct: 0, conversion_rate_copied_to_installed_pct: 0,
  };

  return { success: true, metrics: result, request_id: requestId, tenant_id: tenantId, hours_back: hoursBack ?? 'all' };
}, {
  methods: ['POST', 'GET'],
});
