/**
 * Get Admin Releases - Returns full release data including sensitive fields
 * SECURITY: Only accessible to super_admin users
 * Migrated to serveTenant middleware
 */

import { serveTenant } from '../_shared/serve-tenant.ts';

serveTenant(async (_req, ctx) => {
  const { supabase, userId, requestId } = ctx;

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'Authentication required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verify super_admin role
  const { data: isSuperAdmin, error: roleError } = await supabase.rpc('has_role', {
    _user_id: userId,
    _role: 'super_admin',
  });

  if (roleError || !isSuperAdmin) {
    console.error(`[get-admin-releases][${requestId}] Access denied for user: ${userId}`);
    return new Response(
      JSON.stringify({ error: 'Forbidden - super_admin required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[get-admin-releases][${requestId}] Super admin ${userId} fetching all releases`);

  const { data: releases, error: fetchError } = await supabase
    .from('agent_releases')
    .select('id, version, platform, channel, is_active, sha256, release_notes, created_at, created_by, signature_base64, signed_at, signed_by, script_content')
    .order('created_at', { ascending: false });

  if (fetchError) {
    console.error(`[get-admin-releases][${requestId}] Fetch error:`, fetchError);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch releases' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return { releases: releases || [] };
}, {
  methods: ['GET', 'POST'],
  skipTenantValidation: true,
});
