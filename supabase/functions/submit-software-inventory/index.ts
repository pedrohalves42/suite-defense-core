import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts';
import { hashToken } from '../_shared/token-hash.ts';

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

// Funcao para sanitizar strings com caracteres Unicode problematicos
function sanitizeString(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    let s = String(input);
    // Remove C0 control characters (except newline/tab)
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/g, '');
    // Remove invalid unicode escape sequences like \u12 (less than 4 hex digits)
    s = s.replace(/\\u(?![0-9a-fA-F]{4})/g, '');
    // Remove lone backslashes before 'u'
    s = s.replace(/\\(?=u[^0-9a-fA-F])/g, '');
    // Normalize to NFC to avoid odd combined chars
    try { s = s.normalize('NFC'); } catch { /* ignore */ }
    // Trim and limit length
    s = s.trim().slice(0, 1000);
    return s.length > 0 ? s : null;
  } catch {
    return null;
  }
}

interface SoftwareItem {
  name: string;
  version?: string | null;
  vendor?: string | null;
  install_location?: string | null;
  risk_level?: 'unknown' | 'low' | 'medium' | 'high' | 'critical';
}

interface InventoryPayload {
  agent_id: string;
  items: SoftwareItem[];
}

Deno.serve(async (req) => {
  // QUAL-01: Proper HTTP method validation
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }
  
  const methodError = validateHttpMethod(req, ['POST']);
  if (methodError) return methodError;

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

    // Rate limiting (increased to 60 req/hour for validation cycles)
    const rateLimitKey = `software-inventory:${agent.agent_name}`;
    const rateLimitResult = await checkRateLimit(supabase, rateLimitKey, 'submit-software-inventory', {
      maxRequests: 60,
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

    const payload: InventoryPayload = await req.json();

    if (!payload.agent_id || !Array.isArray(payload.items)) {
      return new Response(
        JSON.stringify({ error: 'agent_id and items are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!payload.items.length) {
      logger.info('No software items to store');
      return new Response(
        JSON.stringify({ success: true, inserted: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`Storing ${payload.items.length} software items for agent ${agent.agent_name}`);

    // Deduplicar itens por name + version para evitar erro "ON CONFLICT DO UPDATE command cannot affect row a second time"
    const uniqueMap = new Map<string, SoftwareItem>();
    
    for (const item of payload.items) {
      if (!item.name) continue;
      
      const normalizedName = item.name.trim();
      if (!normalizedName) continue;
      
      const normalizedVersion = (item.version || '').trim() || null;
      const key = `${normalizedName}|${normalizedVersion || 'null'}`;
      
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          name: normalizedName,
          version: normalizedVersion,
          vendor: item.vendor || null,
          install_location: item.install_location || null,
          risk_level: item.risk_level || 'unknown',
        });
      }
    }

    const uniqueItems = Array.from(uniqueMap.values());
    logger.info(`Deduplicated: ${payload.items.length} -> ${uniqueItems.length} unique items`);

    if (uniqueItems.length === 0) {
      logger.info('No valid software items to store after deduplication');
      return new Response(
        JSON.stringify({ success: true, inserted: 0, deduplicated_from: payload.items.length }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limpar inventario anterior do agente
    const { error: deleteError } = await supabase
      .from('software_inventory')
      .delete()
      .eq('agent_id', payload.agent_id);

    if (deleteError) {
      logger.error('Failed to clear old inventory', deleteError);
    }

    // Inserir ou atualizar itens (UPSERT para lidar com duplicatas)
    // Aplicar sanitizacao em cada campo string para evitar erros de Unicode
    const itemsToInsert = uniqueItems.map(item => ({
      tenant_id: agent.tenant_id,
      agent_id: payload.agent_id,
      name: sanitizeString(item.name) || 'Unknown',
      version: sanitizeString(item.version),
      vendor: sanitizeString(item.vendor),
      install_location: sanitizeString(item.install_location),
      risk_level: item.risk_level,
    }));

    const { error: insertError } = await supabase
      .from('software_inventory')
      .upsert(itemsToInsert, { 
        onConflict: 'agent_id,name,version',
        ignoreDuplicates: false 
      });

    if (insertError) {
      logger.error('Failed to upsert software inventory', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to store inventory' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.success(`Software inventory stored: ${uniqueItems.length} unique items (deduplicated from ${payload.items.length})`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        inserted: uniqueItems.length,
        deduplicated_from: payload.items.length
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    logger.error('Software inventory submission failed', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
