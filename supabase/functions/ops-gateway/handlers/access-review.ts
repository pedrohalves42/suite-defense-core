// @ts-nocheck
/**
 * access-review.ts — Periodic Access Review (SOC 2 CC6.3)
 * 
 * Generates a report of active users, roles, and last login per tenant.
 * Inserts evidence into audit_logs with action = 'access_review'.
 * Restricted to admin/super_admin via ops-gateway auth.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

interface AccessReviewUser {
  user_id: string;
  email: string | null;
  full_name: string | null;
  roles: string[];
  last_sign_in: string | null;
  is_active: boolean;
}

interface AccessReviewReport {
  review_date: string;
  tenant_id: string;
  total_users: number;
  active_users: number;
  inactive_users: number;
  role_distribution: Record<string, number>;
  users: AccessReviewUser[];
  soc2_control: string;
}

export async function handleAccessReview(
  supabase: any,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const tenantId = payload.tenant_id as string;
  if (!tenantId) {
    return { error: 'tenant_id required', __status: 400 };
  }

  logger.info(`[access-review][${requestId}] Starting periodic access review for tenant ${tenantId}`);

  // 1. Fetch all user roles for this tenant
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .eq('tenant_id', tenantId);

  if (rolesError) {
    logger.error(`[access-review][${requestId}] Failed to fetch user_roles:`, rolesError);
    return { error: 'Failed to fetch roles', __status: 500 };
  }

  // 2. Fetch profiles for these users
  const userIds = [...new Set((userRoles || []).map(r => r.user_id))];
  
  if (userIds.length === 0) {
    const emptyReport: AccessReviewReport = {
      review_date: new Date().toISOString(),
      tenant_id: tenantId,
      total_users: 0,
      active_users: 0,
      inactive_users: 0,
      role_distribution: {},
      users: [],
      soc2_control: 'CC6.3',
    };

    await insertAuditEvidence(supabase, tenantId, requestId, emptyReport);
    return { success: true, report: emptyReport };
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email, full_name, last_sign_in_at, is_active')
    .in('id', userIds);

  if (profilesError) {
    logger.error(`[access-review][${requestId}] Failed to fetch profiles:`, profilesError);
    return { error: 'Failed to fetch profiles', __status: 500 };
  }

  // 3. Build user report
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));
  const roleDistribution: Record<string, number> = {};

  const users: AccessReviewUser[] = userIds.map(uid => {
    const profile = profileMap.get(uid);
    const roles = (userRoles || []).filter(r => r.user_id === uid).map(r => r.role);
    
    roles.forEach(role => {
      roleDistribution[role] = (roleDistribution[role] || 0) + 1;
    });

    return {
      user_id: uid,
      email: profile?.email || null,
      full_name: profile?.full_name || null,
      roles,
      last_sign_in: profile?.last_sign_in_at || null,
      is_active: profile?.is_active ?? true,
    };
  });

  const activeUsers = users.filter(u => u.is_active);
  const inactiveUsers = users.filter(u => !u.is_active);

  const report: AccessReviewReport = {
    review_date: new Date().toISOString(),
    tenant_id: tenantId,
    total_users: users.length,
    active_users: activeUsers.length,
    inactive_users: inactiveUsers.length,
    role_distribution: roleDistribution,
    users,
    soc2_control: 'CC6.3',
  };

  // 4. Insert audit evidence
  await insertAuditEvidence(supabase, tenantId, requestId, report);

  logger.info(`[access-review][${requestId}] Access review completed: ${users.length} users reviewed`);

  return { success: true, report };
}

async function insertAuditEvidence(
  supabase: any,
  tenantId: string,
  requestId: string,
  report: AccessReviewReport,
): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    action: 'access_review',
    resource_type: 'tenant',
    resource_id: tenantId,
    tenant_id: tenantId,
    request_id: requestId,
    success: true,
    details: {
      review_date: report.review_date,
      total_users: report.total_users,
      active_users: report.active_users,
      inactive_users: report.inactive_users,
      role_distribution: report.role_distribution,
      user_count_by_role: report.role_distribution,
      soc2_control: 'CC6.3',
      review_type: 'periodic_access_review',
    },
    state_after: {
      users_reviewed: report.users.map(u => ({
        user_id: u.user_id,
        roles: u.roles,
        is_active: u.is_active,
        last_sign_in: u.last_sign_in,
      })),
    },
  });

  if (error) {
    logger.error(`[access-review] Failed to insert audit evidence:`, error);
  }
}