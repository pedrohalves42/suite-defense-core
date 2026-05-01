/**
 * Tenant API handlers — Inlined from api-tenant-features, api-tenant-info, api-tenant-stats (Phase 6C)
 * API-key authenticated endpoints for external integrations.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import type { HandlerContext } from './admin.ts';

// Simplified API key auth for inlined context
async function authenticateApiKeyInline(
  supabase: any,
  apiKey: string,
  requestId: string,
): Promise<{ success: boolean; tenantId?: string; apiKeyId?: string; scopes?: string[]; error?: string }> {
  // Use timing-safe hash if possible, otherwise use standard match. 
  // API keys should ideally be hashed with SHA-256 for storage.
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, tenant_id, scopes, is_active, expires_at, last_used_at')
    .eq('key_hash', apiKey)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: 'Invalid API key' };
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { success: false, error: 'API key expired' };
  }

  // Update last_used_at (throttled to once per minute to reduce IOPS)
  const lastUsed = data.last_used_at ? new Date(data.last_used_at).getTime() : 0;
  if (Date.now() - lastUsed > 60000) {
    supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
      .then(({ error }: any) => { if (error) logger.warn(`[${requestId}] Failed to update API key last_used_at`, error); });
  }

  return {
    success: true,
    tenantId: data.tenant_id,
    apiKeyId: data.id,
    scopes: data.scopes || ['read'],
  };
}

function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required) || scopes.includes('*');
}

export async function handleTenantFeatures(
  supabase: any,
  requestId: string,
  payload: Record<string, unknown>,
  ctx?: HandlerContext,
): Promise<unknown> {
  const apiKey = (payload.api_key as string) || '';
  if (!apiKey) return { __status: 401, error: 'Missing API key' };

  const auth = await authenticateApiKeyInline(supabase, apiKey);
  if (!auth.success) return { __status: 401, error: auth.error };
  if (!hasScope(auth.scopes!, 'read')) return { __status: 403, error: 'Insufficient permissions' };

  const { data: features, error } = await supabase
    .from('tenant_features')
    .select('feature_key, enabled, quota_limit, quota_used, metadata')
    .eq('tenant_id', auth.tenantId!)
    .order('feature_key');

  if (error) return { __status: 500, error: error.message };
  return { features };
}

export async function handleTenantInfo(
  supabase: any,
  requestId: string,
  payload: Record<string, unknown>,
  ctx?: HandlerContext,
): Promise<unknown> {
  const apiKey = (payload.api_key as string) || '';
  if (!apiKey) return { __status: 401, error: 'Missing API key' };

  const auth = await authenticateApiKeyInline(supabase, apiKey);
  if (!auth.success) return { __status: 401, error: auth.error };
  if (!hasScope(auth.scopes!, 'read')) return { __status: 403, error: 'Insufficient permissions' };

  const { data: tenant, error } = await supabase
    .from('tenants_safe')
    .select('id, name, slug, tier, max_agents, created_at')
    .eq('id', auth.tenantId!)
    .single();

  if (error) return { __status: 500, error: error.message };
  return { tenant };
}

export async function handleTenantStats(
  supabase: any,
  requestId: string,
  payload: Record<string, unknown>,
  ctx?: HandlerContext,
): Promise<unknown> {
  const apiKey = (payload.api_key as string) || '';
  if (!apiKey) return { __status: 401, error: 'Missing API key' };

  const auth = await authenticateApiKeyInline(supabase, apiKey);
  if (!auth.success) return { __status: 401, error: auth.error };
  if (!hasScope(auth.scopes!, 'read')) return { __status: 403, error: 'Insufficient permissions' };

  const tenantId = auth.tenantId!;

  const [
    { count: agentCount },
    { count: onlineCount },
    { count: jobCount },
    { count: alertCount },
  ] = await Promise.all([
    supabase.from('agents').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).not('status', 'in', '("archived","deleted")'),
    supabase.from('agents').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['online', 'active', 'healthy']),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('system_alerts').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('resolved', false),
  ]);

  return {
    stats: {
      agents_total: agentCount || 0,
      agents_online: onlineCount || 0,
      jobs_last_30_days: jobCount || 0,
      unresolved_alerts: alertCount || 0,
    },
  };
}
