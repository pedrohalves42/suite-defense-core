/**
 * Secret Rotation Compliance Handler
 * 
 * Actions:
 *   check:secret-rotation-compliance — Returns compliance status for all tracked secrets
 *   check:record-secret-rotation    — Records a manual rotation event in the audit log
 *
 * Designed for SOC 2 CC6.1 (Access Control) evidence.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

// ── Secret Inventory ────────────────────────────────────────────────────────

interface SecretPolicy {
  name: string;
  category: 'infrastructure' | 'ai-provider' | 'third-party' | 'internal';
  maxAgeDays: number;
  rotatable: boolean;
  notes?: string;
}

const SECRET_POLICIES: SecretPolicy[] = [
  // Infrastructure — managed by platform
  { name: 'SUPABASE_SERVICE_ROLE_KEY', category: 'infrastructure', maxAgeDays: 365, rotatable: false, notes: 'Managed by Lovable Cloud' },
  { name: 'INTERNAL_FUNCTION_SECRET', category: 'internal', maxAgeDays: 180, rotatable: true },
  { name: 'COMPLIANCE_HMAC_SECRET', category: 'internal', maxAgeDays: 180, rotatable: true },
  { name: 'ECDSA_PRIVATE_KEY', category: 'internal', maxAgeDays: 365, rotatable: true, notes: 'Agent signing key' },
  { name: 'ED25519_PRIVATE_KEY', category: 'internal', maxAgeDays: 365, rotatable: true, notes: 'Agent signing key' },
  // AI Providers — free tier, low risk
  { name: 'GROQ_API_KEY', category: 'ai-provider', maxAgeDays: 180, rotatable: true },
  { name: 'CEREBRAS_API_KEY', category: 'ai-provider', maxAgeDays: 180, rotatable: true },
  { name: 'OPENROUTER_API_KEY', category: 'ai-provider', maxAgeDays: 180, rotatable: true },
  { name: 'GOOGLE_GEMINI_API_KEY', category: 'ai-provider', maxAgeDays: 180, rotatable: true },
  { name: 'MISTRAL_API_KEY', category: 'ai-provider', maxAgeDays: 180, rotatable: true },
  { name: 'LOVABLE_API_KEY', category: 'ai-provider', maxAgeDays: 365, rotatable: false, notes: 'Managed by Lovable' },
  // Third-party — higher risk
  { name: 'STRIPE_SECRET_KEY', category: 'third-party', maxAgeDays: 90, rotatable: true, notes: 'Payment processing — high priority' },
  { name: 'STRIPE_WEBHOOK_SECRET', category: 'third-party', maxAgeDays: 90, rotatable: true },
  { name: 'RESEND_API_KEY', category: 'third-party', maxAgeDays: 180, rotatable: true },
  { name: 'TELEGRAM_BOT_TOKEN', category: 'third-party', maxAgeDays: 365, rotatable: true },
  { name: 'TURNSTILE_SECRET_KEY', category: 'third-party', maxAgeDays: 365, rotatable: true },
  // Threat intel
  { name: 'ABUSEIPDB_API_KEY', category: 'third-party', maxAgeDays: 365, rotatable: true },
  { name: 'VIRUSTOTAL_API_KEY', category: 'third-party', maxAgeDays: 365, rotatable: true },
  { name: 'HYBRID_ANALYSIS_API_KEY', category: 'third-party', maxAgeDays: 365, rotatable: true },
  { name: 'ABUSE_CH_API_KEY', category: 'third-party', maxAgeDays: 365, rotatable: true },
];

// ── Compliance Check ────────────────────────────────────────────────────────

interface SecretComplianceStatus {
  name: string;
  category: string;
  maxAgeDays: number;
  rotatable: boolean;
  lastRotatedAt: string | null;
  daysSinceRotation: number | null;
  isCompliant: boolean;
  daysUntilExpiry: number | null;
  status: 'compliant' | 'warning' | 'overdue' | 'never_rotated' | 'not_tracked';
  notes?: string;
}

export async function handleSecretRotationCompliance(
  supabase: SupabaseClient,
  requestId: string,
  _payload: Record<string, unknown>,
): Promise<unknown> {
  logger.info(`[${requestId}] check:secret-rotation-compliance`);

  // Fetch all rotation records
  const { data: rotations, error } = await supabase
    .from('secret_rotation_log')
    .select('secret_name, rotated_at, status')
    .eq('status', 'completed')
    .order('rotated_at', { ascending: false });

  if (error) {
    logger.warn(`[${requestId}] Failed to fetch rotation log:`, error.message);
  }

  // Build a map of latest rotation per secret
  const latestRotation: Record<string, string> = {};
  for (const r of rotations || []) {
    if (!latestRotation[r.secret_name]) {
      latestRotation[r.secret_name] = r.rotated_at;
    }
  }

  const now = Date.now();
  const results: SecretComplianceStatus[] = [];
  let compliantCount = 0;
  let warningCount = 0;
  let overdueCount = 0;
  let neverRotatedCount = 0;

  for (const policy of SECRET_POLICIES) {
    const lastRotated = latestRotation[policy.name] || null;
    let daysSinceRotation: number | null = null;
    let daysUntilExpiry: number | null = null;
    let status: SecretComplianceStatus['status'];
    let isCompliant: boolean;

    if (lastRotated) {
      daysSinceRotation = Math.floor((now - new Date(lastRotated).getTime()) / (1000 * 60 * 60 * 24));
      daysUntilExpiry = policy.maxAgeDays - daysSinceRotation;

      if (daysUntilExpiry <= 0) {
        status = 'overdue';
        isCompliant = false;
        overdueCount++;
      } else if (daysUntilExpiry <= 30) {
        status = 'warning';
        isCompliant = true;
        warningCount++;
      } else {
        status = 'compliant';
        isCompliant = true;
        compliantCount++;
      }
    } else if (!policy.rotatable) {
      // Non-rotatable secrets managed by platform are always "compliant"
      status = 'compliant';
      isCompliant = true;
      compliantCount++;
    } else {
      status = 'never_rotated';
      isCompliant = false;
      neverRotatedCount++;
    }

    results.push({
      name: policy.name,
      category: policy.category,
      maxAgeDays: policy.maxAgeDays,
      rotatable: policy.rotatable,
      lastRotatedAt: lastRotated,
      daysSinceRotation,
      isCompliant,
      daysUntilExpiry,
      status,
      notes: policy.notes,
    });
  }

  const overallCompliant = overdueCount === 0;

  return {
    checkedAt: new Date().toISOString(),
    overallCompliant,
    summary: {
      total: results.length,
      compliant: compliantCount,
      warning: warningCount,
      overdue: overdueCount,
      neverRotated: neverRotatedCount,
    },
    secrets: results,
  };
}

// ── Record Rotation Event ───────────────────────────────────────────────────

export async function handleRecordSecretRotation(
  supabase: SupabaseClient,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const secretName = payload.secret_name as string;
  const rotatedBy = (payload.rotated_by as string) || 'admin';
  const method = (payload.method as string) || 'manual';
  const previousPrefix = payload.previous_key_prefix as string | undefined;
  const newPrefix = payload.new_key_prefix as string | undefined;
  const overlapMinutes = (payload.overlap_minutes as number) || 60;
  const notes = payload.notes as string | undefined;
  const tenantId = payload.tenant_id as string | undefined;

  if (!secretName) {
    return { error: 'secret_name is required' };
  }

  // Validate secret name exists in policy
  const policy = SECRET_POLICIES.find(p => p.name === secretName);
  if (!policy) {
    return { error: `Unknown secret: ${secretName}. Valid secrets: ${SECRET_POLICIES.map(p => p.name).join(', ')}` };
  }

  const overlapExpiresAt = new Date(Date.now() + overlapMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('secret_rotation_log')
    .insert({
      secret_name: secretName,
      rotated_by: rotatedBy,
      rotation_method: method,
      previous_key_prefix: previousPrefix || null,
      new_key_prefix: newPrefix || null,
      overlap_expires_at: overlapExpiresAt,
      status: 'completed',
      notes: notes || null,
      tenant_id: tenantId || null,
    })
    .select('id, rotated_at')
    .single();

  if (error) {
    logger.error(`[${requestId}] Failed to record rotation:`, error.message);
    return { error: 'Failed to record rotation', details: error.message };
  }

  logger.info(`[${requestId}] Recorded rotation for ${secretName} by ${rotatedBy}`);

  return {
    success: true,
    rotationId: data.id,
    rotatedAt: data.rotated_at,
    overlapExpiresAt,
    message: `Rotation recorded for ${secretName}. Previous key remains valid until ${overlapExpiresAt}.`,
  };
}
