/**
 * Admin Create User - Migrated to serveTenant middleware
 * SECURITY: Validates caller is admin in the target tenant before creating user.
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const CreateUserSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'Username must start with a letter, contain only letters, numbers, _ or -'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  full_name: z.string().min(1, 'Full name is required').max(255),
  role: z.enum(['admin', 'operator', 'viewer']),
  tenant_id: z.string().uuid('tenant_id must be a valid UUID'),
});

serveTenant(async (_req, ctx) => {
  const { supabase, userId, requestId, body } = ctx;

  if (!userId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Authorization required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { username, password, full_name, role, tenant_id } = parsed.data;

  // Validate tenant_id
  if (!tenant_id) {
    return new Response(
      JSON.stringify({ success: false, error: 'tenant_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verify caller is admin in the target tenant
  const { data: callerRole, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenant_id)
    .in('role', ['admin', 'super_admin'])
    .maybeSingle();

  if (roleError || !callerRole) {
    return new Response(
      JSON.stringify({ success: false, error: 'Forbidden: Admin role required in this tenant' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[admin-create-user][${requestId}] Admin verified: ${userId}, tenant: ${tenant_id}`);

  // Validation
  if (!username || !password || !full_name || !role) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing required fields: username, password, full_name, role' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Username validation
  const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_-]{2,31}$/;
  if (!usernameRegex.test(username)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Username must start with a letter, contain only letters, numbers, _ or -, and be 3-32 characters' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Password validation
  if (password.length < 8 || password.length > 72) {
    return new Response(
      JSON.stringify({ success: false, error: 'Password must be 8-72 characters' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Password must contain uppercase, lowercase, and number' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Role validation
  if (!['admin', 'operator', 'viewer'].includes(role)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid role. Must be admin, operator, or viewer' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check if username already exists
  const { data: existingUser } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username.toLowerCase())
    .maybeSingle();

  if (existingUser) {
    return new Response(
      JSON.stringify({ success: false, error: 'Username already exists' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check user limit for tenant
  const { count: userCount } = await supabase
    .from('user_roles')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id);

  const { data: tenantFeatures } = await supabase
    .from('tenant_features')
    .select('quota_limit')
    .eq('tenant_id', tenant_id)
    .eq('feature_code', 'max_users')
    .maybeSingle();

  const maxUsers = tenantFeatures?.quota_limit ?? 5;
  const currentUsers = userCount ?? 0;

  if (currentUsers >= maxUsers) {
    return new Response(
      JSON.stringify({ success: false, error: `Limite de usuarios atingido (${currentUsers}/${maxUsers}). Faca upgrade do plano.` }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Generate internal email
  const internalEmail = `${username.toLowerCase()}@local.internal`;

  logger.info(`[admin-create-user][${requestId}] Creating user: ${username}, role: ${role}, tenant: ${tenant_id}`);

  // Create user in auth.users
  const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
    email: internalEmail,
    password,
    email_confirm: true,
    user_metadata: {
      username: username.toLowerCase(),
      full_name,
      must_change_password: true,
      created_by: 'admin',
      created_by_user_id: userId,
    },
  });

  if (createError || !authUser.user) {
    logger.error(`[admin-create-user][${requestId}] Auth user creation failed`, createError as Error);
    return new Response(
      JSON.stringify({ success: false, error: createError?.message || 'Failed to create user' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const newUserId = authUser.user.id;

  // Update profile
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name,
      username: username.toLowerCase(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', newUserId);

  if (profileError) {
    await supabase.auth.admin.deleteUser(newUserId);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to update user profile' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Remove auto-created role, insert correct one
  await supabase.from('user_roles').delete().eq('user_id', newUserId);

  const { error: roleInsertError } = await supabase
    .from('user_roles')
    .insert({ user_id: newUserId, tenant_id, role });

  if (roleInsertError) {
    await supabase.auth.admin.deleteUser(newUserId);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to assign user role' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Governance event (ADR-008)
  await supabase.from('decision_events').insert({
    tenant_id,
    rule_code: 'ACCESS_GOVERNANCE',
    decision_source: 'human',
    decision_type: 'user_management',
    action: 'admin_user_created',
    justification: `Usuario ${username} (${role}) criado manualmente por admin via admin-create-user`,
    human_reviewed: true,
    created_at: new Date().toISOString(),
    evidence: { username, role, created_by: userId, method: 'username_password', adr_reference: 'ADR-008' },
  });

  // Audit log
  await supabase.from('audit_logs').insert({
    tenant_id,
    user_id: userId,
    action: 'create_user',
    resource_type: 'user',
    resource_id: newUserId,
    success: true,
    details: { username, role, method: 'admin_create_user', must_change_password: true },
  });

  logger.info(`[admin-create-user][${requestId}] User created: ${username} (${newUserId})`);

  return new Response(
    JSON.stringify({
      success: true,
      user: { id: newUserId, username: username.toLowerCase(), full_name, role },
      message: 'User created. They must change password on first login.',
    }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  );
}, {
  skipTenantValidation: true, rateLimit: { maxRequests: 10, windowMinutes: 1 },
});
