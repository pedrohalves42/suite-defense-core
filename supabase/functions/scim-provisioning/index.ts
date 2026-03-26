import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SCIM_SCHEMAS = {
  USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
  GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  LIST_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error',
} as const;

const scimHeaders = { ...corsHeaders, 'Content-Type': 'application/scim+json' };

function scimError(status: number, detail: string): Response {
  return new Response(JSON.stringify({ schemas: [SCIM_SCHEMAS.ERROR], detail, status }), {
    status,
    headers: scimHeaders,
  });
}

function getSupabase() {
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
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    documentationUri: 'https://docs.cybershield.security/scim',
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [{
      name: 'OAuth Bearer Token',
      description: 'Authentication scheme using the OAuth Bearer Token Standard',
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

// ── User helpers ─────────────────────────────────────────────────────────

function toScimUser(userId: string, email: string, fullName: string | null, active: boolean, location: string) {
  const parts = (fullName || '').split(' ');
  return {
    schemas: [SCIM_SCHEMAS.USER],
    id: userId,
    userName: email,
    name: { givenName: parts[0] || '', familyName: parts.slice(1).join(' ') || '' },
    emails: [{ value: email, type: 'work', primary: true }],
    active,
    meta: { resourceType: 'User', location },
  };
}

// ── User CRUD ────────────────────────────────────────────────────────────

async function createUser(supabase: ReturnType<typeof getSupabase>, tenantId: string, body: any, baseUrl: string): Promise<Response> {
  const email = body.emails?.[0]?.value || body.userName;
  if (!email) return scimError(400, 'Missing email');

  const fullName = body.name ? `${body.name.givenName || ''} ${body.name.familyName || ''}`.trim() : '';

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName, scim_provisioned: true, tenant_id: tenantId },
  });

  if (authError) {
    if (authError.message?.includes('already been registered')) {
      return scimError(409, 'User already exists');
    }
    console.error('[scim] createUser error:', authError.message);
    return scimError(500, authError.message);
  }

  const userId = authUser.user.id;

  // Assign default role
  await supabase.from('user_roles').insert({ user_id: userId, tenant_id: tenantId, role: 'user' });

  // Audit
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    action: 'scim_user_provisioned',
    resource_type: 'user',
    resource_id: userId,
    details: { email, scim: true },
  });

  const user = toScimUser(userId, email, fullName, true, `${baseUrl}/Users/${userId}`);
  return new Response(JSON.stringify(user), { status: 201, headers: scimHeaders });
}

async function getUser(supabase: ReturnType<typeof getSupabase>, tenantId: string, userId: string, baseUrl: string): Promise<Response> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) return scimError(404, 'User not found');

  const u = data.user;
  const user = toScimUser(u.id, u.email!, u.user_metadata?.full_name, !u.banned_until, `${baseUrl}/Users/${u.id}`);
  return new Response(JSON.stringify(user), { headers: scimHeaders });
}

async function listUsers(supabase: ReturnType<typeof getSupabase>, tenantId: string, params: URLSearchParams, baseUrl: string): Promise<Response> {
  const startIndex = Math.max(1, parseInt(params.get('startIndex') || '1'));
  const count = Math.min(200, parseInt(params.get('count') || '100'));
  const filter = params.get('filter');

  // If filtering by userName, look up single user
  if (filter) {
    const match = filter.match(/userName\s+eq\s+"([^"]+)"/);
    if (match) {
      const { data } = await supabase.auth.admin.listUsers({ perPage: 1 });
      const found = data.users.find((u: any) => u.email === match[1]);
      if (!found) {
        return new Response(JSON.stringify({
          schemas: [SCIM_SCHEMAS.LIST_RESPONSE], totalResults: 0, startIndex, itemsPerPage: 0, Resources: [],
        }), { headers: scimHeaders });
      }
      const user = toScimUser(found.id, found.email!, found.user_metadata?.full_name, !found.banned_until, `${baseUrl}/Users/${found.id}`);
      return new Response(JSON.stringify({
        schemas: [SCIM_SCHEMAS.LIST_RESPONSE], totalResults: 1, startIndex: 1, itemsPerPage: 1, Resources: [user],
      }), { headers: scimHeaders });
    }
  }

  // List users with tenant role
  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .range(startIndex - 1, startIndex + count - 2);

  const resources = [];
  for (const role of roles || []) {
    const { data } = await supabase.auth.admin.getUserById(role.user_id);
    if (data.user) {
      const u = data.user;
      resources.push(toScimUser(u.id, u.email!, u.user_metadata?.full_name, !u.banned_until, `${baseUrl}/Users/${u.id}`));
    }
  }

  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
    totalResults: resources.length,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  }), { headers: scimHeaders });
}

