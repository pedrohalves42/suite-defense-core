import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface WebActivityItem {
  domain: string;
  url?: string;
  url_full?: string;
  page_title?: string;
  visited_at?: string;
  source?: string;
  browser?: string;
  visit_count?: number;
  total_duration_seconds?: number;
}

interface WebActivityPayload {
  agent_id: string;
  items: WebActivityItem[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Autenticacao via HMAC
    const agentToken = req.headers.get('X-Agent-Token');
    if (!agentToken) {
      return new Response(JSON.stringify({ error: 'Missing agent token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar agente via token
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select(`
        agent_id,
        is_active,
        agents (
          id,
          agent_name,
          tenant_id,
          hmac_secret,
          status
        )
      `)
      .eq('token', agentToken)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenError || !tokenData || !tokenData.agents) {
      logger.warn('Invalid agent token');
      return new Response(JSON.stringify({ error: 'Invalid agent token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const agent = tokenData.agents as any;

    // Validar HMAC
    if (agent.hmac_secret) {
      const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret);
      if (!hmacResult.valid) {
        return new Response(
          JSON.stringify({ 
            error: 'unauthorized',
            code: hmacResult.errorCode,
            message: hmacResult.errorMessage
          }), 
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Rate limiting
    const rateLimitKey = `web-activity:${agent.agent_name}`;
    const rateLimitResult = await checkRateLimit(supabase, rateLimitKey, 'submit-web-activity', {
      maxRequests: 20,
      windowMinutes: 60,
      blockMinutes: 10,
    });
    
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded', 
          resetAt: rateLimitResult.resetAt 
        }), 
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const payload: WebActivityPayload = await req.json();

    // Use agent_id from payload if provided, otherwise use authenticated agent's id
    const effectiveAgentId = payload.agent_id || agent.id;

    if (!effectiveAgentId || !Array.isArray(payload.items)) {
      return new Response(
        JSON.stringify({ error: 'items array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!payload.items.length) {
      logger.info('No web activity items to store');
      return new Response(
        JSON.stringify({ success: true, inserted: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`Storing ${payload.items.length} web activity items for agent ${agent.agent_name}`);

    const nowIso = new Date().toISOString();

    // Categorize domain using simple pattern matching
    const categorizeDomain = (domain: string): string => {
      const d = domain.toLowerCase();
      if (['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'tiktok.com'].some(p => d.includes(p))) return 'social';
      if (['youtube.com', 'netflix.com', 'twitch.tv', 'primevideo.com'].some(p => d.includes(p))) return 'video';
      if (['github.com', 'gitlab.com', 'notion.so', 'slack.com', 'teams.microsoft.com'].some(p => d.includes(p))) return 'work';
      if (['amazon.com', 'mercadolivre.com', 'shopee.com'].some(p => d.includes(p))) return 'shopping';
      if (['mail.google.com', 'outlook.com', 'yahoo.com'].some(p => d.includes(p))) return 'email';
      if (['google.com', 'bing.com', 'duckduckgo.com'].some(p => d.includes(p))) return 'search';
      if (['steam.com', 'epicgames.com', 'roblox.com'].some(p => d.includes(p))) return 'games';
      if (['bet365.com', 'betfair.com', 'blaze.com', 'pixbet.com'].some(p => d.includes(p))) return 'gambling';
      return 'other';
    };

    // Check if domain is blocked
    const { data: blockedSites } = await supabase
      .from('blocked_websites')
      .select('domain_pattern')
      .eq('tenant_id', agent.tenant_id)
      .eq('is_active', true);

    const blockedPatterns = blockedSites?.map(s => s.domain_pattern) || [];
    const isDomainBlocked = (domain: string): boolean => {
      const d = domain.toLowerCase();
      return blockedPatterns.some(pattern => {
        const p = pattern.toLowerCase();
        if (p.startsWith('*.')) {
          const suffix = p.slice(2);
          return d === suffix || d.endsWith('.' + suffix);
        }
        return d === p || d.endsWith('.' + p);
      });
    };

    // Preparar itens para insercao com novos campos
    const itemsToInsert = payload.items.map(item => ({
      tenant_id: agent.tenant_id,
      agent_id: effectiveAgentId,
      domain: item.domain,
      url: item.url || null,
      url_full: item.url_full || item.url || null,
      page_title: item.page_title || null,
      source: item.source || 'dns_cache',
      browser: item.browser || (item.source?.includes('chrome') ? 'chrome' : 
                                item.source?.includes('firefox') ? 'firefox' : 
                                item.source?.includes('edge') ? 'edge' : null),
      visit_count: item.visit_count || 1,
      total_duration_seconds: item.total_duration_seconds || 0,
      category: categorizeDomain(item.domain),
      is_blocked: isDomainBlocked(item.domain),
      visited_at: item.visited_at || nowIso,
    }));

    // DEDUPLICACAO SERVER-SIDE (defesa em profundidade)
    // Remove duplicatas por domain+source para evitar erro de UPSERT
    const uniqueItemsMap = new Map<string, typeof itemsToInsert[0]>();
    for (const item of itemsToInsert) {
      const key = `${item.domain}:${item.source}`;
      if (!uniqueItemsMap.has(key)) {
        uniqueItemsMap.set(key, item);
      }
    }
    const dedupedItems = Array.from(uniqueItemsMap.values());

    if (dedupedItems.length < itemsToInsert.length) {
      logger.info(`Deduped ${itemsToInsert.length} ? ${dedupedItems.length} items (removed ${itemsToInsert.length - dedupedItems.length} duplicates)`);
    }

    const { error: insertError } = await supabase
      .from('agent_web_activity')
      .insert(dedupedItems);

    if (insertError) {
      logger.error('Failed to insert web activity', { 
        error: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
        itemCount: dedupedItems.length,
        agentName: agent.agent_name
      });
      return new Response(
        JSON.stringify({ 
          error: 'Failed to store web activity',
          details: insertError.message,
          code: insertError.code
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.success(`Web activity stored: ${payload.items.length} items`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        inserted: payload.items.length 
      }), 
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Web activity submission failed', { 
      error: errorMessage, 
      stack: errorStack,
      phase: 'uncaught_exception'
    });
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: errorMessage 
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
