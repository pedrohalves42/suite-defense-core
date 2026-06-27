/**
 * Agent ops handlers — Phase 2J
 * Hardened: token-rotate, recover-agent-credentials, agent-version-management
 */
import { logger } from '../../_shared/logger.ts';
import { hashToken, getTokenPrefix } from '../../_shared/token-hash.ts';
import type { HandlerContext } from './admin.ts';

type Supabase = any;

async function generateSecureToken(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

const TOKEN_TTL_DAYS = 30;
const RECOVERY_TOKEN_TTL_DAYS = 365;

// ── token-rotate ───────────────────────────────────────────────────────
export async function handleTokenRotate(
  supabase: Supabase, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { _user_id: ctx?.userId });
  const tenantId = (isSuperAdmin && (payload.tenant_id as string)) || ctx?.tenantId;
  if (!tenantId) return { __status: 400, error: 'tenant_id required' };
  
  const action = payload.action as string || 'needs-rotation';

  if (action === 'needs-rotation') {
    const { data: tokens, error } = await supabase.from('agent_tokens')
      .select('agent_id, id, created_at, expires_at')
      .eq('is_active', true)
      .eq('tenant_id', tenantId)
      .lt('expires_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());
    if (error) throw error;
    return { 
      needs_rotation: tokens?.length || 0, 
      tokens: tokens?.map(t => ({ 
        agentId: t.agent_id, 
        id: t.id, 
        expiresAt: t.expires_at, 
        createdAt: t.created_at 
      })) 
    };
  }

  if (action === 'generate') {
    const agentId = payload.agentId as string;
    if (!agentId) return { __status: 400, error: 'agentId required' };
    
    // Verify agent belongs to tenant
    const { data: agent, error: agentError } = await supabase.from('agents')
      .select('id')
      .eq('id', agentId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    
    if (agentError || !agent) return { __status: 404, error: 'Agent not found in your tenant' };

    const agentToken = await generateSecureToken();
    const tokenHash = await hashToken(agentToken);
    const tokenPrefix = getTokenPrefix(agentToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    
    // Deactivate old tokens for this agent
    await supabase.from('agent_tokens')
      .update({ is_active: false })
      .eq('agent_id', agentId)
      .eq('tenant_id', tenantId);

    const { data: newToken, error: insertError } = await supabase.from('agent_tokens').insert({
      agent_id: agentId, 
      tenant_id: tenantId, 
      token_hash: tokenHash,
      token_prefix: tokenPrefix, 
      expires_at: expiresAt, 
      is_active: true,
    }).select('id').single();
    
    if (insertError) throw insertError;
    return { token: agentToken, id: newToken.id, expires_at: expiresAt };
  }

  if (action === 'revoke') {
    const agentId = payload.agentId as string;
    if (!agentId) return { __status: 400, error: 'agentId required' };
    
    const { error } = await supabase.from('agent_tokens')
      .update({ is_active: false })
      .eq('agent_id', agentId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true);
    
    if (error) throw error;
    return { success: true };
  }

  return { __status: 400, error: 'Unknown action' };
}

// ── recover-agent-credentials ──────────────────────────────────────────
export async function handleRecoverAgentCredentials(
  supabase: Supabase, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const userId = ctx?.userId;
  const tenantId = ctx?.tenantId;
  if (!userId) return { __status: 401, error: 'Authentication required' };

  const agentName = (payload.agent_name as string || '').trim();
  if (!agentName) return { __status: 400, error: 'agent_name is required' };

  // Role check
  const { data: userRole } = await supabase.from('user_roles').select('role')
    .eq('user_id', userId).eq('tenant_id', tenantId).maybeSingle();
  if (!userRole || !['admin', 'operator', 'super_admin'].includes(userRole.role)) {
    return { __status: 403, error: 'Forbidden: insufficient permissions' };
  }

  const { data: agent, error: agentError } = await supabase.from('agents')
    .select('id, agent_name, hmac_secret, tenant_id')
    .eq('agent_name', agentName)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  
  if (agentError || !agent) return { __status: 404, error: 'Agent not found in your tenant' };

  const freshToken = await generateSecureToken();
  const tokenHash = await hashToken(freshToken);
  const tokenPrefix = getTokenPrefix(freshToken);

  // Deactivate existing tokens
  await supabase.from('agent_tokens')
    .update({ is_active: false })
    .eq('agent_id', agent.id)
    .eq('tenant_id', tenantId);

  const tokenExpiresAt = new Date(Date.now() + RECOVERY_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error: tokenError } = await supabase.from('agent_tokens').insert({
    agent_id: agent.id, 
    tenant_id: agent.tenant_id, 
    token_hash: tokenHash,
    token_prefix: tokenPrefix, 
    expires_at: tokenExpiresAt, 
    is_active: true,
  });
  
  if (tokenError) {
    logger.error(`[${requestId}] Failed to insert recovery token`, tokenError);
    return { __status: 500, error: 'Failed to generate credentials' };
  }

  await supabase.from('audit_logs').insert({
    user_id: userId, 
    action: 'recover_agent_credentials', 
    resource_type: 'agent',
    resource_id: agent.id, 
    tenant_id: agent.tenant_id,
    details: { 
      agent_name: agentName, 
      token_prefix: tokenPrefix, 
      reason: 'reinstall_preserve_recovery' 
    }, 
    success: true,
  });

  return { agentToken: freshToken, hmacSecret: agent.hmac_secret, agentName: agent.agent_name };
}

// ── agent-version-management ───────────────────────────────────────────
function parseVersion(v: string): number[] {
  const parts = (v ?? '0.0.0').replace(/^v/i, '').split('.').map(n => parseInt(n, 10));
  while (parts.length < 3) parts.push(0);
  return parts.map(n => isNaN(n) ? 0 : n);
}

function versionGap(current: string, latest: string): number {
  const c = parseVersion(current);
  const l = parseVersion(latest);
  // Major diff is highest weight, then minor, then patch
  // This helps identify significant version drift
  return (l[0] - c[0]) * 10000 + (l[1] - c[1]) * 100 + (l[2] - c[2]);
}

async function latestActiveVersion(supabase: Supabase): Promise<string> {
  const { data } = await supabase.from('agent_releases_public')
    .select('version')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.version ?? 'v5.0.15';
}

async function getFleetCompliance(supabase: Supabase, tenantId?: string) {
  let q = supabase.from('agents_safe')
    .select('id, tenant_id, agent_version, last_seen_at, status')
    .in('status', ['active', 'online', 'idle']);
  
  if (tenantId) q = q.eq('tenant_id', tenantId);
  
  const { data: agents, error } = await q;
  if (error) throw error;

  const latest = await latestActiveVersion(supabase);
  const byVersion: Record<string, number> = {};
  const outdated: any[] = [];

  for (const a of agents ?? []) {
    const ver = a.agent_version ?? 'unknown';
    byVersion[ver] = (byVersion[ver] || 0) + 1;
    if (versionGap(ver, latest) > 2) {
      outdated.push({ 
        agent_id: a.id, 
        tenant_id: a.tenant_id, 
        version: ver, 
        gap: versionGap(ver, latest), 
        last_seen: a.last_seen_at 
      });
    }
  }

  const total = agents?.length ?? 0;
  return {
    latest_version: latest, 
    total_agents: total, 
    compliant: total - outdated.length,
    outdated: outdated.length, 
    compliance_pct: total > 0 ? Math.round(((total - outdated.length) / total) * 100) : 100,
    by_version: byVersion, 
    agents_needing_update: outdated.slice(0, 200),
  };
}

export async function handleAgentVersionManagement(
  supabase: Supabase, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const action = (payload.action as string) || 'fleet-compliance';
  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { _user_id: ctx?.userId });
  const tenantId = (isSuperAdmin && (payload.tenant_id as string)) || ctx?.tenantId;

  if (action === 'fleet-compliance') return getFleetCompliance(supabase, tenantId);

  if (action === 'enforce-update') {
    const dryRun = payload.dry_run !== false;
    const compliance = await getFleetCompliance(supabase, tenantId);
    const latest = compliance.latest_version;
    let scheduled = 0, failed = 0;
    const details: any[] = [];

    for (const agent of compliance.agents_needing_update) {
      if (dryRun) { 
        details.push({ agent_id: agent.agent_id, version: agent.version, action: 'would_schedule' }); 
        continue; 
      }
      try {
        await supabase.from('agent_update_events').insert({
          agent_id: agent.agent_id, 
          tenant_id: agent.tenant_id,
          current_version: agent.version, 
          target_version: latest, 
          status: 'forced', 
          triggered_by: 'version_enforcement',
        });
        scheduled++;
        details.push({ agent_id: agent.agent_id, action: 'scheduled' });
      } catch (e: unknown) {
        failed++;
        details.push({ agent_id: agent.agent_id, action: 'failed', error: (e as Error).message });
      }
    }
    return { dry_run: dryRun, scheduled, failed, details: details.slice(0, 50) };
  }

  if (action === 'set-min-version') {
    if (!tenantId) return { __status: 400, error: 'tenant_id required' };
    const minVersion = payload.min_version as string;
    if (!minVersion) return { __status: 400, error: 'min_version required' };
    const { error } = await supabase.from('tenant_version_policies')
      .upsert({ 
        tenant_id: tenantId, 
        min_version: minVersion, 
        reason: (payload.reason as string) || '', 
        updated_at: new Date().toISOString() 
      }, { onConflict: 'tenant_id' });
    if (error) throw error;
    return { success: true, tenant_id: tenantId, min_version: minVersion };
  }

  return { __status: 400, error: 'Unknown action' };
}