async function patchUser(supabase: ReturnType<typeof getSupabase>, tenantId: string, userId: string, body: any, baseUrl: string): Promise<Response> {
  const operations = body.Operations || [];

  for (const op of operations) {
    if (op.op === 'replace') {
      if (op.path === 'active' || (op.value && typeof op.value.active !== 'undefined')) {
        const active = op.path === 'active' ? op.value : op.value.active;
        if (active === false || active === 'False') {
          await supabase.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
          await supabase.from('audit_logs').insert({
            tenant_id: tenantId, action: 'scim_user_deactivated', resource_type: 'user', resource_id: userId, details: { scim: true },
          });
        } else {
          await supabase.auth.admin.updateUserById(userId, { ban_duration: 'none' });
        }
      }
      if (op.path === 'name' || op.value?.name) {
        const name = op.path === 'name' ? op.value : op.value.name;
        const fullName = `${name.givenName || ''} ${name.familyName || ''}`.trim();
        await supabase.auth.admin.updateUserById(userId, { user_metadata: { full_name: fullName, scim_provisioned: true } });
      }
    }
  }

  return getUser(supabase, tenantId, userId, baseUrl);
}

async function updateUser(supabase: ReturnType<typeof getSupabase>, tenantId: string, userId: string, body: any, baseUrl: string): Promise<Response> {
  const fullName = body.name ? `${body.name.givenName || ''} ${body.name.familyName || ''}`.trim() : undefined;
  const active = body.active !== false;

  await supabase.auth.admin.updateUserById(userId, {
    ...(fullName && { user_metadata: { full_name: fullName, scim_provisioned: true } }),
    ...(active ? { ban_duration: 'none' } : { ban_duration: '876000h' }),
  });

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId, action: 'scim_user_updated', resource_type: 'user', resource_id: userId, details: { scim: true },
  });

  return getUser(supabase, tenantId, userId, baseUrl);
}

async function deleteUser(supabase: ReturnType<typeof getSupabase>, tenantId: string, userId: string): Promise<Response> {
  await supabase.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
  await supabase.from('user_roles').delete().eq('user_id', userId).eq('tenant_id', tenantId);
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId, action: 'scim_user_deprovisioned', resource_type: 'user', resource_id: userId, details: { scim: true },
  });
  return new Response(null, { status: 204, headers: scimHeaders });
}

// ── Group CRUD ───────────────────────────────────────────────────────────

async function createGroup(supabase: ReturnType<typeof getSupabase>, tenantId: string, body: any): Promise<Response> {
  const { data, error } = await supabase
    .from('scim_groups')
    .insert({ tenant_id: tenantId, display_name: body.displayName, external_id: body.externalId })
    .select()
    .single();
  if (error) return scimError(500, error.message);

  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.GROUP], id: data.id, displayName: data.display_name,
    meta: { resourceType: 'Group', created: data.created_at, lastModified: data.updated_at },
  }), { status: 201, headers: scimHeaders });
}

async function listGroups(supabase: ReturnType<typeof getSupabase>, tenantId: string, params: URLSearchParams): Promise<Response> {
  const startIndex = Math.max(1, parseInt(params.get('startIndex') || '1'));
  const count = Math.min(200, parseInt(params.get('count') || '100'));

  const { data, error, count: total } = await supabase
    .from('scim_groups')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .range(startIndex - 1, startIndex + count - 2);

  if (error) return scimError(500, error.message);

  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
    totalResults: total || 0,
    startIndex,
    itemsPerPage: (data || []).length,
    Resources: (data || []).map(g => ({
      schemas: [SCIM_SCHEMAS.GROUP], id: g.id, displayName: g.display_name,
      meta: { resourceType: 'Group', created: g.created_at, lastModified: g.updated_at },
    })),
  }), { headers: scimHeaders });
}

