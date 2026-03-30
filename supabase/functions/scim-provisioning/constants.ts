/**
 * SCIM 2.0 Constants and Helpers
 */
import { buildCorsHeaders } from '../_shared/cors.ts';

export const SCIM_SCHEMAS = {
  USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
  GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  LIST_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error',
  SERVICE_PROVIDER_CONFIG: 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
} as const;

export const scimHeaders = { ...buildCorsHeaders(null), 'Content-Type': 'application/scim+json' };

export function scimError(status: number, detail: string): Response {
  return new Response(JSON.stringify({ schemas: [SCIM_SCHEMAS.ERROR], detail, status }), {
    status,
    headers: scimHeaders,
  });
}

export function serviceProviderConfig(): Response {
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

export function resourceTypes(): Response {
  return new Response(JSON.stringify({
    schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
    totalResults: 2,
    Resources: [
      { id: 'User', name: 'User', endpoint: '/Users', schema: SCIM_SCHEMAS.USER, schemaExtensions: [] },
      { id: 'Group', name: 'Group', endpoint: '/Groups', schema: SCIM_SCHEMAS.GROUP, schemaExtensions: [] },
    ],
  }), { headers: scimHeaders });
}

export function schemas(): Response {
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
