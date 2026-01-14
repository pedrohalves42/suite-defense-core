import { SchemaContract, ViewContract } from '../utils/schemaAssert';

/**
 * Contract for agents table
 * 
 * Contains sensitive HMAC secrets that must NEVER be exposed to frontend.
 * Frontend must use agents_safe or agents_public views instead.
 */
export const agentsContract: SchemaContract = {
  table: 'agents',
  description: 'Registered agents with sensitive credentials',
  requiredColumns: [
    'id',
    'tenant_id',
    'name',
    'status',
    'hmac_secret',  // Must exist but never exposed
    'created_at'
  ],
  forbiddenColumns: []
};

/**
 * Contract for agents_safe view
 * 
 * Safe view for frontend consumption - excludes hmac_secret
 */
export const agentsSafeViewContract: ViewContract = {
  view: 'agents_safe',
  description: 'Safe view excluding sensitive credentials',
  requiredColumns: [
    'id',
    'tenant_id',
    'name',
    'status',
    'created_at'
  ],
  forbiddenColumns: [
    'hmac_secret'  // Must NEVER be exposed in this view
  ]
};

/**
 * Contract for agents_public view
 */
export const agentsPublicViewContract: ViewContract = {
  view: 'agents_public',
  description: 'Public view for read-only access',
  requiredColumns: [
    'id',
    'name',
    'status'
  ],
  forbiddenColumns: [
    'hmac_secret'
  ]
};
