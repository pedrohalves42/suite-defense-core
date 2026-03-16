/**
 * recover-agent-credentials Edge Function
 * 
 * Regenerates fresh credentials (token + HMAC) for an existing agent.
 * Used by the reinstall-preserve script v2.8.0 when local credential
 * extraction fails (e.g., task already deleted on v4.x agents).
 * 
 * Auth: Requires user JWT with admin/operator/super_admin role.
 * 
 * POST /functions/v1/recover-agent-credentials
 * Body: { "agent_name": "pcteste1" }
 * Response: { "agentToken": "uuid", "hmacSecret": "hex64", "agentName": "..." }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { hashToken } from '../_shared/token-hash.ts';

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Auth: validate user JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      console.error(`[${requestId}] Auth failed:`, authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check role - respect active tenant from JWT
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get active tenant from JWT app_metadata (set by tenant switcher)
    const activeTenantId = user.app_metadata?.active_tenant_id;

    // Try to find role for the active tenant first, fallback to any role
    let userRole: { role: string; tenant_id: string } | null = null;

    if (activeTenantId) {
      const { data: activeRole } = await adminClient
        .from('user_roles')
        .select('role, tenant_id')
        .eq('user_id', user.id)
        .eq('tenant_id', activeTenantId)
        .maybeSingle();
      userRole = activeRole;
    }

    // Fallback: check if super_admin (any tenant)
    if (!userRole) {
      const { data: anyRole } = await adminClient
        .from('user_roles')
        .select('role, tenant_id')
        .eq('user_id', user.id)
        .in('role', ['super_admin'])
        .limit(1)
        .maybeSingle();
      userRole = anyRole;
    }

    // Final fallback: first role found
    if (!userRole) {
      const { data: fallbackRole, error: roleError } = await adminClient
        .from('user_roles')
        .select('role, tenant_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (roleError) console.error(`[${requestId}] Role check failed:`, roleError?.message);
      userRole = fallbackRole;
    }

    if (!userRole) {
      console.error(`[${requestId}] No role found for user ${user.id}`);
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] User ${user.email} role=${userRole.role} tenant=${userRole.tenant_id} activeTenant=${activeTenantId}`);

    const allowedRoles = ['admin', 'operator', 'super_admin'];
    if (!allowedRoles.includes(userRole.role)) {
      console.warn(`[${requestId}] Insufficient role: ${userRole.role}`);
      return new Response(
        JSON.stringify({ error: 'Forbidden: insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse body
    const body = await req.json();
    const agentName = body.agent_name?.trim();

    if (!agentName || typeof agentName !== 'string' || agentName.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Invalid agent_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] Recovery request for agent: ${agentName} by user: ${user.email}`);

    // Find agent - enforce tenant isolation using active tenant
    const effectiveTenantId = activeTenantId || userRole.tenant_id;

    let query = adminClient
      .from('agents')
      .select('id, agent_name, hmac_secret, tenant_id')
      .eq('agent_name', agentName);

    if (userRole.role !== 'super_admin') {
      query = query.eq('tenant_id', effectiveTenantId);
    } else if (activeTenantId) {
      // Super admin with active tenant selected - scope to that tenant
      query = query.eq('tenant_id', activeTenantId);
    }

    const { data: agent, error: agentError } = await query.maybeSingle();

    if (agentError || !agent) {
      console.warn(`[${requestId}] Agent not found: ${agentName}`);
      return new Response(
        JSON.stringify({ error: 'Agent not found in your tenant' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate fresh token
    const freshToken = crypto.randomUUID();
    const tokenHash = await hashToken(freshToken);
    const tokenPrefix = freshToken.substring(0, 8);

    // Deactivate old tokens
    await adminClient
      .from('agent_tokens')
      .update({ is_active: false })
      .eq('agent_id', agent.id);

    // Create new token
    const tokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const { error: tokenError } = await adminClient
      .from('agent_tokens')
      .insert({
        agent_id: agent.id,
        tenant_id: agent.tenant_id,
        token_hash: tokenHash,
        token_prefix: tokenPrefix,
        expires_at: tokenExpiresAt,
        is_active: true,
      });

    if (tokenError) {
      console.error(`[${requestId}] Token creation failed:`, tokenError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Audit log
    await adminClient.from('audit_logs').insert({
      user_id: user.id,
      action: 'recover_agent_credentials',
      resource_type: 'agent',
      resource_id: agent.id,
      tenant_id: agent.tenant_id,
      details: {
        agent_name: agentName,
        token_prefix: tokenPrefix,
        reason: 'reinstall_preserve_recovery',
      },
      success: true,
    });

    console.log(`[${requestId}] Credentials recovered for ${agentName} (prefix: ${tokenPrefix})`);

    return new Response(
      JSON.stringify({
        agentToken: freshToken,
        hmacSecret: agent.hmac_secret,
        agentName: agent.agent_name,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
