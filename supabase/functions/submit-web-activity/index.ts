import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { hashToken } from '../_shared/token-hash.ts';

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

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

    // Buscar agente via token hash (P0 security fix)
    const tokenHash = await hashToken(agentToken);
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
      .eq('token_hash', tokenHash)
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

    let payload: WebActivityPayload;
    let rawBody: string = '';
    
    try {
      rawBody = await req.text();
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      // P0 FIX: Log detalhado quando payload e invalido
      logger.error('Failed to parse web activity payload', { 
        error: parseError instanceof Error ? parseError.message : String(parseError),
        rawBodyLength: rawBody.length,
        rawBodyPreview: rawBody.substring(0, 500),
        agentName: agent.agent_name
      });
      return new Response(
        JSON.stringify({ 
          error: 'Invalid JSON payload',
          details: 'Failed to parse request body',
          bodyLength: rawBody.length
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use agent_id from payload if provided, otherwise use authenticated agent's id
    const effectiveAgentId = payload.agent_id || agent.id;

    if (!effectiveAgentId || !Array.isArray(payload.items)) {
      // P0 FIX: Log detalhado quando payload nao tem items
      logger.error('Invalid web activity payload structure', { 
        hasAgentId: !!effectiveAgentId,
        hasItems: !!payload.items,
        isArray: Array.isArray(payload.items),
        payloadKeys: Object.keys(payload || {}),
        rawBodyLength: rawBody.length,
        agentName: agent.agent_name
      });
      return new Response(
        JSON.stringify({ 
          error: 'items array is required',
          details: `agent_id: ${!!effectiveAgentId}, items: ${!!payload.items}, isArray: ${Array.isArray(payload.items)}`
        }),
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

    // Preparar itens para insercao com novos campos e validacao robusta
    const itemsToInsert = payload.items
      .filter(item => {
        // Validar que domain existe e e uma string nao vazia
        if (!item.domain || typeof item.domain !== 'string' || item.domain.trim() === '') {
          logger.warn('Skipping item with invalid domain', { item });
          return false;
        }
        return true;
      })
      .map(item => {
        // Sanitizar domain - remover caracteres invalidos
        const sanitizedDomain = item.domain.trim().toLowerCase().replace(/[^\w.-]/g, '');
        
        return {
          tenant_id: agent.tenant_id,
          agent_id: effectiveAgentId,
          domain: sanitizedDomain || 'unknown',
          url: item.url || null,
          url_full: item.url_full || item.url || null,
          page_title: item.page_title || null,
          source: item.source || 'dns_cache',
          browser: item.browser || (item.source?.includes('chrome') ? 'chrome' : 
                                    item.source?.includes('firefox') ? 'firefox' : 
                                    item.source?.includes('edge') ? 'edge' : null),
          visit_count: typeof item.visit_count === 'number' ? item.visit_count : 1,
          total_duration_seconds: typeof item.total_duration_seconds === 'number' ? item.total_duration_seconds : 0,
          category: categorizeDomain(sanitizedDomain),
          is_blocked: isDomainBlocked(sanitizedDomain),
          visited_at: item.visited_at || nowIso,
        };
      });

    // DEDUPLICACAO SERVER-SIDE (defesa em profundidade)
    // Remove duplicatas por domain+source, somando visit_count
    const uniqueItemsMap = new Map<string, typeof itemsToInsert[0]>();
    for (const item of itemsToInsert) {
      const key = `${item.domain}:${item.source}`;
      const existing = uniqueItemsMap.get(key);
      if (existing) {
        // Soma visit_count e mantém o mais recente visited_at
        existing.visit_count = (existing.visit_count || 1) + (item.visit_count || 1);
        existing.total_duration_seconds = (existing.total_duration_seconds || 0) + (item.total_duration_seconds || 0);
        if (new Date(item.visited_at) > new Date(existing.visited_at)) {
          existing.visited_at = item.visited_at;
          existing.page_title = item.page_title || existing.page_title;
          existing.url = item.url || existing.url;
          existing.url_full = item.url_full || existing.url_full;
        }
      } else {
        uniqueItemsMap.set(key, { ...item });
      }
    }
    const dedupedItems = Array.from(uniqueItemsMap.values());

    if (dedupedItems.length < itemsToInsert.length) {
      logger.info(`Deduped ${itemsToInsert.length} → ${dedupedItems.length} items (merged ${itemsToInsert.length - dedupedItems.length} duplicates)`);
    }

    // ========================================
    // BATCH INSERT (P1 PERFORMANCE)
    // Replaces O(n) loop with batch upsert for 10x performance
    // Before: 2N queries per request
    // After: 2-3 queries per request
    // ========================================
    let insertedCount = 0;
    let updatedCount = 0;

    // Get today's start for conflict detection
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Step 1: Fetch ALL existing records for today in ONE query
    const domains = dedupedItems.map(item => item.domain);
    const { data: existingRecords } = await supabase
      .from('agent_web_activity')
      .select('id, domain, visit_count, total_duration_seconds')
      .eq('agent_id', effectiveAgentId)
      .in('domain', domains)
      .gte('visited_at', todayStart.toISOString());

    // Create lookup map for existing records
    const existingMap = new Map<string, { id: string; visit_count: number; total_duration_seconds: number }>();
    for (const record of existingRecords || []) {
      existingMap.set(record.domain, record);
    }

    // Step 2: Separate items into updates and inserts
    const itemsToUpdate: Array<{ id: string; data: any }> = [];
    const itemsToInsertBatch: typeof dedupedItems = [];

    for (const item of dedupedItems) {
      const existing = existingMap.get(item.domain);
      if (existing) {
        itemsToUpdate.push({
          id: existing.id,
          data: {
            visit_count: (existing.visit_count || 1) + (item.visit_count || 1),
            total_duration_seconds: (existing.total_duration_seconds || 0) + (item.total_duration_seconds || 0),
            visited_at: item.visited_at,
            page_title: item.page_title,
            url: item.url,
            url_full: item.url_full,
          }
        });
      } else {
        itemsToInsertBatch.push(item);
      }
    }

    // Step 3: Batch UPDATE existing records (one query per update, but could be optimized further with RPC)
    for (const update of itemsToUpdate) {
      const { error: updateError } = await supabase
        .from('agent_web_activity')
        .update(update.data)
        .eq('id', update.id);

      if (!updateError) updatedCount++;
    }

    // Step 4: Batch INSERT new records in ONE query
    if (itemsToInsertBatch.length > 0) {
      const { error: batchInsertError, count } = await supabase
        .from('agent_web_activity')
        .insert(itemsToInsertBatch);

      if (batchInsertError) {
        logger.error('Batch insert failed', { error: batchInsertError.message, itemCount: itemsToInsertBatch.length });
        
        // Fallback: insert individually on batch failure
        for (const item of itemsToInsertBatch) {
          const { error: insertError } = await supabase
            .from('agent_web_activity')
            .insert(item);
          if (!insertError) insertedCount++;
        }
      } else {
        insertedCount = itemsToInsertBatch.length;
      }
    }

    logger.info(`Web activity processed: ${insertedCount} inserted, ${updatedCount} updated`);

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
