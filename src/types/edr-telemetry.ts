/**
 * EDR Telemetry Types — Sprint 23
 * Types for endpoint process, file, network, registry, and detection events.
 */

export interface EndpointProcessEvent {
  id: string;
  tenant_id: string;
  agent_id: string;
  event_type: 'process_start' | 'process_stop' | 'process_inject';
  pid: number;
  parent_pid?: number;
  process_name: string;
  command_line?: string;
  executable_path?: string;
  user_name?: string;
  sha256_hash?: string;
  parent_process_name?: string;
  parent_command_line?: string;
  mitre_technique_id?: string;
  mitre_tactic?: string;
  is_suspicious: boolean;
  detection_tags: string[];
  event_time: string;
  created_at: string;
}

export interface EndpointFileEvent {
  id: string;
  tenant_id: string;
  agent_id: string;
  event_type: 'file_create' | 'file_modify' | 'file_delete' | 'file_rename';
  file_path: string;
  file_name?: string;
  file_extension?: string;
  file_size?: number;
  sha256_hash?: string;
  old_path?: string;
  process_name?: string;
  process_pid?: number;
  is_suspicious: boolean;
  detection_tags: string[];
  event_time: string;
  created_at: string;
}

export interface EndpointNetworkEvent {
  id: string;
  tenant_id: string;
  agent_id: string;
  event_type: 'connection' | 'listen' | 'dns_query';
  protocol: string;
  local_address?: string;
  local_port?: number;
  remote_address?: string;
  remote_port?: number;
  direction: 'inbound' | 'outbound';
  process_name?: string;
  process_pid?: number;
  bytes_sent?: number;
  bytes_received?: number;
  domain?: string;
  dns_query_type?: string;
  dns_response?: string;
  is_suspicious: boolean;
  detection_tags: string[];
  geo_country?: string;
  event_time: string;
  created_at: string;
}

export interface EndpointRegistryEvent {
  id: string;
  tenant_id: string;
  agent_id: string;
  event_type: 'registry_set' | 'registry_create' | 'registry_delete';
  key_path: string;
  value_name?: string;
  value_data?: string;
  value_type?: string;
  old_value_data?: string;
  process_name?: string;
  process_pid?: number;
  is_suspicious: boolean;
  detection_tags: string[];
  mitre_technique_id?: string;
  event_time: string;
  created_at: string;
}

export interface EndpointDetectionEvent {
  id: string;
  tenant_id: string;
  agent_id: string;
  detection_name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence_score: number;
  mitre_technique_id?: string;
  mitre_tactic?: string;
  mitre_technique_name?: string;
  description?: string;
  source_event_type: string;
  source_event_data: Record<string, unknown>;
  process_name?: string;
  process_pid?: number;
  command_line?: string;
  file_path?: string;
  remote_address?: string;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  acknowledged_at?: string;
  resolved_at?: string;
  event_time: string;
  created_at: string;
}

export interface MitreAttackTechnique {
  techniqueId: string;
  tactic: string;
  name: string;
  detectionCount: number;
  lastSeen?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface TelemetryStats {
  processEvents24h: number;
  fileEvents24h: number;
  networkEvents24h: number;
  registryEvents24h: number;
  detections24h: number;
  criticalDetections: number;
  mitretechniques: number;
}
