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

    // Combine blocked sites from both sources
    const allBlockedDomains: string[] = [];
    
    // From blocked_websites table
    if (blockedSites) {
      for (const site of blockedSites) {
        if (site.domain_pattern) {
          allBlockedDomains.push(site.domain_pattern);
        }
      }
    }

    // From security policies (filter by tenant)
    if (policyRules && !rulesError) {
      for (const rule of policyRules) {
        const policy = rule.security_policies as any;
        if (policy?.tenant_id === agent.tenant_id && policy?.is_active && rule.target) {
          allBlockedDomains.push(rule.target);
        }
      }
    }

    // Deduplicate
    const uniqueBlockedDomains = [...new Set(allBlockedDomains)];

    logger.info(`Returning ${uniqueBlockedDomains.length} blocked domains for agent ${agent.agent_name}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        blocked_domains: uniqueBlockedDomains,
        count: uniqueBlockedDomains.length,
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
