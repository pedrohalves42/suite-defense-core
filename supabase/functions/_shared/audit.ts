import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

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
  supabase: SupabaseClient;
  userId?: string;
  tenantId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  request: Request;
  success?: boolean;
}) {
  await supabase.from('audit_logs').insert({
    user_id: userId,
    tenant_id: tenantId || null,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    details,
    ip_address: request.headers.get('x-forwarded-for'),
    user_agent: request.headers.get('user-agent'),
    success,
  });
}