async function getGroup(supabase: ReturnType<typeof getSupabase>, tenantId: string, groupId: string): Promise<Response> {
  const { data, error } = await supabase
    .from('scim_groups').select('*').eq('id', groupId).eq('tenant_id', tenantId).maybeSingle();
  if (error || !data) return scimError(404, 'Group not found');

  const { data: members } = await supabase
    .from('group_members').select('user_id').eq('group_id', groupId);

  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.GROUP], id: data.id, displayName: data.display_name,
    members: (members || []).map(m => ({ value: m.user_id, type: 'User' })),
    meta: { resourceType: 'Group', created: data.created_at, lastModified: data.updated_at },
  }), { headers: scimHeaders });
}

async function patchGroup(supabase: ReturnType<typeof getSupabase>, tenantId: string, groupId: string, body: any): Promise<Response> {
  const operations = body.Operations || [];
  for (const op of operations) {
    if (op.op === 'add' && op.path === 'members') {
      const members = Array.isArray(op.value) ? op.value : [op.value];
      for (const m of members) {
        await supabase.from('group_members').upsert({ group_id: groupId, user_id: m.value, tenant_id: tenantId });
      }
    }
    if (op.op === 'remove' && op.path?.startsWith('members')) {
      const match = op.path.match(/members\[value eq "([^"]+)"\]/);
      if (match) {
        await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', match[1]);
      }
    }
    if (op.op === 'replace' && op.path === 'displayName') {
      await supabase.from('scim_groups').update({ display_name: op.value, updated_at: new Date().toISOString() }).eq('id', groupId);
    }
  }
  return getGroup(supabase, tenantId, groupId);
}

async function deleteGroup(supabase: ReturnType<typeof getSupabase>, tenantId: string, groupId: string): Promise<Response> {
  await supabase.from('scim_groups').delete().eq('id', groupId).eq('tenant_id', tenantId);
  return new Response(null, { status: 204, headers: scimHeaders });
}

// ── Main Router ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Strip the function prefix to get SCIM path
  const fullPath = url.pathname;
  const scimPath = fullPath.replace(/^\/scim-provisioning\/?/, '/');
  const method = req.method;
  const baseUrl = `${url.origin}/scim-provisioning`;

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return scimError(401, 'Missing or invalid Authorization header');
    }

    const result = await authenticateTenant(authHeader.replace('Bearer ', ''));
    if (!result) return scimError(401, 'Invalid SCIM API key');

    const { supabase, tenant } = result;
    const tenantId = tenant.id;

    // Discovery endpoints
    if (scimPath === '/ServiceProviderConfig' && method === 'GET') return serviceProviderConfig();
    if (scimPath === '/ResourceTypes' && method === 'GET') return resourceTypes();

    // Users
    if (scimPath === '/Users' || scimPath === '/Users/') {
      if (method === 'GET') return listUsers(supabase, tenantId, url.searchParams, baseUrl);
      if (method === 'POST') return createUser(supabase, tenantId, await req.json(), baseUrl);
    }

    const userMatch = scimPath.match(/^\/Users\/([a-f0-9-]+)$/);
    if (userMatch) {
      const userId = userMatch[1];
      if (method === 'GET') return getUser(supabase, tenantId, userId, baseUrl);
      if (method === 'PUT') return updateUser(supabase, tenantId, userId, await req.json(), baseUrl);
      if (method === 'PATCH') return patchUser(supabase, tenantId, userId, await req.json(), baseUrl);
      if (method === 'DELETE') return deleteUser(supabase, tenantId, userId);
    }

    // Groups
    if (scimPath === '/Groups' || scimPath === '/Groups/') {
      if (method === 'GET') return listGroups(supabase, tenantId, url.searchParams);
      if (method === 'POST') return createGroup(supabase, tenantId, await req.json());
    }

    const groupMatch = scimPath.match(/^\/Groups\/([a-f0-9-]+)$/);
    if (groupMatch) {
      const groupId = groupMatch[1];
      if (method === 'GET') return getGroup(supabase, tenantId, groupId);
      if (method === 'PATCH') return patchGroup(supabase, tenantId, groupId, await req.json());
      if (method === 'DELETE') return deleteGroup(supabase, tenantId, groupId);
    }

    return scimError(404, 'Endpoint not found');
  } catch (error) {
    console.error('[scim-provisioning] Error:', error);
    return scimError(500, error instanceof Error ? error.message : 'Internal server error');
  }
});
