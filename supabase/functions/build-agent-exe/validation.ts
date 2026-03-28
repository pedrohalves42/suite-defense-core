import { z } from 'https://esm.sh/zod@3.23.8';
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

export const BuildRequestSchema = z.object({
  agent_name: z.string().min(1, 'agent_name is required').max(255),
  enrollment_key: z.string().min(1, 'enrollment_key is required'),
});

export type BuildRequest = z.infer<typeof BuildRequestSchema>;

export interface EnrollmentValidation {
  enrollmentId: string;
  agentId: string;
  tenantId: string;
  agentToken: string;
}

export interface AgentCredentials {
  agentName: string;
  hmacSecret: string;
}

/**
 * Validate enrollment key and verify user has access to the tenant.
 */
export async function validateEnrollment(
  supabase: SupabaseClient,
  enrollmentKey: string,
  userId: string,
  requestId: string
): Promise<{ data?: EnrollmentValidation; error?: string; status?: number }> {
  const { data: enrollmentData, error: enrollmentError } = await supabase
    .from('enrollment_keys')
    .select('id, agent_id, tenant_id, is_active, expires_at, agent_token')
    .eq('key', enrollmentKey)
    .maybeSingle();

  if (enrollmentError || !enrollmentData || !enrollmentData.is_active) {
    return { error: 'Invalid or expired enrollment key', status: 400 };
  }

  // V-4006 FIX: Validate user belongs to the enrollment key's tenant
  const { data: userTenantRole } = await supabase
    .from('user_roles')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('tenant_id', enrollmentData.tenant_id)
    .maybeSingle();

  if (!userTenantRole) {
    logger.warn(`[SECURITY] User ${userId} tried to build agent for unauthorized tenant ${enrollmentData.tenant_id}`);
    return { error: 'Access denied: enrollment key belongs to different tenant', status: 403 };
  }

  if (!enrollmentData.agent_token) {
    return { error: 'Agent token not available. Please generate a new enrollment key.', status: 400 };
  }

  return {
    data: {
      enrollmentId: enrollmentData.id,
      agentId: enrollmentData.agent_id,
      tenantId: enrollmentData.tenant_id,
      agentToken: enrollmentData.agent_token,
    },
  };
}

/**
 * Fetch agent credentials (name, hmac_secret).
 */
export async function fetchAgentCredentials(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ data?: AgentCredentials; error?: string }> {
  const { data: agentData } = await supabase
    .from('agents')
    .select('agent_name, hmac_secret')
    .eq('id', agentId)
    .maybeSingle();

  if (!agentData) {
    return { error: 'Agent credentials incomplete' };
  }

  return {
    data: {
      agentName: agentData.agent_name,
      hmacSecret: agentData.hmac_secret,
    },
  };
}
