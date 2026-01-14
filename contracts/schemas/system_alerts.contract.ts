import { SchemaContract } from '../utils/schemaAssert';

/**
 * Contract for system_alerts table
 * 
 * Critical table for security alerting.
 * Must always have severity, status, and tenant isolation.
 */
export const systemAlertsContract: SchemaContract = {
  table: 'system_alerts',
  description: 'Security and operational alerts',
  requiredColumns: [
    'id',
    'tenant_id',
    'alert_type',
    'severity',
    'title',
    'status',
    'created_at'
  ],
  forbiddenColumns: []
};
