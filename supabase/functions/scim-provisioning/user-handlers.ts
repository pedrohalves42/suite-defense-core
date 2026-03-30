/**
 * SCIM 2.0 User Operations
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { SCIM_SCHEMAS, scimHeaders, scimError } from './constants.ts';

export async function createUser(
  supabase: SupabaseClient,
  tenantId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const userName = body.userName as string;
  const emails = body.emails as Array<{ value: string; type?: string; primary?: boolean }>;
  const name = body.name as { givenName?: string; familyName?: string } | undefined;

  if (!userName || !emails?.[0]?.value) {
    return scimError(400, 'Missing required fields: userName or email');
  }

  const email = emails[0].value;
  const fullName = `${name?.givenName || ''} ${name?.familyName || ''}`.trim();

  const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existingUser = listData?.users?.find((u: { email?: string }) => u.email === email);

  let userId: string;
  let isNew = false;

  if (existingUser) {
    userId = existingUser.id;
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { full_name: fullName, scim_provisioned: true, last_sync: new Date().toISOString() },
    });
  } else {
    isNew = true;
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName, scim_provisioned: true, tenant_id: tenantId },
    });
    if (authError) throw authError;
    userId = authUser.user.id;
  }

  const groups = body.groups as Array<{ display?: string }> | undefined;
  const role = groups?.some((g) => g.display === 'Admin') ? 'admin' : 'user';

  await supabase.from('user_roles').upsert(
    { user_id: userId, tenant_id: tenantId, role },
    { onConflict: 'user_id,tenant_id' },
  );

  if (groups) {
    for (const group of groups) {
      if (!group.display) continue;
      const { data: dbGroup } = await supabase
        .from('scim_groups')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('display_name', group.display)
        .maybeSingle();
      if (dbGroup) {
        await supabase.from('group_members').upsert(
          { group_id: dbGroup.id, user_id: userId, tenant_id: tenantId },
          { onConflict: 'group_id,user_id' },
        );
      }
    }
  }

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    action: isNew ? 'scim_user_provisioned' : 'scim_user_updated',
    resource_type: 'user',
    resource_id: userId,
    details: { email, scim: true },
  });

  const now = new Date().toISOString();
  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.USER],
    id: userId,
    userName: email,
    name: { givenName: name?.givenName || '', familyName: name?.familyName || '', formatted: fullName },
    emails: [{ value: email, type: 'work', primary: true }],
    active: true,
    meta: { resourceType: 'User', created: now, lastModified: now, location: `/Users/${userId}` },
  }), { headers: scimHeaders, status: isNew ? 201 : 200 });
}

export async function getUser(supabase: SupabaseClient, tenantId: string, userId: string): Promise<Response> {
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!userRole) return scimError(404, 'User not found');

  const { data: authData } = await supabase.auth.admin.getUserById(userId);
  if (!authData?.user) return scimError(404, 'User not found');

  const user = authData.user;
  const fullName = user.user_metadata?.full_name || '';
  const parts = fullName.split(' ');

  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.USER],
    id: userId,
    userName: user.email,
    name: { givenName: parts[0] || '', familyName: parts.slice(1).join(' ') || '', formatted: fullName },
    emails: [{ value: user.email, type: 'work', primary: true }],
    active: !user.banned_until,
    groups: [{ value: userRole.role, display: userRole.role === 'admin' ? 'Admin' : 'User' }],
    meta: {
      resourceType: 'User',
      created: user.created_at,
      lastModified: user.updated_at || user.created_at,
      location: `/Users/${userId}`,
    },
  }), { headers: scimHeaders });
}

export async function listUsers(
  supabase: SupabaseClient,
  tenantId: string,
  params: URLSearchParams,
): Promise<Response> {
  const startIndex = parseInt(params.get('startIndex') || '1');
  const count = Math.min(parseInt(params.get('count') || '100'), 200);
  const filter = params.get('filter');

  const { data: roles, error } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .range(startIndex - 1, startIndex + count - 2);

  if (error) throw error;

  let filteredRoles = roles || [];
  if (filter?.startsWith('userName eq ')) {
    const email = filter.replace('userName eq "', '').replace('"', '');
    const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const matchedUser = listData?.users?.find((u: { email?: string }) => u.email === email);
    if (matchedUser) {
      filteredRoles = filteredRoles.filter((r) => r.user_id === matchedUser.id);
    } else {
      filteredRoles = [];
    }
  }

  const resources = [];
  for (const role of filteredRoles) {
    const { data: authData } = await supabase.auth.admin.getUserById(role.user_id);
    if (!authData?.user) continue;
    const user = authData.user;
    const fullName = user.user_metadata?.full_name || '';
    const parts = fullName.split(' ');
    resources.push({
      schemas: [SCIM_SCHEMAS.USER],
      id: user.id,
      userName: user.email,
      name: { givenName: parts[0] || '', familyName: parts.slice(1).join(' ') || '', formatted: fullName },
      emails: [{ value: user.email, type: 'work', primary: true }],
      active: !user.banned_until,
      groups: [{ value: role.role, display: role.role === 'admin' ? 'Admin' : 'User' }],
    });
  }

  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
    totalResults: resources.length,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  }), { headers: scimHeaders });
}

export async function updateUser(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const name = body.name as { givenName?: string; familyName?: string } | undefined;
  const fullName = `${name?.givenName || ''} ${name?.familyName || ''}`.trim();

  await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { full_name: fullName, scim_provisioned: true, last_sync: new Date().toISOString() },
  });

  const groups = body.groups as Array<{ display?: string }> | undefined;
  const role = groups?.some((g) => g.display === 'Admin') ? 'admin' : 'user';
  await supabase.from('user_roles').upsert(
    { user_id: userId, tenant_id: tenantId, role },
    { onConflict: 'user_id,tenant_id' },
  );

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    action: 'scim_user_updated',
    resource_type: 'user',
    resource_id: userId,
    details: { scim: true },
  });

  return getUser(supabase, tenantId, userId);
}

export async function patchUser(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const operations = (body.Operations || []) as Array<{ op: string; path?: string; value?: unknown }>;

  for (const op of operations) {
    if (op.op === 'replace' && op.path === 'active') {
      if (!op.value) {
        await supabase.auth.admin.updateUserById(userId, { ban_duration: 'forever' });
      } else {
        await supabase.auth.admin.updateUserById(userId, { ban_duration: 'none' });
      }
    }
  }

  return getUser(supabase, tenantId, userId);
}

export async function deleteUser(supabase: SupabaseClient, tenantId: string, userId: string): Promise<Response> {
  await supabase.auth.admin.updateUserById(userId, { ban_duration: 'forever' });
  await supabase.from('user_roles').delete().eq('user_id', userId).eq('tenant_id', tenantId);
  await supabase.from('group_members').delete().eq('user_id', userId).eq('tenant_id', tenantId);

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    action: 'scim_user_deprovisioned',
    resource_type: 'user',
    resource_id: userId,
    details: { scim: true },
  });

  return new Response(null, { headers: scimHeaders, status: 204 });
}
