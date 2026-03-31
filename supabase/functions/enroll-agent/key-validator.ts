/**
 * Enrollment key validation logic
 * Extraído de enroll-agent/index.ts para modularização
 */
import { createAuditLog } from '../_shared/audit.ts';
import { getTokenPrefix } from '../_shared/token-hash.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

interface KeyValidationResult {
  valid: boolean;
  response?: Response;
  keyData?: Record<string, any>;
}

/**
 * Hash an enrollment key using SHA-256
 */
export async function hashEnrollmentKey(enrollmentKey: string): Promise<string> {
  const keyHashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(enrollmentKey)
  );
  return Array.from(new Uint8Array(keyHashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validates an enrollment key: checks hash match, expiration, and usage limits.
 */
export async function validateEnrollmentKey(
  supabase: SupabaseClient,
  enrollmentKey: string,
  agentName: string,
  requestId: string,
  req: Request,
  origin: string | null,
): Promise<KeyValidationResult> {
  const enrollmentKeyHash = await hashEnrollmentKey(enrollmentKey);

  const { data: keyData, error: keyError } = await supabase
    .from('enrollment_keys')
    .select('*')
    .eq('key_hash', enrollmentKeyHash)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (keyError || !keyData) {
    logger.warn(`[${requestId}] Invalid enrollment key`);
    await createAuditLog({
      supabase,
      tenantId: 'unknown',
      action: 'agent_enrollment_failed',
      resourceType: 'agent',
      resourceId: agentName,
      details: { reason: 'invalid_key', key_prefix: getTokenPrefix(enrollmentKey) },
      request: req,
      success: false,
    });

    return {
      valid: false,
      response: new Response(
        JSON.stringify({
          error: 'Chave de enrollment invalida ou nao encontrada',
          code: 'INVALID_ENROLLMENT_KEY',
          requestId,
        }),
        { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      ),
    };
  }

  // Check expiration
  if (new Date(keyData.expires_at) < new Date()) {
    logger.warn(`[${requestId}] Expired enrollment key`);
    await createAuditLog({
      supabase,
      tenantId: keyData.tenant_id,
      action: 'agent_enrollment_failed',
      resourceType: 'agent',
      resourceId: agentName,
      details: { reason: 'expired_key', key_id: keyData.id, expired_at: keyData.expires_at },
      request: req,
      success: false,
    });

    return {
      valid: false,
      response: new Response(
        JSON.stringify({
          error: 'Chave de enrollment expirada',
          code: 'EXPIRED_ENROLLMENT_KEY',
          expiredAt: keyData.expires_at,
          requestId,
        }),
        { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      ),
    };
  }

  // Check usage limit
  if (keyData.max_uses !== null && keyData.current_uses >= keyData.max_uses) {
    logger.warn(`[${requestId}] Key usage limit exceeded`);
    await createAuditLog({
      supabase,
      tenantId: keyData.tenant_id,
      action: 'agent_enrollment_failed',
      resourceType: 'agent',
      resourceId: agentName,
      details: { reason: 'max_uses_exceeded', key_id: keyData.id, current: keyData.current_uses, max: keyData.max_uses },
      request: req,
      success: false,
    });

    return {
      valid: false,
      response: new Response(
        JSON.stringify({
          error: 'Limite de uso da chave atingido',
          code: 'KEY_USAGE_EXCEEDED',
          currentUses: keyData.current_uses,
          maxUses: keyData.max_uses,
          requestId,
        }),
        { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      ),
    };
  }

  return { valid: true, keyData };
}
