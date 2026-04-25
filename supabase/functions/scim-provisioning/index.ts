// @ts-nocheck
/**
 * SCIM 2.0 Provisioning — RFC 7644
 * Suporte a Okta, Azure AD, Google Workspace
 */
import { logger } from '../_shared/logger.ts';
import { SCIM_SCHEMAS, scimHeaders, scimError, serviceProviderConfig, resourceTypes, schemas } from './constants.ts';
import * as userHandlers from './user-handlers.ts';
import * as groupHandlers from './group-handlers.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { servePublic } from '../_shared/serve-public.ts';

const ScimUserSchema = z.object({
  schemas: z.array(z.string().max(256)).max(10).optional(),
  userName: z.string().min(1).max(255).optional(),
  emails: z.array(z.object({ value: z.string().email().max(255), type: z.string().max(64).optional(), primary: z.boolean().optional() })).max(10).optional(),
  name: z.object({ givenName: z.string().max(255).optional(), familyName: z.string().max(255).optional() }).optional(),
  active: z.boolean().optional(),
  groups: z.array(z.object({ display: z.string().max(255).optional(), value: z.string().max(255).optional() })).max(50).optional(),
  externalId: z.string().max(255).optional(),
  displayName: z.string().max(500).optional(),
}).passthrough();

const ScimGroupSchema = z.object({
  schemas: z.array(z.string().max(256)).max(10).optional(),
  displayName: z.string().min(1).max(255).optional(),
  externalId: z.string().max(255).optional(),
  members: z.array(z.object({ value: z.string().max(255), display: z.string().max(255).optional() })).max(1000).optional(),
  Operations: z.array(z.object({ op: z.string().max(32), path: z.string().max(255).optional(), value: z.unknown().optional() })).max(100).optional(),
}).passthrough();

async function parseAndValidateScimBody(req: Request, schema: z.ZodType): Promise<{ data: Record<string, unknown> } | Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return scimError(400, 'Invalid JSON body'); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return scimError(400, `Invalid SCIM payload: ${parsed.error.issues.map(i => i.message).join(', ')}`);
  return { data: parsed.data as Record<string, unknown> };
}

async function authenticateTenant(supabase: any, apiKey: string) {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, scim_config')
    .eq('scim_api_key', apiKey)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

servePublic(async (req, ctx) => {
  const { requestId, supabase, body: rawBody } = ctx;
  
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return scimError(401, 'Bearer token required');
    }

    const apiKey = authHeader.slice(7);
    const tenant = await authenticateTenant(supabase, apiKey);
    if (!tenant) return scimError(401, 'Invalid API key');

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
        if (method === 'POST') {
          const result = await parseAndValidateScimBody(req, ScimUserSchema);
          if (result instanceof Response) return result;
          return await userHandlers.createUser(supabase, tenant.id, result.data);
        }
        if (method === 'GET') {
          const filter = url.searchParams.get('filter');
          if (filter?.startsWith('userName eq ')) {
            const email = filter.replace('userName eq "', '').replace('"', '');
            const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
            const matchedUser = listData?.users?.find((u: { email?: string }) => u.email === email);
            if (!matchedUser) {
              return new Response(JSON.stringify({ schemas: [SCIM_SCHEMAS.LIST_RESPONSE], totalResults: 0, Resources: [] }), { headers: scimHeaders });
            }
            return userHandlers.getUser(supabase, tenant.id, matchedUser.id);
          }
          return userHandlers.listUsers(supabase, tenant.id, url.searchParams);
        }
      } else {
        if (method === 'GET') return userHandlers.getUser(supabase, tenant.id, userId);
        if (method === 'PUT') {
          const result = await parseAndValidateScimBody(req, ScimUserSchema);
          if (result instanceof Response) return result;
          return userHandlers.updateUser(supabase, tenant.id, userId, result.data);
        }
        if (method === 'PATCH') {
          const result = await parseAndValidateScimBody(req, ScimUserSchema);
          if (result instanceof Response) return result;
          return userHandlers.patchUser(supabase, tenant.id, userId, result.data);
        }
        if (method === 'DELETE') return userHandlers.deleteUser(supabase, tenant.id, userId);
      }
    }

    // Groups
    const groupsMatch = path.match(/\/Groups(?:\/([^/]+))?$/);
    if (groupsMatch) {
      const groupId = groupsMatch[1];
      if (!groupId) {
        if (method === 'POST') {
          const result = await parseAndValidateScimBody(req, ScimGroupSchema);
          if (result instanceof Response) return result;
          return await groupHandlers.createGroup(supabase, tenant.id, result.data);
        }
        if (method === 'GET') return groupHandlers.listGroups(supabase, tenant.id, url.searchParams);
      } else {
        if (method === 'GET') return groupHandlers.getGroup(supabase, tenant.id, groupId);
        if (method === 'PUT') {
          const result = await parseAndValidateScimBody(req, ScimGroupSchema);
          if (result instanceof Response) return result;
          return groupHandlers.updateGroup(supabase, tenant.id, groupId, result.data);
        }
        if (method === 'PATCH') {
          const result = await parseAndValidateScimBody(req, ScimGroupSchema);
          if (result instanceof Response) return result;
          return groupHandlers.patchGroup(supabase, tenant.id, groupId, result.data);
        }
        if (method === 'DELETE') return groupHandlers.deleteGroup(supabase, tenant.id, groupId);
      }
    }

    return scimError(404, 'Resource not found');
  } catch (error) {
    logger.error('[scim-provisioning] Error:', error);
    return scimError(500, error instanceof Error ? error.message : 'Internal server error');
  }
}, {
  rateLimit: {
    endpoint: 'scim',
    maxRequests: 100,
    windowMinutes: 1
  }
});