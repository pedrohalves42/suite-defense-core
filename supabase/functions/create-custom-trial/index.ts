/**
 * create-custom-trial — Migrated to serveTenant middleware
 * Requires super_admin role (enforced in handler)
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const CustomTrialSchema = z.object({
  email: z.string().email().max(255),
  company_name: z.string().min(1).max(255),
  contact_name: z.string().max(255).optional(),
  trial_days: z.number().int().min(1).max(365).default(45),
  notes: z.string().max(2000).optional(),
});

serveTenant(async (_req, ctx) => {
  const { supabase, userId, body } = ctx;

  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', userId!);
  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');
  if (!isSuperAdmin) {
    return new Response(JSON.stringify({ error: 'Super admin access required' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const parsed = CustomTrialSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { email, company_name, contact_name, trial_days, notes } = parsed.data;

  // Check if email already exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const emailExists = existingUsers?.users?.some(u => u.email === email);
  if (emailExists) {
    return new Response(JSON.stringify({ error: 'Email already registered' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }

  // Generate temporary password
  const tempPassword = crypto.randomUUID().replace(/-/g, '').substring(0, 16) + 'Aa1!';

  const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
    email, password: tempPassword, email_confirm: true,
    user_metadata: { full_name: contact_name || company_name, company_name, custom_trial: true, trial_days },
  });

  if (createUserError || !newUser.user) {
    logger.error('[create-custom-trial] Failed to create user:', createUserError);
    return new Response(JSON.stringify({ error: 'Failed to create user', details: createUserError?.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  const { data: userRole, error: roleQueryError } = await supabase
    .from('user_roles').select('tenant_id').eq('user_id', newUser.user.id).single();

  if (roleQueryError || !userRole?.tenant_id) {
    return new Response(JSON.stringify({ error: 'Failed to get tenant' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const tenantId = userRole.tenant_id;
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + trial_days);

  await supabase.from('tenants').update({ name: company_name }).eq('id', tenantId);

  await supabase.from('tenant_subscriptions').update({
    trial_end: trialEnd.toISOString(), status: 'trialing',
  }).eq('tenant_id', tenantId);

  const { data: customTrial, error: trialError } = await supabase
    .from('custom_trials').insert({
      tenant_id: tenantId, email, company_name, contact_name,
      trial_days, trial_end: trialEnd.toISOString(),
      created_by: userId, notes, status: 'active',
    }).select().single();

  if (trialError) logger.error('[create-custom-trial] Failed to record trial:', trialError);

  await supabase.rpc('ensure_tenant_features', {
    p_tenant_id: tenantId, p_plan_name: 'starter', p_device_quantity: 30,
  });

  logger.info(`[create-custom-trial] Created ${trial_days}-day trial for ${company_name} (${email}).`);

  await supabase.auth.admin.generateLink({ type: 'recovery', email });

  return {
    success: true, tenant_id: tenantId, user_id: newUser.user.id, email, company_name,
    trial_days, trial_end: trialEnd.toISOString(), custom_trial_id: customTrial?.id,
    password_reset_sent: true, message: 'Trial created. A password reset link was sent to the user email.',
  };
}, { skipTenantValidation: true });
