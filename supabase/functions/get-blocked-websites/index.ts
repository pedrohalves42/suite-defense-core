import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { logger } from '../_shared/logger.ts';
import { hashToken } from '../_shared/token-hash.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Agent authentication via HMAC
    const agentToken = req.headers.get('X-Agent-Token');
    if (!agentToken) {
      return new Response(JSON.stringify({ error: 'Missing agent token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find agent via token hash (P0 security fix)
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
      logger.warn('Invalid agent token for blocked websites request');
      return new Response(JSON.stringify({ error: 'Invalid agent token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const agent = tokenData.agents as any;

    // Validate HMAC
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

    // Fetch blocked websites for this tenant
    const { data: blockedSites, error: blockedError } = await supabase
      .from('blocked_websites')
      .select('domain_pattern, reason')
      .eq('tenant_id', agent.tenant_id)
      .eq('is_active', true);

    if (blockedError) {
      logger.error('Failed to fetch blocked websites', blockedError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch blocked websites' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Also fetch from security_policy_rules with website_block type
    const { data: policyRules, error: rulesError } = await supabase
      .from('security_policy_rules')
      .select(`
        target,
        conditions,
        security_policies!inner (
          tenant_id,
          is_active
        )
      `)
      .eq('rule_type', 'website_block')
      .eq('action', 'block')
      .eq('is_enabled', true);

    // Build blocked_websites array with domain_pattern (format expected by agent)
    const blockedWebsites: Array<{ domain_pattern: string; reason: string | null }> = [];
    
    // From blocked_websites table
    if (blockedSites) {
      for (const site of blockedSites) {
        if (site.domain_pattern) {
          blockedWebsites.push({
            domain_pattern: site.domain_pattern,
            reason: site.reason
          });
        }
      }
    }

    // From security policies (filter by tenant)
    if (policyRules && !rulesError) {
      for (const rule of policyRules) {
        const policy = rule.security_policies as any;
        if (policy?.tenant_id === agent.tenant_id && policy?.is_active && rule.target) {
          blockedWebsites.push({
            domain_pattern: rule.target,
            reason: 'Security policy rule'
          });
        }
      }
    }

    // Deduplicate by domain_pattern
    const seen = new Set<string>();
    const uniqueBlockedWebsites = blockedWebsites.filter(site => {
      if (seen.has(site.domain_pattern)) return false;
      seen.add(site.domain_pattern);
      return true;
    });

    // Also provide simple array for backward compatibility
    const blockedDomains = uniqueBlockedWebsites.map(site => site.domain_pattern);

    logger.info(`Returning ${uniqueBlockedWebsites.length} blocked domains for agent ${agent.agent_name}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        blocked_websites: uniqueBlockedWebsites,  // Array of { domain_pattern, reason } - expected by agent
        blocked_domains: blockedDomains,           // Simple array for backward compatibility
        count: uniqueBlockedWebsites.length,
        synced_at: new Date().toISOString()
      }), 
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    logger.error('Get blocked websites failed', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
