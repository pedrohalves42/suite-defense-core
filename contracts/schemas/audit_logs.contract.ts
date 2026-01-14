import { SchemaContract } from '../utils/schemaAssert';

/**
 * Contract for audit_logs table
 * 
 * This is a CRITICAL security table that stores all audit events.
 * The actor_type column was the ROOT CAUSE of a previous bug
 * and must NEVER be added back.
 */
export const auditLogsContract: SchemaContract = {
  table: 'audit_logs',
  description: 'Audit trail for all system events',
  requiredColumns: [
    'id',
    'event_type',
    'actor_id',
    'details',
    'created_at',
    'tenant_id'
  ],
  forbiddenColumns: [
    'actor_type'  // ROOT CAUSE of previous bug - NEVER add this back
  ]
};
