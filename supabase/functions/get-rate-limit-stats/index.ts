import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveTenant(async (req, ctx) => {
  const { supabase, requestId, body } = ctx;

  // Get hours_back from body (POST) or query params (GET)
  let hoursBack = 24;
  if (body?.hours_back) {
    hoursBack = parseInt(body.hours_back);
  } else {
    const url = new URL(req.url);
    hoursBack = parseInt(url.searchParams.get('hours_back') || '24');
  }

  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  logger.info(`[get-rate-limit-stats][${requestId}] Fetching stats for last ${hoursBack} hours`);

  // Get all rate limit records from the period
  const { data: rateLimits, error: rateLimitsError } = await supabase
    .from('rate_limits')
    .select('*')
    .gte('window_start', cutoffTime)
    .order('window_start', { ascending: false });

  if (rateLimitsError) {
    logger.error(`[get-rate-limit-stats][${requestId}] Error:`, rateLimitsError);
    throw rateLimitsError;
  }

  // Aggregate by endpoint
  const endpointStats = new Map<string, {
    endpoint: string;
    total_requests: number;
    unique_identifiers: Set<string>;
    blocked_count: number;
  }>();

  const currentlyBlocked: Array<{
    identifier: string;
    endpoint: string;
    request_count: number;
    blocked_until: string;
  }> = [];

  const now = new Date();

  for (const record of (rateLimits || [])) {
    const endpoint = record.endpoint || 'unknown';

    if (!endpointStats.has(endpoint)) {
      endpointStats.set(endpoint, {
        endpoint,
        total_requests: 0,
        unique_identifiers: new Set(),
        blocked_count: 0,
      });
    }

    const stats = endpointStats.get(endpoint)!;
    stats.total_requests += record.request_count || 0;
    stats.unique_identifiers.add(record.identifier);

    if (record.blocked_until && new Date(record.blocked_until) > now) {
      stats.blocked_count++;
      currentlyBlocked.push({
        identifier: record.identifier,
        endpoint: record.endpoint,
        request_count: record.request_count,
        blocked_until: record.blocked_until,
      });
    }
  }

  // Convert to array format
  const summary = Array.from(endpointStats.values()).map(stats => ({
    endpoint: stats.endpoint,
    total_requests: stats.total_requests,
    unique_identifiers: stats.unique_identifiers.size,
    blocked_count: stats.blocked_count,
    avg_requests_per_identifier: stats.unique_identifiers.size > 0
      ? Math.round(stats.total_requests / stats.unique_identifiers.size)
      : 0,
  })).sort((a, b) => b.total_requests - a.total_requests);

  // Hourly breakdown
  const hourlyBreakdown: Record<string, { hour: string; requests: number }[]> = {};
  for (const record of (rateLimits || [])) {
    const hour = new Date(record.window_start).toISOString().slice(0, 13) + ':00:00Z';
    const endpoint = record.endpoint || 'unknown';

    if (!hourlyBreakdown[endpoint]) {
      hourlyBreakdown[endpoint] = [];
    }

    const existing = hourlyBreakdown[endpoint].find(h => h.hour === hour);
    if (existing) {
      existing.requests += record.request_count || 0;
    } else {
      hourlyBreakdown[endpoint].push({ hour, requests: record.request_count || 0 });
    }
  }

  // Calculate totals
  const totals = {
    total_requests: summary.reduce((acc, s) => acc + s.total_requests, 0),
    total_blocked: summary.reduce((acc, s) => acc + s.blocked_count, 0),
    unique_endpoints: summary.length,
    currently_blocked: currentlyBlocked.length,
  };

  logger.info(`[get-rate-limit-stats][${requestId}] ${totals.total_requests} requests, ${totals.unique_endpoints} endpoints`);

  return {
    success: true,
    requestId,
    data: {
      summary,
      top_blocked: currentlyBlocked.slice(0, 10),
      hourly_breakdown: hourlyBreakdown,
      totals,
      period_hours: hoursBack,
    },
  };
}, { methods: ['GET', 'POST'] });
