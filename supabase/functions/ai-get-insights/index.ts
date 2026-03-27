/**
 * AI Get Insights
 * Fetches AI insights with pagination, filtering, and statistics
 * Migrated to serveTenant middleware
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';

serveTenant(async (req, ctx) => {
  const { supabase, userId, tenantId, isInternal, requestId } = ctx;

  // Rate limiting for external calls only
  if (!isInternal && userId) {
    const rateLimitResult = await checkRateLimit(supabase, userId, 'ai-get-insights', {
      maxRequests: 60,
      windowMinutes: 1,
      blockMinutes: 2,
    });

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          resetAt: rateLimitResult.resetAt?.toISOString(),
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const severity = url.searchParams.get('severity');
  const acknowledged = url.searchParams.get('acknowledged');
  const insightType = url.searchParams.get('insight_type');
  const offset = (page - 1) * limit;

  let query = supabase
    .from('ai_insights')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (severity) query = query.eq('severity', severity);
  if (acknowledged !== null && acknowledged !== undefined) {
    query = query.eq('acknowledged', acknowledged === 'true');
  }
  if (insightType) query = query.eq('insight_type', insightType);

  const { data: insights, error, count } = await query;
  if (error) {
    logger.error(`[ai-get-insights][${requestId}] Error:`, error);
    throw error;
  }

  // Statistics using count queries
  const [
    { count: totalCount },
    { count: criticalCount },
    { count: warningCount },
    { count: infoCount },
    { count: acknowledgedCount },
    { count: pendingCount },
  ] = await Promise.all([
    supabase.from('ai_insights').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open'),
    supabase.from('ai_insights').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open').eq('severity', 'critical'),
    supabase.from('ai_insights').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open').eq('severity', 'warning'),
    supabase.from('ai_insights').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open').eq('severity', 'info'),
    supabase.from('ai_insights').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open').eq('acknowledged', true),
    supabase.from('ai_insights').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open').eq('acknowledged', false),
  ]);

  return {
    insights: insights || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
    statistics: {
      total: totalCount || 0,
      critical: criticalCount || 0,
      warning: warningCount || 0,
      info: infoCount || 0,
      acknowledged: acknowledgedCount || 0,
      pending: pendingCount || 0,
    },
    isInternalCall: isInternal,
  };
}, {
  methods: ['GET', 'POST'],
  tenantSource: 'auto',
});
