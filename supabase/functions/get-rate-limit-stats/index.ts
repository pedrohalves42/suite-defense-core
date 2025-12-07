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

    // Get summary by endpoint
    const { data: summary, error: summaryError } = await supabase
      .rpc('get_rate_limit_summary', { p_hours_back: hoursBack });

    if (summaryError) {
      console.error(`[${ctx.requestId}] Error fetching summary:`, summaryError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch rate limit summary', requestId: ctx.requestId }),
        { status: 500, headers: mergeHeaders(corsHeaders, ctx) }
      );
    }

    // Get top blocked identifiers
    const { data: topBlocked, error: blockedError } = await supabase
      .from('rate_limits')
      .select('identifier, endpoint, request_count, blocked_until')
      .not('blocked_until', 'is', null)
      .gt('blocked_until', new Date().toISOString())
      .order('request_count', { ascending: false })
      .limit(10);

    if (blockedError) {
      console.error(`[${ctx.requestId}] Error fetching blocked:`, blockedError);
    }

    // Get hourly breakdown
    const { data: hourlyData, error: hourlyError } = await supabase
      .from('rate_limits')
      .select('endpoint, request_count, window_start')
      .gte('window_start', new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString())
      .order('window_start', { ascending: true });

    if (hourlyError) {
      console.error(`[${ctx.requestId}] Error fetching hourly:`, hourlyError);
    }

    // Aggregate hourly data
    const hourlyBreakdown: Record<string, { hour: string; requests: number }[]> = {};
    (hourlyData || []).forEach((row: any) => {
      const hour = new Date(row.window_start).toISOString().slice(0, 13) + ':00:00Z';
      if (!hourlyBreakdown[row.endpoint]) {
        hourlyBreakdown[row.endpoint] = [];
      }
      const existing = hourlyBreakdown[row.endpoint].find(h => h.hour === hour);
      if (existing) {
        existing.requests += row.request_count;
      } else {
        hourlyBreakdown[row.endpoint].push({ hour, requests: row.request_count });
      }
    });

    // Calculate totals
    const totals = {
      total_requests: (summary || []).reduce((acc: number, s: any) => acc + Number(s.total_requests || 0), 0),
      total_blocked: (summary || []).reduce((acc: number, s: any) => acc + Number(s.blocked_count || 0), 0),
      unique_endpoints: (summary || []).length,
      currently_blocked: (topBlocked || []).length,
    };

    console.log(`[${ctx.requestId}] Rate limit stats fetched successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        requestId: ctx.requestId,
        data: {
          summary: summary || [],
          top_blocked: topBlocked || [],
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
