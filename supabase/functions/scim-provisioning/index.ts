/**
 * SCIM 2.0 Provisioning — RFC 7644
 * Suporte a Okta, Azure AD, Google Workspace
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

const SCIM_SCHEMAS = {
  USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
  GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  LIST_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error',
  SERVICE_PROVIDER_CONFIG: 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
} as const;

const scimHeaders = { ...corsHeaders, 'Content-Type': 'application/scim+json' };

function scimError(status: number, detail: string): Response {
  return new Response(JSON.stringify({ schemas: [SCIM_SCHEMAS.ERROR], detail, status }), {
    status,
    headers: scimHeaders,
  });
}

function getSupabase(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function authenticateTenant(apiKey: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, scim_config')
    .eq('scim_api_key', apiKey)
    .maybeSingle();
  if (error || !data) return null;
  return { supabase, tenant: data };
}

// ── Service Provider Config ──────────────────────────────────────────────

function serviceProviderConfig(): Response {
  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.SERVICE_PROVIDER_CONFIG],
    documentationUri: 'https://docs.cybershield.security/scim',
    patch: { supported: true },
    bulk: { supported: true, maxOperations: 100, maxPayloadSize: 1048576 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: true },
    etag: { supported: true },
    authenticationSchemes: [{
      name: 'Bearer Token',
      description: 'Bearer token authentication',
      specUri: 'https://tools.ietf.org/html/rfc6750',
      type: 'oauthbearertoken',
      primary: true,
    }],
  }), { headers: scimHeaders });
}

function resourceTypes(): Response {
  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
    totalResults: 2,
    Resources: [
      { id: 'User', name: 'User', endpoint: '/Users', schema: SCIM_SCHEMAS.USER, schemaExtensions: [] },
      { id: 'Group', name: 'Group', endpoint: '/Groups', schema: SCIM_SCHEMAS.GROUP, schemaExtensions: [] },
    ],
  }), { headers: scimHeaders });
}

function schemas(): Response {
  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
    totalResults: 2,
    Resources: [
      {
        id: SCIM_SCHEMAS.USER, name: 'User', description: 'SCIM Core Schema for User',
        attributes: [
          { name: 'userName', type: 'string', required: true },
          { name: 'name', type: 'complex', required: true },
          { name: 'emails', type: 'complex', multiValued: true, required: true },
          { name: 'active', type: 'boolean', required: false },
          { name: 'groups', type: 'complex', multiValued: true, required: false },
        ],
      },
      {
        id: SCIM_SCHEMAS.GROUP, name: 'Group', description: 'SCIM Core Schema for Group',
        attributes: [
          { name: 'displayName', type: 'string', required: true },
          { name: 'members', type: 'complex', multiValued: true, required: false },
        ],
      },
    ],
  }), { headers: scimHeaders });
}

// ── User Operations ─────────────────────────────────────────────────────

async function createUser(
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

  // Check existing user via user_roles for this tenant
  const { data: existingRole } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .limit(1000);

  // Try to find user by email via auth admin
  const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existingUser = listData?.users?.find((u: { email?: string }) => u.email === email);

  let userId: string;
  let isNew = false;

  if (existingUser) {
    userId = existingUser.id;
    // Update metadata
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

  // Determine role from groups
  const groups = body.groups as Array<{ display?: string }> | undefined;
  const role = groups?.some((g) => g.display === 'Admin') ? 'admin' : 'user';

  // Upsert user_role
  await supabase.from('user_roles').upsert(
    { user_id: userId, tenant_id: tenantId, role },
    { onConflict: 'user_id,tenant_id' },
  );

  // Sync group memberships
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

  // Audit log
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

async function getUser(supabase: SupabaseClient, tenantId: string, userId: string): Promise<Response> {
  // Verify user belongs to tenant
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

async function listUsers(
  supabase: SupabaseClient,
  tenantId: string,
  params: URLSearchParams,
): Promise<Response> {
  const startIndex = parseInt(params.get('startIndex') || '1');
  const count = Math.min(parseInt(params.get('count') || '100'), 200);
  const filter = params.get('filter');

  // Get user IDs for this tenant
  const { data: roles, error } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .range(startIndex - 1, startIndex + count - 2);

  if (error) throw error;

  // If filter by userName, narrow down
  let filteredRoles = roles || [];
  if (filter?.startsWith('userName eq ')) {
    const email = filter.replace('userName eq "', '').replace('"', '');
    // Find user by email
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

async function updateUser(
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

  // Update role
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

async function patchUser(
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

async function deleteUser(supabase: SupabaseClient, tenantId: string, userId: string): Promise<Response> {
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

// ── Group Operations ────────────────────────────────────────────────────

async function createGroup(
  supabase: SupabaseClient,
  tenantId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const displayName = body.displayName as string;
  if (!displayName) return scimError(400, 'displayName is required');

  const { data: group, error } = await supabase
    .from('scim_groups')
    .insert({ tenant_id: tenantId, display_name: displayName, external_id: body.externalId as string || null })
    .select()
    .single();

  if (error) throw error;

  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.GROUP],
    id: group.id,
    displayName: group.display_name,
    meta: { resourceType: 'Group', created: group.created_at, lastModified: group.updated_at || group.created_at },
  }), { headers: scimHeaders, status: 201 });
}

async function getGroup(supabase: SupabaseClient, tenantId: string, groupId: string): Promise<Response> {
  const { data: group, error } = await supabase
    .from('scim_groups')
    .select('*')
    .eq('id', groupId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !group) return scimError(404, 'Group not found');

  // Get members
  const { data: members } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId);

  const memberList = [];
  for (const m of members || []) {
    const { data: authData } = await supabase.auth.admin.getUserById(m.user_id);
    if (authData?.user) {
      memberList.push({ value: m.user_id, display: authData.user.email, type: 'User' });
    }
  }

  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.GROUP],
    id: group.id,
    displayName: group.display_name,
    members: memberList,
    meta: { resourceType: 'Group', created: group.created_at, lastModified: group.updated_at || group.created_at },
  }), { headers: scimHeaders });
}

async function listGroups(
  supabase: SupabaseClient,
  tenantId: string,
  params: URLSearchParams,
): Promise<Response> {
  const startIndex = parseInt(params.get('startIndex') || '1');
  const count = Math.min(parseInt(params.get('count') || '100'), 200);

  const { data: groups, error, count: total } = await supabase
    .from('scim_groups')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .range(startIndex - 1, startIndex + count - 2);

  if (error) throw error;

  const resources = (groups || []).map((g) => ({
    schemas: [SCIM_SCHEMAS.GROUP],
    id: g.id,
    displayName: g.display_name,
    meta: { resourceType: 'Group', created: g.created_at, lastModified: g.updated_at || g.created_at },
  }));

  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
    totalResults: total,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  }), { headers: scimHeaders });
}

async function updateGroup(
  supabase: SupabaseClient,
  tenantId: string,
  groupId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const { error } = await supabase
    .from('scim_groups')
    .update({ display_name: body.displayName as string, updated_at: new Date().toISOString() })
    .eq('id', groupId)
    .eq('tenant_id', tenantId);

  if (error) throw error;
  return getGroup(supabase, tenantId, groupId);
}

async function patchGroup(
  supabase: SupabaseClient,
  tenantId: string,
  groupId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const operations = (body.Operations || []) as Array<{ op: string; path?: string; value?: unknown }>;

  for (const op of operations) {
    if (op.op === 'add' && op.path === 'members') {
      const members = op.value as Array<{ value: string }>;
      for (const member of members || []) {
        await supabase.from('group_members').upsert(
          { group_id: groupId, user_id: member.value, tenant_id: tenantId },
          { onConflict: 'group_id,user_id' },
        );
      }
    }
    if (op.op === 'remove' && op.path === 'members') {
      const members = op.value as Array<{ value: string }>;
      for (const member of members || []) {
        await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', member.value);
      }
    }
  }

  return getGroup(supabase, tenantId, groupId);
}

async function deleteGroup(supabase: SupabaseClient, tenantId: string, groupId: string): Promise<Response> {
  await supabase.from('scim_groups').delete().eq('id', groupId).eq('tenant_id', tenantId);
  return new Response(null, { headers: scimHeaders, status: 204 });
}

// ── Main Handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: scimHeaders, status: 204 });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return scimError(401, 'Bearer token required');
    }

    const apiKey = authHeader.slice(7);
    const auth = await authenticateTenant(apiKey);
    if (!auth) return scimError(401, 'Invalid API key');

    const { supabase, tenant } = auth;
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');
    const method = req.method;

    // Discovery endpoints
    if (path.endsWith('/ServiceProviderConfig')) return serviceProviderConfig();
    if (path.endsWith('/ResourceTypes')) return resourceTypes();
    if (path.endsWith('/Schemas')) return schemas();

    // Users
    const usersMatch = path.match(/\/Users(?:\/([^/]+))?$/);
    if (usersMatch) {
      const userId = usersMatch[1];
      if (!userId) {
        if (method === 'POST') return await createUser(supabase, tenant.id, await req.json());
        if (method === 'GET') {
          const filter = url.searchParams.get('filter');
          if (filter?.startsWith('userName eq ')) {
            const email = filter.replace('userName eq "', '').replace('"', '');
            // Find user by email
            const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
            const matchedUser = listData?.users?.find((u: { email?: string }) => u.email === email);
            if (!matchedUser) {
              return new Response(JSON.stringify({
                schemas: [SCIM_SCHEMAS.LIST_RESPONSE], totalResults: 0, Resources: [],
              }), { headers: scimHeaders });
            }
            return getUser(supabase, tenant.id, matchedUser.id);
          }
          return listUsers(supabase, tenant.id, url.searchParams);
        }
      } else {
        if (method === 'GET') return getUser(supabase, tenant.id, userId);
        if (method === 'PUT') return updateUser(supabase, tenant.id, userId, await req.json());
        if (method === 'PATCH') return patchUser(supabase, tenant.id, userId, await req.json());
        if (method === 'DELETE') return deleteUser(supabase, tenant.id, userId);
      }
    }

    // Groups
    const groupsMatch = path.match(/\/Groups(?:\/([^/]+))?$/);
    if (groupsMatch) {
      const groupId = groupsMatch[1];
      if (!groupId) {
        if (method === 'POST') return await createGroup(supabase, tenant.id, await req.json());
        if (method === 'GET') return listGroups(supabase, tenant.id, url.searchParams);
      } else {
        if (method === 'GET') return getGroup(supabase, tenant.id, groupId);
        if (method === 'PUT') return updateGroup(supabase, tenant.id, groupId, await req.json());
        if (method === 'PATCH') return patchGroup(supabase, tenant.id, groupId, await req.json());
        if (method === 'DELETE') return deleteGroup(supabase, tenant.id, groupId);
      }
    }

    return scimError(404, 'Resource not found');
  } catch (error) {
    logger.error('[scim-provisioning] Error:', error);
    return scimError(500, error instanceof Error ? error.message : 'Internal server error');
  }
});
