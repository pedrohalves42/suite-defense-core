/**
 * SCIM 2.0 Group Operations
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { SCIM_SCHEMAS, scimHeaders, scimError } from './constants.ts';

export async function createGroup(
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

export async function getGroup(supabase: SupabaseClient, tenantId: string, groupId: string): Promise<Response> {
  const { data: group, error } = await supabase
    .from('scim_groups')
    .select('*')
    .eq('id', groupId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !group) return scimError(404, 'Group not found');

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

export async function listGroups(
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

export async function updateGroup(
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

export async function patchGroup(
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

export async function deleteGroup(supabase: SupabaseClient, tenantId: string, groupId: string): Promise<Response> {
  await supabase.from('scim_groups').delete().eq('id', groupId).eq('tenant_id', tenantId);
  return new Response(null, { headers: scimHeaders, status: 204 });
}
