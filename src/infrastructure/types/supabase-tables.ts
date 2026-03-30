/**
 * Re-exports Supabase table row/insert/update types for use in mappers and adapters.
 * Centralizes DB type references to avoid scattered imports of the massive types file.
 */
import type { Database } from '@/integrations/supabase/types';

// Helper to extract table types
type Tables = Database['public']['Tables'];

// Row types (for reads)
export type AgentRow = Tables['agents']['Row'];
export type JobRow = Tables['jobs']['Row'];
export type JobExecutionRow = Tables['job_executions']['Row'];
export type UpdatePackageRow = Tables['update_packages']['Row'];
export type CertificateRow = Tables['agent_certificates']['Row'];
export type BehavioralBaselineRow = Tables['agent_behavioral_baseline']['Row'];
export type FileIntegrityRow = Tables['agent_file_integrity']['Row'];
export type NetworkMetricsRow = Tables['agent_network_metrics']['Row'];
export type UsbDeviceRow = Tables['agent_usb_devices']['Row'];
export type VulnerabilityScanRow = Tables['agent_vulnerability_scans']['Row'];

// Insert types (for writes)
export type AgentInsert = Tables['agents']['Insert'];
export type JobInsert = Tables['jobs']['Insert'];
export type JobExecutionInsert = Tables['job_executions']['Insert'];
export type UpdatePackageInsert = Tables['update_packages']['Insert'];
export type CertificateInsert = Tables['agent_certificates']['Insert'];
export type BehavioralBaselineInsert = Tables['agent_behavioral_baseline']['Insert'];
export type FileIntegrityInsert = Tables['agent_file_integrity']['Insert'];
export type NetworkMetricsInsert = Tables['agent_network_metrics']['Insert'];
export type UsbDeviceInsert = Tables['agent_usb_devices']['Insert'];
export type VulnerabilityScanInsert = Tables['agent_vulnerability_scans']['Insert'];
