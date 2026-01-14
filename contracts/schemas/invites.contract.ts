import { SchemaContract, ViewContract } from '../utils/schemaAssert';

/**
 * Contract for invites table
 * 
 * Contains sensitive tokens that must NEVER be exposed to frontend.
 * Frontend must use invites_safe view instead.
 */
export const invitesContract: SchemaContract = {
  table: 'invites',
  description: 'User invitations with sensitive tokens',
  requiredColumns: [
    'id',
    'tenant_id',
    'email',
    'token',  // Must exist but never exposed
    'status',
    'created_at'
  ],
  forbiddenColumns: []
};

/**
 * Contract for invites_safe view
 * 
 * Safe view for frontend consumption - excludes token
 */
export const invitesSafeViewContract: ViewContract = {
  view: 'invites_safe',
  description: 'Safe view excluding sensitive tokens',
  requiredColumns: [
    'id',
    'tenant_id',
    'email',
    'status',
    'created_at'
  ],
  forbiddenColumns: [
    'token'  // Must NEVER be exposed in this view
  ]
};
