import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0';

/**
 * Standard audit logging for Edge Functions.
 * Ensures all sensitive actions are recorded in a tamper-evident log.
 */
export async function createAuditLog(params: {
  supabase: any;
  userId: string;
  tenantId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, any>;
  request?: Request;
  success?: boolean;
}) {
  const { supabase, userId, tenantId, action, resourceType, resourceId, details, request, success = true } = params;

  try {
    const ipAddress = request?.headers.get('x-forwarded-for')?.split(',')[0] || 
                     request?.headers.get('cf-connecting-ip') || 
                     '0.0.0.0';

    const { error } = await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details: {
          ...details,
          user_agent: request?.headers.get('user-agent'),
          ip_address: ipAddress
        },
        success,
        ip_address: ipAddress
      });

    if (error) {
      console.error('[AuditLog] Failed to persist log:', error);
    }
  } catch (err) {
    console.error('[AuditLog] Unexpected error:', err);
  }
}
