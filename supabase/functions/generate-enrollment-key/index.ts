import { serveTenant } from '../_shared/serve-tenant.ts';
import { corsHeaders } from '../_shared/error-handler.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const GenerateKeySchema = z.object({
  expiresInHours: z.number().positive().int(),
  maxUses: z.number().positive().int().optional().default(1),
  description: z.string().max(500).optional(),
});

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, userId, requestId, body } = ctx;

  // Role check
  const { data: userRole, error: rolesError } = await supabase
    .from('user_roles')
    .select('role, tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (rolesError || !userRole) {
    logger.error(`[${requestId}] Error fetching user role:`, rolesError);
    throw new Error('Forbidden');
  }

  if (userRole.role !== 'admin' && userRole.role !== 'operator' && userRole.role !== 'super_admin') {
    logger.warn(`[${requestId}] User ${userId} does not have permission, role:`, userRole.role);
    throw new Error('Forbidden: only admins, operators, and super admins can generate keys');
  }

  logger.info(`[${requestId}] User ${userId} authorized with role:`, userRole.role);

  const validatedData = GenerateKeySchema.parse(body);
  const { expiresInHours, maxUses, description } = validatedData;

  // Generate key XXXX-XXXX-XXXX-XXXX (cryptographically secure)
  const generateKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments = [];
    for (let i = 0; i < 4; i++) {
      const randomBytes = new Uint8Array(4);
      crypto.getRandomValues(randomBytes);
      let segment = '';
      for (let j = 0; j < 4; j++) {
        segment += chars[randomBytes[j] % chars.length];
      }
      segments.push(segment);
    }
    return segments.join('-');
  };

  const enrollmentKey = generateKey();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  // SEC-001: Calculate SHA-256 hash - never store plaintext key
  const keyHashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(enrollmentKey)
  );
  const keyHash = Array.from(new Uint8Array(keyHashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const { data: keyData, error: insertError } = await supabase
    .from('enrollment_keys')
    .insert({
      key_hash: keyHash,
      created_by: userId,
      expires_at: expiresAt,
      max_uses: maxUses,
      description: description || `Chave gerada por usuario`,
      tenant_id: tenantId,
    })
    .select()
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (insertError) {
    throw new Error('Failed to create enrollment key');
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'create_enrollment_key',
    resource_type: 'enrollment_key',
    resource_id: keyData.id,
    tenant_id: tenantId,
    details: { expiresInHours, maxUses, description: keyData.description },
    success: true,
  });

  logger.info(`[${requestId}] Enrollment key created`);

  return new Response(
    JSON.stringify({
      enrollmentKey: enrollmentKey,
      expiresAt: keyData.expires_at,
      maxUses: keyData.max_uses,
      description: keyData.description,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
