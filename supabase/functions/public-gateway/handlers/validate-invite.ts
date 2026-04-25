/**
 * validate-invite handler — Inlined into public-gateway (Phase 6D)
 * Validates invite tokens WITHOUT exposing sensitive data to frontend.
 */
import { logger } from '../../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const ValidateInviteSchema = z.object({
  token: z.string().min(10).max(512),
});

interface SafeInviteData {
  email: string;
  role: string;
  expires_at: string;
  tenant_name: string | null;
  is_valid: boolean;
  error_code?: string;
}

export async function handleValidateInvite(
  supabase: any,
  _req: Request,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const parsed = ValidateInviteSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      error: 'Token invalido',
      issues: parsed.error.flatten().fieldErrors,
      __status: 400,
    };
  }
  const { token } = parsed.data;

  const { data: invite, error: inviteError } = await supabase
    .from('invites')
    .select('email, role, expires_at, status, tenant_id')
    .eq('token', token)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inviteError) {
    logger.error(`[${requestId}] Database error`, inviteError as Error);
    return { error: 'Erro ao validar convite', __status: 500 };
  }

  if (!invite) {
    const response: SafeInviteData = {
      email: '',
      role: '',
      expires_at: '',
      tenant_name: null,
      is_valid: false,
      error_code: 'NOT_FOUND',
    };
    return response as unknown as Record<string, unknown>;
  }

  let tenantName: string | null = null;
  if (invite.tenant_id) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', invite.tenant_id)
      .maybeSingle();
    tenantName = tenant?.name || null;
  }

  const isExpired = new Date(invite.expires_at) < new Date();

  const response: SafeInviteData = {
    email: invite.email,
    role: invite.role,
    expires_at: invite.expires_at,
    tenant_name: tenantName,
    is_valid: !isExpired,
    error_code: isExpired ? 'EXPIRED' : undefined,
  };

  logger.info(`[${requestId}] Invite validated: ${invite.email}, valid: ${response.is_valid}`);
  return response as unknown as Record<string, unknown>;
}
