import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { createRequestContext, mergeHeaders } from '../_shared/request-context.ts';

Deno.serve(async (req) => {
  const ctx = createRequestContext(req, 'get-rate-limit-stats');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: mergeHeaders(corsHeaders, ctx) });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', requestId: ctx.requestId }),
      { status: 405, headers: mergeHeaders(corsHeaders, ctx) }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get hours_back from body (POST) or query params (GET)
    let hoursBack = 24;
    try {
      const body = await req.json();
      if (body?.hours_back) {
        hoursBack = parseInt(body.hours_back);
      }
    } catch {
      // Fallback to query params for GET requests
      const url = new URL(req.url);
      hoursBack = parseInt(url.searchParams.get('hours_back') || '24');
    }

    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    console.log(`[${ctx.requestId}] Fetching rate limit stats for last ${hoursBack} hours, cutoff: ${cutoffTime}`);

    // Get all rate limit records from the period
    const { data: rateLimits, error: rateLimitsError } = await supabase
      .from('rate_limits')
      .select('*')
      .gte('window_start', cutoffTime)
      .order('window_start', { ascending: false });

    if (rateLimitsError) {
      console.error(`[${ctx.requestId}] Error fetching rate limits:`, rateLimitsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch rate limits', requestId: ctx.requestId }),
        { status: 500, headers: mergeHeaders(corsHeaders, ctx) }
      );
    }

    console.log(`[${ctx.requestId}] Found ${rateLimits?.length || 0} rate limit records`);

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

      // Check if currently blocked
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

    console.log(`[${ctx.requestId}] Rate limit stats: ${totals.total_requests} requests, ${totals.unique_endpoints} endpoints, ${totals.currently_blocked} blocked`);

    return new Response(
      JSON.stringify({
        success: true,
        requestId: ctx.requestId,
        data: {
          summary,
          top_blocked: currentlyBlocked.slice(0, 10),
          hourly_breakdown: hourlyBreakdown,
          totals,
          period_hours: hoursBack,
        }
      }),
      { status: 200, headers: mergeHeaders(corsHeaders, ctx) }
    );
  } catch (err) {
    console.error(`[${ctx.requestId}] Unexpected error:`, err);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        requestId: ctx.requestId 
      }),
      { status: 500, headers: mergeHeaders(corsHeaders, ctx) }
    );
  }
});
