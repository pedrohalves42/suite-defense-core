import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticateApiKey, logApiRequest, hasScope } from '../_shared/api-auth.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const apiKey = req.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing API key' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const authResult = await authenticateApiKey(apiKey, supabaseUrl, supabaseServiceKey);
    
    if (!authResult.success) {
      return new Response(
        JSON.stringify({ error: authResult.error }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, authResult.apiKeyId!, 'api-tenant-stats', {
      maxRequests: 100,
      windowMinutes: 1,
      blockMinutes: 5,
    });

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded',
          resetAt: rateLimitResult.resetAt 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!hasScope(authResult.scopes!, 'read')) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const tenantId = authResult.tenantId!;

    // Fetch statistics (with defensive .limit(1000) for each query)
    const [agents, scans, quarantine, jobs] = await Promise.all([
      supabase.from('agents').select('status, last_heartbeat').eq('tenant_id', tenantId).limit(1000),
      supabase.from('virus_scans').select('is_malicious').eq('tenant_id', tenantId).limit(1000),
      supabase.from('quarantined_files').select('status').eq('tenant_id', tenantId).limit(1000),
      supabase.from('jobs').select('status').eq('tenant_id', tenantId).limit(1000),
    ]);

    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const activeAgents = agents.data?.filter(a => 
      a.status === 'active' && 
      a.last_heartbeat && 
      new Date(a.last_heartbeat) > fiveMinutesAgo
    ).length || 0;

    const stats = {
      agents: {
        total: agents.data?.length || 0,
        active: activeAgents,
        offline: (agents.data?.length || 0) - activeAgents,
      },
      scans: {
        total: scans.data?.length || 0,
        malicious: scans.data?.filter(s => s.is_malicious).length || 0,
        clean: scans.data?.filter(s => !s.is_malicious).length || 0,
      },
      quarantine: {
        total: quarantine.data?.length || 0,
        quarantined: quarantine.data?.filter(q => q.status === 'quarantined').length || 0,
        restored: quarantine.data?.filter(q => q.status === 'restored').length || 0,
      },
      jobs: {
        total: jobs.data?.length || 0,
        completed: jobs.data?.filter(j => j.status === 'completed').length || 0,
        pending: jobs.data?.filter(j => j.status === 'queued' || j.status === 'delivered').length || 0,
        failed: jobs.data?.filter(j => j.status === 'failed').length || 0,
      },
      timestamp: new Date().toISOString(),
    };

    const responseTimeMs = Date.now() - startTime;

    await logApiRequest(supabase, {
      apiKeyId: authResult.apiKeyId!,
      tenantId: authResult.tenantId!,
      endpoint: '/api/tenant/stats',
      method: req.method,
      statusCode: 200,
      responseTimeMs,
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    });

    return new Response(
      JSON.stringify(stats),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in api-tenant-stats:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
