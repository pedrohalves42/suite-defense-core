/**
 * SCIM 2.0 Group Operations
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Database } from '../_shared/database.types.ts';
import { SCIM_SCHEMAS, scimHeaders, scimError } from './constants.ts';

type ScimSupabaseClient = SupabaseClient<Database>;

interface ScimGroupRow {
  id: string;
  display_name: string;
  tenant_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface ScimPatchOperation {
  op: string;
  path?: string;
  value?: unknown;
}

interface ScimMemberRef {
  value: string;
}

interface ScimAuthUser {
  id: string;
  email?: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asArray<T = unknown>(value: unknown): T[] | undefined {
  return Array.isArray(value) ? (value as T[]) : undefined;
}

export async function createGroup(
  supabase: ScimSupabaseClient,
  tenantId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const displayName = asString(body.displayName);
  if (!displayName) return scimError(400, 'displayName is required');

  const externalId = asString(body.externalId) ?? null;

  const { data: group, error } = await supabase
    .from('scim_groups')
    .insert({ tenant_id: tenantId, display_name: displayName, external_id: externalId } as never)
    .select()
    .single();

  if (error) throw error;
  const row = group as ScimGroupRow;

  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.GROUP],
    id: row.id,
    displayName: row.display_name,
    meta: { resourceType: 'Group', created: row.created_at, lastModified: row.updated_at || row.created_at },
  }), { headers: scimHeaders, status: 201 });
}

export async function getGroup(
  supabase: ScimSupabaseClient,
  tenantId: string,
  groupId: string,
): Promise<Response> {
  const { data: group, error } = await supabase
    .from('scim_groups')
    .select('id, display_name, tenant_id, created_at, updated_at')
    .eq('id', groupId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !group) return scimError(404, 'Group not found');
  const row = group as ScimGroupRow;

  const { data: members } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId);

  const memberRows = (members as Array<{ user_id: string }> | null) ?? [];
  const memberList: Array<{ value: string; display?: string; type: string }> = [];
  for (const m of memberRows) {
    const { data: authData } = await supabase.auth.admin.getUserById(m.user_id);
    const user = authData?.user as ScimAuthUser | undefined;
    if (user) {
      memberList.push({ value: m.user_id, display: user.email, type: 'User' });
    }
  }

  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.GROUP],
    id: row.id,
    displayName: row.display_name,
    members: memberList,
    meta: { resourceType: 'Group', created: row.created_at, lastModified: row.updated_at || row.created_at },
  }), { headers: scimHeaders });
}

export async function listGroups(
  supabase: ScimSupabaseClient,
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

  const rows = (groups as ScimGroupRow[] | null) ?? [];
  const resources = rows.map((g) => ({
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

export async function updateGroup(
  supabase: ScimSupabaseClient,
  tenantId: string,
  groupId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const displayName = asString(body.displayName);
  const { error } = await supabase
    .from('scim_groups')
    .update({ display_name: displayName, updated_at: new Date().toISOString() } as never)
    .eq('id', groupId)
    .eq('tenant_id', tenantId);

  if (error) throw error;
  return getGroup(supabase, tenantId, groupId);
}

export async function patchGroup(
  supabase: ScimSupabaseClient,
  tenantId: string,
  groupId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const operations = asArray<ScimPatchOperation>(body.Operations) ?? [];

  for (const op of operations) {
    if (op.op === 'add' && op.path === 'members') {
      const members = asArray<ScimMemberRef>(op.value) ?? [];
      for (const member of members) {
        if (!member?.value) continue;
        await supabase.from('group_members').upsert(
          { group_id: groupId, user_id: member.value, tenant_id: tenantId } as never,
          { onConflict: 'group_id,user_id' },
        );
      }
    }
    if (op.op === 'remove' && op.path === 'members') {
      const members = asArray<ScimMemberRef>(op.value) ?? [];
      for (const member of members) {
        if (!member?.value) continue;
        await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', member.value);
      }
    }
  }

  return getGroup(supabase, tenantId, groupId);
}

export async function deleteGroup(
  supabase: ScimSupabaseClient,
  tenantId: string,
  groupId: string,
): Promise<Response> {
  await supabase.from('scim_groups').delete().eq('id', groupId).eq('tenant_id', tenantId);
  return new Response(null, { headers: scimHeaders, status: 204 });
}
