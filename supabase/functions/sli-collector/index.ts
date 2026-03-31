/**
 * sli-collector - SLI/SLO Collection Service
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

const SLI_TARGETS = {
  availability: { target: 99.9, warning: 99.5 },
  latency: { target: 500, warning: 1000 },
  throughput: { target: 10000, warning: 8000 },
  errorRate: { target: 0.1, warning: 0.5 },
};

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;
  const parsedBody = body as Record<string, unknown> || {};
  const action = (parsedBody.action as string) || 'dashboard';

  // ═══ RECORD METRIC ═══
  if (action === 'record') {
    const { tenantId, endpoint, statusCode, latencyMs } = parsedBody;
    if (!endpoint || statusCode === undefined) return new Response(JSON.stringify({ error: 'endpoint and statusCode required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const tid = (tenantId as string) || 'global';
    const now = new Date();
    const hourStart = new Date(now);
    hourStart.setMinutes(0, 0, 0);
    const hourStr = hourStart.toISOString();
    const isSuccess = (statusCode as number) >= 200 && (statusCode as number) < 400;
    const isError = (statusCode as number) >= 500;

    const { data: existing } = await supabase.from('sli_metrics_hourly').select('id, total_requests, success_requests, error_requests, total_latency_ms, max_latency_ms, min_latency_ms').eq('tenant_id', tid).eq('endpoint', endpoint).eq('hour', hourStr).maybeSingle();

    if (existing) {
      await supabase.from('sli_metrics_hourly').update({ total_requests: existing.total_requests + 1, success_requests: existing.success_requests + (isSuccess ? 1 : 0), error_requests: existing.error_requests + (isError ? 1 : 0), total_latency_ms: existing.total_latency_ms + ((latencyMs as number) || 0), max_latency_ms: Math.max(existing.max_latency_ms, (latencyMs as number) || 0), min_latency_ms: Math.min(existing.min_latency_ms || 999999, (latencyMs as number) || 0), updated_at: now.toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('sli_metrics_hourly').insert({ tenant_id: tid, endpoint, hour: hourStr, total_requests: 1, success_requests: isSuccess ? 1 : 0, error_requests: isError ? 1 : 0, total_latency_ms: (latencyMs as number) || 0, max_latency_ms: (latencyMs as number) || 0, min_latency_ms: (latencyMs as number) || 0 });
    }

    if (isError) {
      await supabase.from('slo_error_budget_events').insert({ tenant_id: tid, endpoint, status_code: statusCode, error_budget_consumed: 1, timestamp: now.toISOString() });
    }

    return { success: true };
  }

  // ═══ GET SLI ═══
  if (action === 'sli') {
    const tid = (parsedBody.tenantId as string) || 'global';
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const { data: metrics } = await supabase.from('sli_metrics_hourly').select('total_requests, success_requests, error_requests, total_latency_ms, max_latency_ms').eq('tenant_id', tid).gte('hour', startOfDay.toISOString());

    const m = metrics || [];
    const totalReqs = m.reduce((s, r) => s + r.total_requests, 0);
    const successReqs = m.reduce((s, r) => s + r.success_requests, 0);
    const errorReqs = m.reduce((s, r) => s + r.error_requests, 0);
    const totalLatency = m.reduce((s, r) => s + r.total_latency_ms, 0);
    const availability = totalReqs > 0 ? (successReqs / totalReqs) * 100 : 100;
    const avgLatency = totalReqs > 0 ? totalLatency / totalReqs : 0;
    const errorRate = totalReqs > 0 ? (errorReqs / totalReqs) * 100 : 0;
    const throughput = totalReqs / Math.max(m.length, 1);

    const status = (val: number, target: number, warning: number, higherIsBetter = true) => higherIsBetter ? (val >= target ? 'healthy' : val >= warning ? 'warning' : 'critical') : (val <= target ? 'healthy' : val <= warning ? 'warning' : 'critical');

    return {
      availability: { current: +availability.toFixed(2), target: SLI_TARGETS.availability.target, status: status(availability, 99.9, 99.5) },
      latency: { current: Math.round(avgLatency), target: SLI_TARGETS.latency.target, status: status(avgLatency, 500, 1000, false) },
      throughput: { current: Math.round(throughput), target: SLI_TARGETS.throughput.target, status: status(throughput, 10000, 8000) },
      errorRate: { current: +errorRate.toFixed(2), target: SLI_TARGETS.errorRate.target, status: status(errorRate, 0.1, 0.5, false) },
    };
  }

  // ═══ GET SLO ═══
  if (action === 'slo') {
    const tid = (parsedBody.tenantId as string) || 'global';
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: events } = await supabase.from('slo_error_budget_events').select('timestamp').eq('tenant_id', tid).gte('timestamp', thirtyDaysAgo);
    const { data: metricsSummary } = await supabase.from('sli_metrics_hourly').select('total_requests').eq('tenant_id', tid).gte('hour', thirtyDaysAgo);

    const totalReqs = metricsSummary?.reduce((s, r) => s + r.total_requests, 0) || 0;
    const totalErrors = events?.length || 0;
    const maxAllowedErrors = totalReqs * (SLI_TARGETS.errorRate.target / 100);
    const spent = maxAllowedErrors > 0 ? (totalErrors / maxAllowedErrors) * 100 : 0;
    const remaining = Math.max(0, 100 - spent);
    const hourEvents = events?.filter(e => new Date(e.timestamp).getTime() > Date.now() - 3600000).length || 0;
    const dailyAvg = totalErrors / 30;
    const burnRate = dailyAvg > 0 ? (hourEvents * 24) / dailyAvg : 0;
    const hourlyRate = totalErrors / (30 * 24);
    const hoursToExhaustion = hourlyRate > 0 ? Math.floor((maxAllowedErrors - totalErrors) / hourlyRate) : null;

    return { errorBudget: { total: SLI_TARGETS.errorRate.target, spent: +spent.toFixed(1), remaining: +remaining.toFixed(1), status: remaining > 50 ? 'healthy' : remaining > 20 ? 'warning' : 'critical' }, burnRate: +burnRate.toFixed(2), estimatedTimeToExhaustion: hoursToExhaustion };
  }

  // ═══ DASHBOARD ═══
  if (action === 'dashboard') {
    const tid = (parsedBody.tenantId as string) || 'global';
    const { data: recentMetrics } = await supabase.from('sli_metrics_hourly').select('*').eq('tenant_id', tid).order('hour', { ascending: false }).limit(168);
    return { recentMetrics: recentMetrics || [], timestamp: new Date().toISOString() };
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
});
