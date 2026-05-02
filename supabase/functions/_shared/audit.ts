import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from './logger.ts';

/**
 * Create an audit log entry
 * ADR-029 HIGH-06: tenantId is now required for compliance
 */
export async function createAuditLog({
  supabase,
  userId,
  tenantId,
  action,
  resourceType,
  resourceId,
  details,
  request,
  success = true,
}: {
  supabase: any;
  userId?: string;
  tenantId: string;  // ADR-029 HIGH-06: Now required (removed optional)
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  request: Request;
  success?: boolean;
}) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
    || request.headers.get('x-real-ip')
    || 'unknown';
  const traceId = request.headers.get('X-Trace-ID') || request.headers.get('X-Request-ID') || null;
  const userAgent = request.headers.get('user-agent');

  // ADR-029 HIGH-06: Validate tenantId is provided
  if (!tenantId || tenantId === 'unknown') {
    logger.error('[createAuditLog] CRITICAL: tenantId is required for compliance audit');
    // Still insert for forensic purposes, but flag it
    const { error } = await supabase.from('audit_logs').insert({
      user_id: userId,
      tenant_id: null,
      action: `UNTRACKED_${action}`,
      resource_type: resourceType,
      resource_id: resourceId,
      details: { ...details, _warning: 'Missing tenant_id - compliance violation' },
      ip_address: ip,
      user_agent: userAgent,
      trace_id: traceId,
      success,
    });
    if (error) logger.error('[createAuditLog] CRITICAL: Audit log insert failed', error);
    return;
  }

  const { error } = await supabase.from('audit_logs').insert({
    user_id: userId,
    tenant_id: tenantId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    details,
    ip_address: ip,
    user_agent: userAgent,
    trace_id: traceId,
    success,
  });

  if (error) logger.error('[createAuditLog] Audit log insert failed', error);
}
