/**
 * SCIM 2.0 User Operations
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Database } from '../_shared/database.types.ts';
import { SCIM_SCHEMAS, scimHeaders, scimError } from './constants.ts';

type ScimSupabaseClient = SupabaseClient<Database>;

interface ScimEmail {
  value: string;
  type?: string;
  primary?: boolean;
}

interface ScimName {
  givenName?: string;
  familyName?: string;
}

interface ScimGroupRef {
  value?: string;
  display?: string;
}

interface ScimPatchOperation {
  op: string;
  path?: string;
  value?: unknown;
}

interface ScimAuthUser {
  id: string;
  email?: string;
  created_at?: string;
  updated_at?: string;
  banned_until?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asArray<T = unknown>(value: unknown): T[] | undefined {
  return Array.isArray(value) ? (value as T[]) : undefined;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function pickName(value: unknown): ScimName | undefined {
  const obj = asObject(value);
  if (!obj) return undefined;
  return {
    givenName: asString(obj.givenName),
    familyName: asString(obj.familyName),
  };
}

function pickEmails(value: unknown): ScimEmail[] {
  const arr = asArray<unknown>(value) ?? [];
  return arr
    .map((entry) => {
      const obj = asObject(entry);
      const val = asString(obj?.value);
      if (!val) return null;
      return {
        value: val,
        type: asString(obj?.type),
        primary: typeof obj?.primary === 'boolean' ? (obj?.primary as boolean) : undefined,
      } satisfies ScimEmail;
    })
    .filter((e): e is ScimEmail => e !== null);
}

function pickGroups(value: unknown): ScimGroupRef[] | undefined {
  const arr = asArray<unknown>(value);
  if (!arr) return undefined;
  return arr.map((entry) => {
    const obj = asObject(entry);
    return {
      value: asString(obj?.value),
      display: asString(obj?.display),
    } satisfies ScimGroupRef;
  });
}

export async function createUser(
  supabase: ScimSupabaseClient,
  tenantId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const userName = asString(body.userName);
  const emails = pickEmails(body.emails);
  const name = pickName(body.name);

  if (!userName || !emails[0]?.value) {
    return scimError(400, 'Missing required fields: userName or email');
  }

  const email = emails[0].value;
  const fullName = `${name?.givenName || ''} ${name?.familyName || ''}`.trim();

  const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existingUser = (listData?.users as ScimAuthUser[] | undefined)?.find(
    (u) => u.email === email,
  );

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
    if (!authUser?.user?.id) throw new Error('SCIM: createUser returned no user id');
    userId = authUser.user.id;
  }

  const groups = pickGroups(body.groups);
  const role = groups?.some((g) => g.display === 'Admin') ? 'admin' : 'user';

  await supabase.from('user_roles').upsert(
    { user_id: userId, tenant_id: tenantId, role } as never,
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
      if (dbGroup?.id) {
        await supabase.from('group_members').upsert(
          { group_id: dbGroup.id, user_id: userId, tenant_id: tenantId } as never,
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
  } as never);

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

export async function getUser(
  supabase: ScimSupabaseClient,
  tenantId: string,
  userId: string,
): Promise<Response> {
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!userRole) return scimError(404, 'User not found');

  const { data: authData } = await supabase.auth.admin.getUserById(userId);
  const user = authData?.user as ScimAuthUser | undefined;
  if (!user) return scimError(404, 'User not found');

  const fullName = asString(user.user_metadata?.full_name) ?? '';
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
  supabase: ScimSupabaseClient,
  tenantId: string,
  params: URLSearchParams,
): Promise<Response> {
  const startIndex = parseInt(params.get('startIndex') || '1');
  const count = Math.min(parseInt(params.get('count') || '100'), 200);
  const filter = params.get('filter');

  const { data: roles, error, count: total } = await supabase
    .from('user_roles')
    .select('user_id, role', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .range(startIndex - 1, startIndex + count - 2);

  if (error) throw error;

  let filteredRoles: Array<{ user_id: string; role: string }> =
    (roles as Array<{ user_id: string; role: string }> | null) ?? [];

  if (filter?.startsWith('userName eq ')) {
    const email = filter.replace('userName eq "', '').replace('"', '');
    const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const matchedUser = (listData?.users as ScimAuthUser[] | undefined)?.find(
      (u) => u.email === email,
    );
    if (matchedUser) {
      filteredRoles = filteredRoles.filter((r) => r.user_id === matchedUser.id);
    } else {
      filteredRoles = [];
    }
  }

  const resources: Array<Record<string, unknown>> = [];
  for (const role of filteredRoles) {
    const { data: authData } = await supabase.auth.admin.getUserById(role.user_id);
    const user = authData?.user as ScimAuthUser | undefined;
    if (!user) continue;
    const fullName = asString(user.user_metadata?.full_name) ?? '';
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
    totalResults: filter ? resources.length : (total ?? resources.length),
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  }), { headers: scimHeaders });
}

export async function updateUser(
  supabase: ScimSupabaseClient,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const name = pickName(body.name);
  const fullName = `${name?.givenName || ''} ${name?.familyName || ''}`.trim();

  await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { full_name: fullName, scim_provisioned: true, last_sync: new Date().toISOString() },
  });

  const groups = pickGroups(body.groups);
  const role = groups?.some((g) => g.display === 'Admin') ? 'admin' : 'user';
  await supabase.from('user_roles').upsert(
    { user_id: userId, tenant_id: tenantId, role } as never,
    { onConflict: 'user_id,tenant_id' },
  );

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    action: 'scim_user_updated',
    resource_type: 'user',
    resource_id: userId,
    details: { scim: true },
  } as never);

  return getUser(supabase, tenantId, userId);
}

export async function patchUser(
  supabase: ScimSupabaseClient,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const operations = asArray<ScimPatchOperation>(body.Operations) ?? [];

  for (const op of operations) {
    if (op.op === 'replace' && op.path === 'active') {
      if (!op.value) {
        // deno-lint-ignore no-explicit-any
        await supabase.auth.admin.updateUserById(userId, { ban_duration: 'forever' } as any);
      } else {
        // deno-lint-ignore no-explicit-any
        await supabase.auth.admin.updateUserById(userId, { ban_duration: 'none' } as any);
      }
    }
  }

  return getUser(supabase, tenantId, userId);
}

export async function deleteUser(
  supabase: ScimSupabaseClient,
  tenantId: string,
  userId: string,
): Promise<Response> {
  // deno-lint-ignore no-explicit-any
  await supabase.auth.admin.updateUserById(userId, { ban_duration: 'forever' } as any);
  await supabase.from('user_roles').delete().eq('user_id', userId).eq('tenant_id', tenantId);
  await supabase.from('group_members').delete().eq('user_id', userId).eq('tenant_id', tenantId);

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    action: 'scim_user_deprovisioned',
    resource_type: 'user',
    resource_id: userId,
    details: { scim: true },
  } as never);

  return new Response(null, { headers: scimHeaders, status: 204 });
}
