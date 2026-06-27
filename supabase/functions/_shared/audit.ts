import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0';
import { logger } from './logger.ts';

/**
 * Standard audit logging for Edge Functions.
 *
 * HF-AUDIT-CONTRACT-01:
 * `userId` is officially OPTIONAL — pre-authentication paths (enrollment,
 * key validation, HMAC bootstrap, public webhooks) legitimately have no
 * authenticated user. When absent, the column is persisted as NULL, matching
 * the previous runtime behavior. Consumers no longer need local type casts.
 *
 * Forbidden by contract (do NOT change without a separate RFC):
 *  - payload shape / column names
 *  - `actor_type` column (root cause of past incident — must remain absent)
 *  - tenant_id semantics
 *  - timestamp source
 *  - severity / event naming
 *
 * Always include `tenantId` (use `'unknown'` only when truly unresolved at
 * the pre-auth boundary). `success` defaults to `true`.
 */
export interface CreateAuditLogParams {
  // Supabase client (typed loosely to avoid cross-version friction across functions).
  supabase: any;
  /** Optional: undefined on pre-auth flows. Persisted as NULL when absent. */
  userId?: string;
  tenantId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, any>;
  request?: Request;
  success?: boolean;
}

export async function createAuditLog(params: CreateAuditLogParams): Promise<void> {
  const { supabase, userId, tenantId, action, resourceType, resourceId, details, request, success = true } = params;

  try {
    const ipAddress = request?.headers.get('x-forwarded-for')?.split(',')[0] ||
                     request?.headers.get('cf-connecting-ip') ||
                     '0.0.0.0';

    const { error } = await supabase
      .from('audit_logs')
      .insert({
        user_id: userId ?? null,
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
      logger.error('[AuditLog] Failed to persist log', error);
    }
  } catch (err) {
    logger.error('[AuditLog] Unexpected error', err);
  }
}
