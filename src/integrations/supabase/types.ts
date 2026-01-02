export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      agent_builds: {
        Row: {
          agent_id: string
          build_completed_at: string | null
          build_duration_seconds: number | null
          build_log: Json | null
          build_started_at: string | null
          build_status: string
          created_at: string
          created_by: string | null
          download_expires_at: string | null
          download_url: string | null
          enrollment_key_id: string | null
          error_message: string | null
          exe_version: string | null
          file_path: string | null
          file_size_bytes: number | null
          github_run_id: string | null
          github_run_url: string | null
          id: string
          ps1_version: string | null
          ps2exe_version: string | null
          sha256_hash: string | null
          tenant_id: string
        }
        Insert: {
          agent_id: string
          build_completed_at?: string | null
          build_duration_seconds?: number | null
          build_log?: Json | null
          build_started_at?: string | null
          build_status?: string
          created_at?: string
          created_by?: string | null
          download_expires_at?: string | null
          download_url?: string | null
          enrollment_key_id?: string | null
          error_message?: string | null
          exe_version?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          github_run_id?: string | null
          github_run_url?: string | null
          id?: string
          ps1_version?: string | null
          ps2exe_version?: string | null
          sha256_hash?: string | null
          tenant_id: string
        }
        Update: {
          agent_id?: string
          build_completed_at?: string | null
          build_duration_seconds?: number | null
          build_log?: Json | null
          build_started_at?: string | null
          build_status?: string
          created_at?: string
          created_by?: string | null
          download_expires_at?: string | null
          download_url?: string | null
          enrollment_key_id?: string | null
          error_message?: string | null
          exe_version?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          github_run_id?: string | null
          github_run_url?: string | null
          id?: string
          ps1_version?: string | null
          ps2exe_version?: string | null
          sha256_hash?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_builds_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_builds_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_builds_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_builds_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_builds_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_builds_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_builds_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_builds_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_builds_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_builds_enrollment_key_id_fkey"
            columns: ["enrollment_key_id"]
            isOneToOne: false
            referencedRelation: "enrollment_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_builds_enrollment_key_id_fkey"
            columns: ["enrollment_key_id"]
            isOneToOne: false
            referencedRelation: "enrollment_keys_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_builds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_builds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_builds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_disk_metrics: {
        Row: {
          agent_id: string
          collected_at: string | null
          created_at: string | null
          drive_label: string | null
          drive_letter: string
          drive_type: string | null
          free_gb: number
          id: string
          is_system_drive: boolean | null
          tenant_id: string
          total_gb: number
          usage_percent: number
          used_gb: number
        }
        Insert: {
          agent_id: string
          collected_at?: string | null
          created_at?: string | null
          drive_label?: string | null
          drive_letter: string
          drive_type?: string | null
          free_gb: number
          id?: string
          is_system_drive?: boolean | null
          tenant_id: string
          total_gb: number
          usage_percent: number
          used_gb: number
        }
        Update: {
          agent_id?: string
          collected_at?: string | null
          created_at?: string | null
          drive_label?: string | null
          drive_letter?: string
          drive_type?: string | null
          free_gb?: number
          id?: string
          is_system_drive?: boolean | null
          tenant_id?: string
          total_gb?: number
          usage_percent?: number
          used_gb?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_disk_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_disk_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_disk_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_disk_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_disk_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_disk_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_disk_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_disk_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_disk_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_disk_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_disk_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_disk_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_evidence_logs: {
        Row: {
          agent_id: string | null
          agent_name: string
          agent_version: string | null
          created_at: string
          event_data: Json
          event_type: string
          evidence_hash: string
          id: string
          severity: string | null
          state_after: string | null
          state_before: string | null
          tenant_id: string
        }
        Insert: {
          agent_id?: string | null
          agent_name: string
          agent_version?: string | null
          created_at?: string
          event_data?: Json
          event_type: string
          evidence_hash: string
          id?: string
          severity?: string | null
          state_after?: string | null
          state_before?: string | null
          tenant_id: string
        }
        Update: {
          agent_id?: string | null
          agent_name?: string
          agent_version?: string | null
          created_at?: string
          event_data?: Json
          event_type?: string
          evidence_hash?: string
          id?: string
          severity?: string | null
          state_after?: string | null
          state_before?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_evidence_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_evidence_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_evidence_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_evidence_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_evidence_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_evidence_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_evidence_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_evidence_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_evidence_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_evidence_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_evidence_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_evidence_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_execution_chain: {
        Row: {
          agent_id: string
          last_execution_hash: string
          last_execution_index: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          last_execution_hash?: string
          last_execution_index?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          last_execution_hash?: string
          last_execution_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_group_policies: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          group_id: string
          id: string
          policy_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          group_id: string
          id?: string
          policy_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          group_id?: string
          id?: string
          policy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_group_policies_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "agent_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_group_policies_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "security_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_metrics_daily: {
        Row: {
          agent_id: string
          avg_cpu_percent: number | null
          avg_disk_percent: number | null
          avg_memory_percent: number | null
          created_at: string
          id: string
          max_cpu_percent: number | null
          max_disk_percent: number | null
          max_memory_percent: number | null
          max_uptime_seconds: number | null
          metric_date: string
          min_cpu_percent: number | null
          min_memory_percent: number | null
          sample_count: number | null
          tenant_id: string
        }
        Insert: {
          agent_id: string
          avg_cpu_percent?: number | null
          avg_disk_percent?: number | null
          avg_memory_percent?: number | null
          created_at?: string
          id?: string
          max_cpu_percent?: number | null
          max_disk_percent?: number | null
          max_memory_percent?: number | null
          max_uptime_seconds?: number | null
          metric_date: string
          min_cpu_percent?: number | null
          min_memory_percent?: number | null
          sample_count?: number | null
          tenant_id: string
        }
        Update: {
          agent_id?: string
          avg_cpu_percent?: number | null
          avg_disk_percent?: number | null
          avg_memory_percent?: number | null
          created_at?: string
          id?: string
          max_cpu_percent?: number | null
          max_disk_percent?: number | null
          max_memory_percent?: number | null
          max_uptime_seconds?: number | null
          metric_date?: string
          min_cpu_percent?: number | null
          min_memory_percent?: number | null
          sample_count?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_metrics_daily_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_metrics_daily_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_metrics_daily_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_network_info: {
        Row: {
          active_connections: Json | null
          agent_id: string
          collected_at: string
          created_at: string
          dns_servers: Json | null
          dns_test_success: boolean | null
          firewall_domain: boolean | null
          firewall_private: boolean | null
          firewall_public: boolean | null
          gateway_ip: string | null
          https_test_success: boolean | null
          id: string
          network_adapters: Json | null
          open_ports: Json | null
          public_ip: string | null
          tenant_id: string
        }
        Insert: {
          active_connections?: Json | null
          agent_id: string
          collected_at?: string
          created_at?: string
          dns_servers?: Json | null
          dns_test_success?: boolean | null
          firewall_domain?: boolean | null
          firewall_private?: boolean | null
          firewall_public?: boolean | null
          gateway_ip?: string | null
          https_test_success?: boolean | null
          id?: string
          network_adapters?: Json | null
          open_ports?: Json | null
          public_ip?: string | null
          tenant_id: string
        }
        Update: {
          active_connections?: Json | null
          agent_id?: string
          collected_at?: string
          created_at?: string
          dns_servers?: Json | null
          dns_test_success?: boolean | null
          firewall_domain?: boolean | null
          firewall_private?: boolean | null
          firewall_public?: boolean | null
          gateway_ip?: string | null
          https_test_success?: boolean | null
          id?: string
          network_adapters?: Json | null
          open_ports?: Json | null
          public_ip?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_network_info_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_info_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_info_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_info_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_info_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_network_info_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_network_info_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_info_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_network_info_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_info_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_info_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_network_info_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_recovery_authorizations: {
        Row: {
          agent_id: string
          approved_by: string | null
          created_at: string | null
          expires_at: string
          id: string
          requested_at: string | null
          requested_by: string
          safe_mode_event_id: string | null
          signed_payload: Json
          status: string | null
          tenant_id: string
          used_at: string | null
        }
        Insert: {
          agent_id: string
          approved_by?: string | null
          created_at?: string | null
          expires_at: string
          id?: string
          requested_at?: string | null
          requested_by: string
          safe_mode_event_id?: string | null
          signed_payload: Json
          status?: string | null
          tenant_id: string
          used_at?: string | null
        }
        Update: {
          agent_id?: string
          approved_by?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          requested_at?: string | null
          requested_by?: string
          safe_mode_event_id?: string | null
          signed_payload?: Json
          status?: string | null
          tenant_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_recovery_authorizations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_recovery_authorizations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_recovery_authorizations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_recovery_authorizations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_recovery_authorizations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_recovery_authorizations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_recovery_authorizations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_recovery_authorizations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_recovery_authorizations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_recovery_authorizations_safe_mode_event_id_fkey"
            columns: ["safe_mode_event_id"]
            isOneToOne: false
            referencedRelation: "agent_safe_mode_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_recovery_authorizations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_recovery_authorizations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_recovery_authorizations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_releases: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          platform: string
          release_notes: string | null
          script_content: string
          sha256: string
          signature_base64: string | null
          signed_at: string | null
          signed_by: string | null
          version: string
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          platform?: string
          release_notes?: string | null
          script_content: string
          sha256: string
          signature_base64?: string | null
          signed_at?: string | null
          signed_by?: string | null
          version: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          platform?: string
          release_notes?: string | null
          script_content?: string
          sha256?: string
          signature_base64?: string | null
          signed_at?: string | null
          signed_by?: string | null
          version?: string
        }
        Relationships: []
      }
      agent_rollback_events: {
        Row: {
          agent_id: string | null
          agent_name: string
          created_at: string | null
          details: Json | null
          from_version: string
          id: string
          reason: string
          rollback_count: number | null
          safe_mode_triggered: boolean | null
          tenant_id: string
          to_version: string
        }
        Insert: {
          agent_id?: string | null
          agent_name: string
          created_at?: string | null
          details?: Json | null
          from_version: string
          id?: string
          reason: string
          rollback_count?: number | null
          safe_mode_triggered?: boolean | null
          tenant_id: string
          to_version: string
        }
        Update: {
          agent_id?: string | null
          agent_name?: string
          created_at?: string | null
          details?: Json | null
          from_version?: string
          id?: string
          reason?: string
          rollback_count?: number | null
          safe_mode_triggered?: boolean | null
          tenant_id?: string
          to_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_rollback_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_rollback_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_rollback_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_rollback_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_rollback_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_rollback_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_rollback_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_rollback_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_rollback_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_rollback_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_rollback_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_rollback_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_safe_mode_events: {
        Row: {
          agent_id: string
          agent_version: string | null
          created_at: string | null
          entered_at: string
          execution_hash: string | null
          failure_count: number | null
          id: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          tenant_id: string
        }
        Insert: {
          agent_id: string
          agent_version?: string | null
          created_at?: string | null
          entered_at: string
          execution_hash?: string | null
          failure_count?: number | null
          id?: string
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id: string
        }
        Update: {
          agent_id?: string
          agent_version?: string | null
          created_at?: string | null
          entered_at?: string
          execution_hash?: string | null
          failure_count?: number | null
          id?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_safe_mode_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_safe_mode_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_safe_mode_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_safe_mode_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_safe_mode_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_safe_mode_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_safe_mode_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_safe_mode_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_safe_mode_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_safe_mode_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_safe_mode_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_safe_mode_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_signing_keys: {
        Row: {
          agent_id: string
          algorithm: string
          created_at: string
          expires_at: string | null
          id: string
          key_fingerprint: string
          public_key: string
          revoked_at: string | null
          revoked_reason: string | null
          rotation_signaled_at: string | null
          valid_from: string
          version: number
        }
        Insert: {
          agent_id: string
          algorithm?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          key_fingerprint: string
          public_key: string
          revoked_at?: string | null
          revoked_reason?: string | null
          rotation_signaled_at?: string | null
          valid_from?: string
          version?: number
        }
        Update: {
          agent_id?: string
          algorithm?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          key_fingerprint?: string
          public_key?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          rotation_signaled_at?: string | null
          valid_from?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_signing_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_signing_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_signing_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_signing_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_signing_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_signing_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_signing_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_signing_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_signing_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_system_metrics: {
        Row: {
          agent_id: string
          collected_at: string
          cpu_cores: number | null
          cpu_name: string | null
          cpu_usage_percent: number | null
          created_at: string
          disk_free_gb: number | null
          disk_total_gb: number | null
          disk_usage_percent: number | null
          disk_used_gb: number | null
          id: string
          last_boot_time: string | null
          memory_free_gb: number | null
          memory_total_gb: number | null
          memory_usage_percent: number | null
          memory_used_gb: number | null
          network_bytes_received: number | null
          network_bytes_sent: number | null
          tenant_id: string
          uptime_seconds: number | null
        }
        Insert: {
          agent_id: string
          collected_at?: string
          cpu_cores?: number | null
          cpu_name?: string | null
          cpu_usage_percent?: number | null
          created_at?: string
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_usage_percent?: number | null
          disk_used_gb?: number | null
          id?: string
          last_boot_time?: string | null
          memory_free_gb?: number | null
          memory_total_gb?: number | null
          memory_usage_percent?: number | null
          memory_used_gb?: number | null
          network_bytes_received?: number | null
          network_bytes_sent?: number | null
          tenant_id: string
          uptime_seconds?: number | null
        }
        Update: {
          agent_id?: string
          collected_at?: string
          cpu_cores?: number | null
          cpu_name?: string | null
          cpu_usage_percent?: number | null
          created_at?: string
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_usage_percent?: number | null
          disk_used_gb?: number | null
          id?: string
          last_boot_time?: string | null
          memory_free_gb?: number | null
          memory_total_gb?: number | null
          memory_usage_percent?: number | null
          memory_used_gb?: number | null
          network_bytes_received?: number | null
          network_bytes_sent?: number | null
          tenant_id?: string
          uptime_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_system_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_system_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_system_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_system_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_system_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_system_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_system_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_system_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_system_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_system_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_system_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_system_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_system_metrics_2025_12: {
        Row: {
          agent_id: string
          collected_at: string
          cpu_cores: number | null
          cpu_name: string | null
          cpu_usage_percent: number | null
          created_at: string
          disk_free_gb: number | null
          disk_total_gb: number | null
          disk_usage_percent: number | null
          disk_used_gb: number | null
          id: string
          last_boot_time: string | null
          memory_free_gb: number | null
          memory_total_gb: number | null
          memory_usage_percent: number | null
          memory_used_gb: number | null
          network_bytes_received: number | null
          network_bytes_sent: number | null
          tenant_id: string
          uptime_seconds: number | null
        }
        Insert: {
          agent_id: string
          collected_at?: string
          cpu_cores?: number | null
          cpu_name?: string | null
          cpu_usage_percent?: number | null
          created_at?: string
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_usage_percent?: number | null
          disk_used_gb?: number | null
          id?: string
          last_boot_time?: string | null
          memory_free_gb?: number | null
          memory_total_gb?: number | null
          memory_usage_percent?: number | null
          memory_used_gb?: number | null
          network_bytes_received?: number | null
          network_bytes_sent?: number | null
          tenant_id: string
          uptime_seconds?: number | null
        }
        Update: {
          agent_id?: string
          collected_at?: string
          cpu_cores?: number | null
          cpu_name?: string | null
          cpu_usage_percent?: number | null
          created_at?: string
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_usage_percent?: number | null
          disk_used_gb?: number | null
          id?: string
          last_boot_time?: string | null
          memory_free_gb?: number | null
          memory_total_gb?: number | null
          memory_usage_percent?: number | null
          memory_used_gb?: number | null
          network_bytes_received?: number | null
          network_bytes_sent?: number | null
          tenant_id?: string
          uptime_seconds?: number | null
        }
        Relationships: []
      }
      agent_system_metrics_2026_01: {
        Row: {
          agent_id: string
          collected_at: string
          cpu_cores: number | null
          cpu_name: string | null
          cpu_usage_percent: number | null
          created_at: string
          disk_free_gb: number | null
          disk_total_gb: number | null
          disk_usage_percent: number | null
          disk_used_gb: number | null
          id: string
          last_boot_time: string | null
          memory_free_gb: number | null
          memory_total_gb: number | null
          memory_usage_percent: number | null
          memory_used_gb: number | null
          network_bytes_received: number | null
          network_bytes_sent: number | null
          tenant_id: string
          uptime_seconds: number | null
        }
        Insert: {
          agent_id: string
          collected_at?: string
          cpu_cores?: number | null
          cpu_name?: string | null
          cpu_usage_percent?: number | null
          created_at?: string
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_usage_percent?: number | null
          disk_used_gb?: number | null
          id?: string
          last_boot_time?: string | null
          memory_free_gb?: number | null
          memory_total_gb?: number | null
          memory_usage_percent?: number | null
          memory_used_gb?: number | null
          network_bytes_received?: number | null
          network_bytes_sent?: number | null
          tenant_id: string
          uptime_seconds?: number | null
        }
        Update: {
          agent_id?: string
          collected_at?: string
          cpu_cores?: number | null
          cpu_name?: string | null
          cpu_usage_percent?: number | null
          created_at?: string
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_usage_percent?: number | null
          disk_used_gb?: number | null
          id?: string
          last_boot_time?: string | null
          memory_free_gb?: number | null
          memory_total_gb?: number | null
          memory_usage_percent?: number | null
          memory_used_gb?: number | null
          network_bytes_received?: number | null
          network_bytes_sent?: number | null
          tenant_id?: string
          uptime_seconds?: number | null
        }
        Relationships: []
      }
      agent_system_metrics_2026_02: {
        Row: {
          agent_id: string
          collected_at: string
          cpu_cores: number | null
          cpu_name: string | null
          cpu_usage_percent: number | null
          created_at: string
          disk_free_gb: number | null
          disk_total_gb: number | null
          disk_usage_percent: number | null
          disk_used_gb: number | null
          id: string
          last_boot_time: string | null
          memory_free_gb: number | null
          memory_total_gb: number | null
          memory_usage_percent: number | null
          memory_used_gb: number | null
          network_bytes_received: number | null
          network_bytes_sent: number | null
          tenant_id: string
          uptime_seconds: number | null
        }
        Insert: {
          agent_id: string
          collected_at?: string
          cpu_cores?: number | null
          cpu_name?: string | null
          cpu_usage_percent?: number | null
          created_at?: string
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_usage_percent?: number | null
          disk_used_gb?: number | null
          id?: string
          last_boot_time?: string | null
          memory_free_gb?: number | null
          memory_total_gb?: number | null
          memory_usage_percent?: number | null
          memory_used_gb?: number | null
          network_bytes_received?: number | null
          network_bytes_sent?: number | null
          tenant_id: string
          uptime_seconds?: number | null
        }
        Update: {
          agent_id?: string
          collected_at?: string
          cpu_cores?: number | null
          cpu_name?: string | null
          cpu_usage_percent?: number | null
          created_at?: string
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_usage_percent?: number | null
          disk_used_gb?: number | null
          id?: string
          last_boot_time?: string | null
          memory_free_gb?: number | null
          memory_total_gb?: number | null
          memory_usage_percent?: number | null
          memory_used_gb?: number | null
          network_bytes_received?: number | null
          network_bytes_sent?: number | null
          tenant_id?: string
          uptime_seconds?: number | null
        }
        Relationships: []
      }
      agent_system_metrics_partitioned: {
        Row: {
          agent_id: string
          collected_at: string
          cpu_cores: number | null
          cpu_name: string | null
          cpu_usage_percent: number | null
          created_at: string
          disk_free_gb: number | null
          disk_total_gb: number | null
          disk_usage_percent: number | null
          disk_used_gb: number | null
          id: string
          last_boot_time: string | null
          memory_free_gb: number | null
          memory_total_gb: number | null
          memory_usage_percent: number | null
          memory_used_gb: number | null
          network_bytes_received: number | null
          network_bytes_sent: number | null
          tenant_id: string
          uptime_seconds: number | null
        }
        Insert: {
          agent_id: string
          collected_at?: string
          cpu_cores?: number | null
          cpu_name?: string | null
          cpu_usage_percent?: number | null
          created_at?: string
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_usage_percent?: number | null
          disk_used_gb?: number | null
          id?: string
          last_boot_time?: string | null
          memory_free_gb?: number | null
          memory_total_gb?: number | null
          memory_usage_percent?: number | null
          memory_used_gb?: number | null
          network_bytes_received?: number | null
          network_bytes_sent?: number | null
          tenant_id: string
          uptime_seconds?: number | null
        }
        Update: {
          agent_id?: string
          collected_at?: string
          cpu_cores?: number | null
          cpu_name?: string | null
          cpu_usage_percent?: number | null
          created_at?: string
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_usage_percent?: number | null
          disk_used_gb?: number | null
          id?: string
          last_boot_time?: string | null
          memory_free_gb?: number | null
          memory_total_gb?: number | null
          memory_usage_percent?: number | null
          memory_used_gb?: number | null
          network_bytes_received?: number | null
          network_bytes_sent?: number | null
          tenant_id?: string
          uptime_seconds?: number | null
        }
        Relationships: []
      }
      agent_tokens: {
        Row: {
          agent_id: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          token_hash: string
          token_prefix: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          token_hash: string
          token_prefix: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          token_hash?: string
          token_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_update_decisions: {
        Row: {
          agent_id: string | null
          agent_name: string
          bucket: number
          created_at: string | null
          current_version: string | null
          decision: string
          id: string
          platform: string
          rollout_percentage: number
          target_version: string
        }
        Insert: {
          agent_id?: string | null
          agent_name: string
          bucket: number
          created_at?: string | null
          current_version?: string | null
          decision: string
          id?: string
          platform: string
          rollout_percentage: number
          target_version: string
        }
        Update: {
          agent_id?: string | null
          agent_name?: string
          bucket?: number
          created_at?: string | null
          current_version?: string | null
          decision?: string
          id?: string
          platform?: string
          rollout_percentage?: number
          target_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_update_decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_update_decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_update_decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_update_decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_update_decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_update_decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_update_decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_update_decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_update_decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_update_policies: {
        Row: {
          created_at: string | null
          created_by: string | null
          enabled: boolean
          id: string
          notes: string | null
          platform: string
          rollout_percentage: number
          target_version: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          enabled?: boolean
          id?: string
          notes?: string | null
          platform: string
          rollout_percentage?: number
          target_version: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          enabled?: boolean
          id?: string
          notes?: string | null
          platform?: string
          rollout_percentage?: number
          target_version?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_versions: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          created_at: string | null
          download_url: string
          id: string
          is_blocked: boolean | null
          is_latest: boolean | null
          platform: string
          release_notes: string | null
          sha256: string
          size_bytes: number
          version: string
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          created_at?: string | null
          download_url: string
          id?: string
          is_blocked?: boolean | null
          is_latest?: boolean | null
          platform: string
          release_notes?: string | null
          sha256: string
          size_bytes: number
          version: string
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          created_at?: string | null
          download_url?: string
          id?: string
          is_blocked?: boolean | null
          is_latest?: boolean | null
          platform?: string
          release_notes?: string | null
          sha256?: string
          size_bytes?: number
          version?: string
        }
        Relationships: []
      }
      agent_web_activity: {
        Row: {
          agent_id: string
          browser: string | null
          category: string | null
          created_at: string
          domain: string
          id: string
          is_blocked: boolean | null
          page_title: string | null
          source: string
          tenant_id: string
          total_duration_seconds: number | null
          url: string | null
          url_full: string | null
          visit_count: number | null
          visited_at: string
        }
        Insert: {
          agent_id: string
          browser?: string | null
          category?: string | null
          created_at?: string
          domain: string
          id?: string
          is_blocked?: boolean | null
          page_title?: string | null
          source?: string
          tenant_id: string
          total_duration_seconds?: number | null
          url?: string | null
          url_full?: string | null
          visit_count?: number | null
          visited_at: string
        }
        Update: {
          agent_id?: string
          browser?: string | null
          category?: string | null
          created_at?: string
          domain?: string
          id?: string
          is_blocked?: boolean | null
          page_title?: string | null
          source?: string
          tenant_id?: string
          total_duration_seconds?: number | null
          url?: string | null
          url_full?: string | null
          visit_count?: number | null
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_web_activity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_web_activity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_web_activity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_web_activity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_web_activity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_web_activity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_web_activity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_web_activity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_web_activity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_web_activity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_web_activity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_web_activity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agents: {
        Row: {
          agent_mode: string | null
          agent_name: string
          agent_state: string
          agent_state_changed_at: string | null
          agent_state_reason: string | null
          agent_version: string | null
          agent_version_code: number | null
          archived_at: string | null
          archived_reason: string | null
          display_name: string | null
          ed25519_supported: boolean | null
          enrolled_at: string
          force_update_at: string | null
          force_update_override_safe_mode: boolean | null
          force_update_override_safe_mode_expires_at: string | null
          force_update_reason: string | null
          force_update_version: string | null
          hmac_secret: string
          hostname: string | null
          id: string
          is_isolated: boolean | null
          is_throttled: boolean | null
          isolated_at: string | null
          isolation_reason: string | null
          last_block_sync_at: string | null
          last_forced_update_applied: string | null
          last_heartbeat: string | null
          offline_detected_at: string | null
          offline_reason: string | null
          os_type: string | null
          os_version: string | null
          payload_hash: string | null
          poll_interval_seconds: number | null
          result_key_fingerprint: string | null
          result_key_registered_at: string | null
          result_public_key: string | null
          safe_mode_entered_at: string | null
          safe_mode_reason: string | null
          signature_mode: string | null
          status: string
          tenant_id: string
          throttle_reason: string | null
          throttled_at: string | null
        }
        Insert: {
          agent_mode?: string | null
          agent_name: string
          agent_state?: string
          agent_state_changed_at?: string | null
          agent_state_reason?: string | null
          agent_version?: string | null
          agent_version_code?: number | null
          archived_at?: string | null
          archived_reason?: string | null
          display_name?: string | null
          ed25519_supported?: boolean | null
          enrolled_at?: string
          force_update_at?: string | null
          force_update_override_safe_mode?: boolean | null
          force_update_override_safe_mode_expires_at?: string | null
          force_update_reason?: string | null
          force_update_version?: string | null
          hmac_secret: string
          hostname?: string | null
          id?: string
          is_isolated?: boolean | null
          is_throttled?: boolean | null
          isolated_at?: string | null
          isolation_reason?: string | null
          last_block_sync_at?: string | null
          last_forced_update_applied?: string | null
          last_heartbeat?: string | null
          offline_detected_at?: string | null
          offline_reason?: string | null
          os_type?: string | null
          os_version?: string | null
          payload_hash?: string | null
          poll_interval_seconds?: number | null
          result_key_fingerprint?: string | null
          result_key_registered_at?: string | null
          result_public_key?: string | null
          safe_mode_entered_at?: string | null
          safe_mode_reason?: string | null
          signature_mode?: string | null
          status?: string
          tenant_id: string
          throttle_reason?: string | null
          throttled_at?: string | null
        }
        Update: {
          agent_mode?: string | null
          agent_name?: string
          agent_state?: string
          agent_state_changed_at?: string | null
          agent_state_reason?: string | null
          agent_version?: string | null
          agent_version_code?: number | null
          archived_at?: string | null
          archived_reason?: string | null
          display_name?: string | null
          ed25519_supported?: boolean | null
          enrolled_at?: string
          force_update_at?: string | null
          force_update_override_safe_mode?: boolean | null
          force_update_override_safe_mode_expires_at?: string | null
          force_update_reason?: string | null
          force_update_version?: string | null
          hmac_secret?: string
          hostname?: string | null
          id?: string
          is_isolated?: boolean | null
          is_throttled?: boolean | null
          isolated_at?: string | null
          isolation_reason?: string | null
          last_block_sync_at?: string | null
          last_forced_update_applied?: string | null
          last_heartbeat?: string | null
          offline_detected_at?: string | null
          offline_reason?: string | null
          os_type?: string | null
          os_version?: string | null
          payload_hash?: string | null
          poll_interval_seconds?: number | null
          result_key_fingerprint?: string | null
          result_key_registered_at?: string | null
          result_public_key?: string | null
          safe_mode_entered_at?: string | null
          safe_mode_reason?: string | null
          signature_mode?: string | null
          status?: string
          tenant_id?: string
          throttle_reason?: string | null
          throttled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agents_groups: {
        Row: {
          agent_id: string
          group_id: string
        }
        Insert: {
          agent_id: string
          group_id: string
        }
        Update: {
          agent_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agents_groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agents_groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agents_groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "agent_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_action_configs: {
        Row: {
          action_type: string
          circuit_breaker_enabled: boolean | null
          circuit_open_until: string | null
          created_at: string | null
          current_failures: number | null
          description: string | null
          failure_threshold: number | null
          failure_window_minutes: number | null
          id: string
          is_enabled: boolean | null
          max_executions_per_day: number | null
          requires_approval: boolean | null
          risk_level: string | null
          updated_at: string | null
        }
        Insert: {
          action_type: string
          circuit_breaker_enabled?: boolean | null
          circuit_open_until?: string | null
          created_at?: string | null
          current_failures?: number | null
          description?: string | null
          failure_threshold?: number | null
          failure_window_minutes?: number | null
          id?: string
          is_enabled?: boolean | null
          max_executions_per_day?: number | null
          requires_approval?: boolean | null
          risk_level?: string | null
          updated_at?: string | null
        }
        Update: {
          action_type?: string
          circuit_breaker_enabled?: boolean | null
          circuit_open_until?: string | null
          created_at?: string | null
          current_failures?: number | null
          description?: string | null
          failure_threshold?: number | null
          failure_window_minutes?: number | null
          id?: string
          is_enabled?: boolean | null
          max_executions_per_day?: number | null
          requires_approval?: boolean | null
          risk_level?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_action_executions: {
        Row: {
          action_id: string | null
          created_at: string | null
          error_message: string | null
          executed_at: string | null
          executed_by: string | null
          execution_result: Json | null
          execution_status: string | null
          id: string
          tenant_id: string
        }
        Insert: {
          action_id?: string | null
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          executed_by?: string | null
          execution_result?: Json | null
          execution_status?: string | null
          id?: string
          tenant_id: string
        }
        Update: {
          action_id?: string | null
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          executed_by?: string | null
          execution_result?: Json | null
          execution_status?: string | null
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_executions_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "ai_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_action_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      ai_action_validations: {
        Row: {
          action_id: string
          confidence_score: number | null
          created_at: string
          id: string
          tenant_id: string
          validated_at: string | null
          validated_by: string | null
          validation_notes: string | null
          validation_passed: boolean | null
          validation_result: string
          validation_source: string
        }
        Insert: {
          action_id: string
          confidence_score?: number | null
          created_at?: string
          id?: string
          tenant_id: string
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
          validation_passed?: boolean | null
          validation_result: string
          validation_source: string
        }
        Update: {
          action_id?: string
          confidence_score?: number | null
          created_at?: string
          id?: string
          tenant_id?: string
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
          validation_passed?: boolean | null
          validation_result?: string
          validation_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_validations_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "ai_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_validations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_validations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_action_validations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      ai_actions: {
        Row: {
          action_payload: Json
          action_type: string
          ai_validated_at: string | null
          ai_validation_reason: string | null
          ai_validation_score: number | null
          ai_validation_status: string | null
          block_reason: string | null
          created_at: string
          decision_event_id: string | null
          effectiveness_checked_at: string | null
          effectiveness_evidence: Json | null
          effectiveness_status: string | null
          error_message: string | null
          evidence_pack: Json | null
          executed_at: string | null
          executed_by: string | null
          human_reviewed: boolean | null
          id: string
          insight_id: string | null
          reasoning_summary: string | null
          result: Json | null
          reversible: boolean | null
          review_decision: string | null
          review_justification: string | null
          risk_level: string | null
          rollback_reason: string | null
          rollback_status: string | null
          shadow_validation: Json | null
          status: string
          tenant_id: string
        }
        Insert: {
          action_payload?: Json
          action_type: string
          ai_validated_at?: string | null
          ai_validation_reason?: string | null
          ai_validation_score?: number | null
          ai_validation_status?: string | null
          block_reason?: string | null
          created_at?: string
          decision_event_id?: string | null
          effectiveness_checked_at?: string | null
          effectiveness_evidence?: Json | null
          effectiveness_status?: string | null
          error_message?: string | null
          evidence_pack?: Json | null
          executed_at?: string | null
          executed_by?: string | null
          human_reviewed?: boolean | null
          id?: string
          insight_id?: string | null
          reasoning_summary?: string | null
          result?: Json | null
          reversible?: boolean | null
          review_decision?: string | null
          review_justification?: string | null
          risk_level?: string | null
          rollback_reason?: string | null
          rollback_status?: string | null
          shadow_validation?: Json | null
          status?: string
          tenant_id: string
        }
        Update: {
          action_payload?: Json
          action_type?: string
          ai_validated_at?: string | null
          ai_validation_reason?: string | null
          ai_validation_score?: number | null
          ai_validation_status?: string | null
          block_reason?: string | null
          created_at?: string
          decision_event_id?: string | null
          effectiveness_checked_at?: string | null
          effectiveness_evidence?: Json | null
          effectiveness_status?: string | null
          error_message?: string | null
          evidence_pack?: Json | null
          executed_at?: string | null
          executed_by?: string | null
          human_reviewed?: boolean | null
          id?: string
          insight_id?: string | null
          reasoning_summary?: string | null
          result?: Json | null
          reversible?: boolean | null
          review_decision?: string | null
          review_justification?: string | null
          risk_level?: string | null
          rollback_reason?: string | null
          rollback_status?: string | null
          shadow_validation?: Json | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_actions_decision_event_id_fkey"
            columns: ["decision_event_id"]
            isOneToOne: false
            referencedRelation: "decision_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_actions_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "ai_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      ai_decision_reports: {
        Row: {
          engine_version: string
          generated_at: string | null
          generated_by: string | null
          id: string
          integrity_hash: string
          period_end: string
          period_start: string
          report_payload: Json
          tenant_id: string
        }
        Insert: {
          engine_version?: string
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          integrity_hash: string
          period_end: string
          period_start: string
          report_payload: Json
          tenant_id: string
        }
        Update: {
          engine_version?: string
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          integrity_hash?: string
          period_end?: string
          period_start?: string
          report_payload?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_decision_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decision_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_decision_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      ai_inference_metrics: {
        Row: {
          circuit_breaker_state: string | null
          created_at: string | null
          error: string | null
          function_name: string
          id: string
          latency_ms: number
          model: string
          request_metadata: Json | null
          success: boolean
          tenant_id: string | null
          tokens_completion: number | null
          tokens_prompt: number | null
          tokens_total: number | null
          used_fallback: boolean | null
        }
        Insert: {
          circuit_breaker_state?: string | null
          created_at?: string | null
          error?: string | null
          function_name: string
          id?: string
          latency_ms: number
          model: string
          request_metadata?: Json | null
          success?: boolean
          tenant_id?: string | null
          tokens_completion?: number | null
          tokens_prompt?: number | null
          tokens_total?: number | null
          used_fallback?: boolean | null
        }
        Update: {
          circuit_breaker_state?: string | null
          created_at?: string | null
          error?: string | null
          function_name?: string
          id?: string
          latency_ms?: number
          model?: string
          request_metadata?: Json | null
          success?: boolean
          tenant_id?: string | null
          tokens_completion?: number | null
          tokens_prompt?: number | null
          tokens_total?: number | null
          used_fallback?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_inference_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_inference_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_inference_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      ai_insight_feedback: {
        Row: {
          comment: string | null
          created_at: string | null
          feedback_type: string
          id: string
          insight_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          feedback_type: string
          id?: string
          insight_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          feedback_type?: string
          id?: string
          insight_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_insight_feedback_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "ai_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insight_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insight_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_insight_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          affected_resources: Json | null
          agent_id: string | null
          auto_action_executed: boolean | null
          auto_action_executed_at: string | null
          auto_action_mode: string | null
          category: string | null
          confidence_score: number | null
          created_at: string
          description: string
          evidence: Json
          evidence_pack: Json | null
          final_outcome: string | null
          id: string
          insight_type: string
          metadata: Json | null
          reasoning_summary: string | null
          recommendation: string | null
          recommended_actions: Json | null
          resolution_method: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_by_decision_event: string | null
          severity: string
          status: string
          tenant_id: string
          title: string
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          affected_resources?: Json | null
          agent_id?: string | null
          auto_action_executed?: boolean | null
          auto_action_executed_at?: string | null
          auto_action_mode?: string | null
          category?: string | null
          confidence_score?: number | null
          created_at?: string
          description: string
          evidence?: Json
          evidence_pack?: Json | null
          final_outcome?: string | null
          id?: string
          insight_type: string
          metadata?: Json | null
          reasoning_summary?: string | null
          recommendation?: string | null
          recommended_actions?: Json | null
          resolution_method?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_decision_event?: string | null
          severity: string
          status?: string
          tenant_id: string
          title: string
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          affected_resources?: Json | null
          agent_id?: string | null
          auto_action_executed?: boolean | null
          auto_action_executed_at?: string | null
          auto_action_mode?: string | null
          category?: string | null
          confidence_score?: number | null
          created_at?: string
          description?: string
          evidence?: Json
          evidence_pack?: Json | null
          final_outcome?: string | null
          id?: string
          insight_type?: string
          metadata?: Json | null
          reasoning_summary?: string | null
          recommendation?: string | null
          recommended_actions?: Json | null
          resolution_method?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_decision_event?: string | null
          severity?: string
          status?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_resolved_by_decision_event_fkey"
            columns: ["resolved_by_decision_event"]
            isOneToOne: false
            referencedRelation: "decision_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_insights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      ai_learned_patterns: {
        Row: {
          confidence: number | null
          first_seen: string
          id: string
          last_seen: string
          metadata: Json | null
          occurrences: number | null
          pattern_data: Json
          pattern_type: string
          tenant_id: string
        }
        Insert: {
          confidence?: number | null
          first_seen?: string
          id?: string
          last_seen?: string
          metadata?: Json | null
          occurrences?: number | null
          pattern_data: Json
          pattern_type: string
          tenant_id: string
        }
        Update: {
          confidence?: number | null
          first_seen?: string
          id?: string
          last_seen?: string
          metadata?: Json | null
          occurrences?: number | null
          pattern_data?: Json
          pattern_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_learned_patterns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_learned_patterns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_learned_patterns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      ai_rejected_decisions: {
        Row: {
          action_type: string
          confidence_score: number | null
          id: string
          input_parameters: Json | null
          insight_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string
          tenant_id: string
        }
        Insert: {
          action_type: string
          confidence_score?: number | null
          id?: string
          input_parameters?: Json | null
          insight_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason: string
          tenant_id: string
        }
        Update: {
          action_type?: string
          confidence_score?: number | null
          id?: string
          input_parameters?: Json | null
          insight_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_rejected_decisions_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "ai_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_rejected_decisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_rejected_decisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_rejected_decisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      anomaly_events: {
        Row: {
          acknowledged_at: string | null
          agent_id: string
          created_at: string
          data: Json | null
          description: string | null
          id: string
          severity: string
          tenant_id: string
          type: string
        }
        Insert: {
          acknowledged_at?: string | null
          agent_id: string
          created_at?: string
          data?: Json | null
          description?: string | null
          id?: string
          severity: string
          tenant_id: string
          type: string
        }
        Update: {
          acknowledged_at?: string | null
          agent_id?: string
          created_at?: string
          data?: Json | null
          description?: string | null
          id?: string
          severity?: string
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "anomaly_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "anomaly_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "anomaly_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "anomaly_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "anomaly_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      antivirus_status: {
        Row: {
          agent_id: string
          collected_at: string
          engine_name: string
          engine_version: string | null
          id: string
          last_scan_at: string | null
          last_update_at: string | null
          raw_data: Json | null
          status: string | null
          tenant_id: string
          threats_found: number | null
        }
        Insert: {
          agent_id: string
          collected_at?: string
          engine_name: string
          engine_version?: string | null
          id?: string
          last_scan_at?: string | null
          last_update_at?: string | null
          raw_data?: Json | null
          status?: string | null
          tenant_id: string
          threats_found?: number | null
        }
        Update: {
          agent_id?: string
          collected_at?: string
          engine_name?: string
          engine_version?: string | null
          id?: string
          last_scan_at?: string | null
          last_update_at?: string | null
          raw_data?: Json | null
          status?: string | null
          tenant_id?: string
          threats_found?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "antivirus_status_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "antivirus_status_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "antivirus_status_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "antivirus_status_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "antivirus_status_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "antivirus_status_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "antivirus_status_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "antivirus_status_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "antivirus_status_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "antivirus_status_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "antivirus_status_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "antivirus_status_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          metadata: Json | null
          name: string
          scopes: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          metadata?: Json | null
          name: string
          scopes?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          metadata?: Json | null
          name?: string
          scopes?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      api_request_logs: {
        Row: {
          api_key_id: string | null
          created_at: string
          endpoint: string
          id: string
          ip_address: string | null
          method: string
          response_time_ms: number | null
          status_code: number
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          endpoint: string
          id?: string
          ip_address?: string | null
          method: string
          response_time_ms?: number | null
          status_code: number
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          ip_address?: string | null
          method?: string
          response_time_ms?: number | null
          status_code?: number
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_request_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_request_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "api_request_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      approval_chains: {
        Row: {
          applies_to_actions: string[]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          min_approvers: number
          name: string
          require_different_approvers: boolean | null
          tenant_id: string
          timeout_hours: number
          updated_at: string
        }
        Insert: {
          applies_to_actions?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          min_approvers?: number
          name: string
          require_different_approvers?: boolean | null
          tenant_id: string
          timeout_hours?: number
          updated_at?: string
        }
        Update: {
          applies_to_actions?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          min_approvers?: number
          name?: string
          require_different_approvers?: boolean | null
          tenant_id?: string
          timeout_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_chains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_chains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "approval_chains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          action_payload: Json
          action_type: string
          approval_token: string | null
          approval_token_expires_at: string | null
          approved_at: string | null
          chain_id: string | null
          created_at: string
          current_approvers: number
          executed_at: string | null
          expires_at: string
          id: string
          playbook_execution_id: string | null
          rejection_reason: string | null
          requested_by: string
          required_approvers: number
          status: string
          target_agent_id: string | null
          tenant_id: string
        }
        Insert: {
          action_payload?: Json
          action_type: string
          approval_token?: string | null
          approval_token_expires_at?: string | null
          approved_at?: string | null
          chain_id?: string | null
          created_at?: string
          current_approvers?: number
          executed_at?: string | null
          expires_at: string
          id?: string
          playbook_execution_id?: string | null
          rejection_reason?: string | null
          requested_by: string
          required_approvers?: number
          status?: string
          target_agent_id?: string | null
          tenant_id: string
        }
        Update: {
          action_payload?: Json
          action_type?: string
          approval_token?: string | null
          approval_token_expires_at?: string | null
          approved_at?: string | null
          chain_id?: string | null
          created_at?: string
          current_approvers?: number
          executed_at?: string | null
          expires_at?: string
          id?: string
          playbook_execution_id?: string | null
          rejection_reason?: string | null
          requested_by?: string
          required_approvers?: number
          status?: string
          target_agent_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "approval_chains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_playbook_execution_id_fkey"
            columns: ["playbook_execution_id"]
            isOneToOne: false
            referencedRelation: "playbook_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "approval_requests_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "approval_requests_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "approval_requests_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "approval_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      approvals: {
        Row: {
          approved_by: string
          created_at: string
          decision: string
          id: string
          reason: string | null
          request_id: string
        }
        Insert: {
          approved_by: string
          created_at?: string
          decision: string
          id?: string
          reason?: string | null
          request_id: string
        }
        Update: {
          approved_by?: string
          created_at?: string
          decision?: string
          id?: string
          reason?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_confidence_gaps: {
        Row: {
          alert_reason: string | null
          alert_triggered: boolean | null
          ana_score: number
          audit_id: string | null
          confidence_gap: number
          created_at: string
          dimension_gaps: Json | null
          gap_delta: number | null
          health_status: string
          id: string
          previous_gap: number | null
          red_score: number
          red_team_id: string | null
          tenant_id: string
        }
        Insert: {
          alert_reason?: string | null
          alert_triggered?: boolean | null
          ana_score: number
          audit_id?: string | null
          confidence_gap: number
          created_at?: string
          dimension_gaps?: Json | null
          gap_delta?: number | null
          health_status: string
          id?: string
          previous_gap?: number | null
          red_score: number
          red_team_id?: string | null
          tenant_id: string
        }
        Update: {
          alert_reason?: string | null
          alert_triggered?: boolean | null
          ana_score?: number
          audit_id?: string | null
          confidence_gap?: number
          created_at?: string
          dimension_gaps?: Json | null
          gap_delta?: number | null
          health_status?: string
          id?: string
          previous_gap?: number | null
          red_score?: number
          red_team_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_confidence_gaps_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "system_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_confidence_gaps_red_team_id_fkey"
            columns: ["red_team_id"]
            isOneToOne: false
            referencedRelation: "red_team_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_confidence_gaps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_confidence_gaps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "audit_confidence_gaps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      audit_integrity_checks: {
        Row: {
          alert_sent: boolean | null
          breaks_detected: number | null
          broken_log_id: string | null
          chain_valid: boolean
          checked_at: string | null
          first_break_at: string | null
          id: string
          logs_checked: number
          tenant_id: string
        }
        Insert: {
          alert_sent?: boolean | null
          breaks_detected?: number | null
          broken_log_id?: string | null
          chain_valid?: boolean
          checked_at?: string | null
          first_break_at?: string | null
          id?: string
          logs_checked?: number
          tenant_id: string
        }
        Update: {
          alert_sent?: boolean | null
          breaks_detected?: number | null
          broken_log_id?: string | null
          chain_valid?: boolean
          checked_at?: string | null
          first_break_at?: string | null
          id?: string
          logs_checked?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_integrity_checks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_integrity_checks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "audit_integrity_checks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          id: string
          integrity_hash: string | null
          ip_address: string | null
          previous_log_hash: string | null
          request_id: string | null
          resource_id: string | null
          resource_type: string
          state_after: Json | null
          state_before: Json | null
          success: boolean
          tenant_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          integrity_hash?: string | null
          ip_address?: string | null
          previous_log_hash?: string | null
          request_id?: string | null
          resource_id?: string | null
          resource_type: string
          state_after?: Json | null
          state_before?: Json | null
          success?: boolean
          tenant_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          integrity_hash?: string | null
          ip_address?: string | null
          previous_log_hash?: string | null
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string
          state_after?: Json | null
          state_before?: Json | null
          success?: boolean
          tenant_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_audit_logs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_audit_logs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_audit_logs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      audit_reason_trees: {
        Row: {
          audit_id: string | null
          generated_at: string | null
          id: string
          reasons: Json
          score: number
          tenant_id: string
          verdict: string | null
        }
        Insert: {
          audit_id?: string | null
          generated_at?: string | null
          id?: string
          reasons?: Json
          score: number
          tenant_id: string
          verdict?: string | null
        }
        Update: {
          audit_id?: string | null
          generated_at?: string | null
          id?: string
          reasons?: Json
          score?: number
          tenant_id?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_reason_trees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_reason_trees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "audit_reason_trees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      audit_report_verifications: {
        Row: {
          audit_id: string
          created_at: string | null
          hmac_valid: boolean
          id: string
          report_id: string | null
          sha256_match: boolean
          verification_details: Json | null
          verification_ip: string | null
          verification_method: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          audit_id: string
          created_at?: string | null
          hmac_valid: boolean
          id?: string
          report_id?: string | null
          sha256_match: boolean
          verification_details?: Json | null
          verification_ip?: string | null
          verification_method?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          audit_id?: string
          created_at?: string | null
          hmac_valid?: boolean
          id?: string
          report_id?: string | null
          sha256_match?: boolean
          verification_details?: Json | null
          verification_ip?: string | null
          verification_method?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_report_verifications_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "generated_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      blast_radius_policies: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          is_active: boolean | null
          max_affected_count: number | null
          max_affected_percent: number | null
          require_approval_above: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_affected_count?: number | null
          max_affected_percent?: number | null
          require_approval_above?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_affected_count?: number | null
          max_affected_percent?: number | null
          require_approval_above?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blast_radius_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blast_radius_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "blast_radius_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      blocked_access_attempts: {
        Row: {
          agent_id: string
          agent_name: string
          attempted_at: string
          blocked_by: string
          created_at: string
          domain: string
          id: string
          policy_id: string | null
          source: string | null
          tenant_id: string
          user_name: string | null
        }
        Insert: {
          agent_id: string
          agent_name: string
          attempted_at?: string
          blocked_by?: string
          created_at?: string
          domain: string
          id?: string
          policy_id?: string | null
          source?: string | null
          tenant_id: string
          user_name?: string | null
        }
        Update: {
          agent_id?: string
          agent_name?: string
          attempted_at?: string
          blocked_by?: string
          created_at?: string
          domain?: string
          id?: string
          policy_id?: string | null
          source?: string | null
          tenant_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_access_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_access_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_access_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_access_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_access_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "blocked_access_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "blocked_access_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_access_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "blocked_access_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_access_attempts_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "blocked_websites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_access_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_access_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "blocked_access_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      blocked_websites: {
        Row: {
          blocked_by: string | null
          created_at: string | null
          domain_pattern: string
          group_id: string | null
          id: string
          is_active: boolean | null
          reason: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string | null
          domain_pattern: string
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          reason?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          blocked_by?: string | null
          created_at?: string | null
          domain_pattern?: string
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          reason?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_websites_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_websites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "agent_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_websites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_websites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "blocked_websites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      chaos_test_results: {
        Row: {
          created_at: string
          errors: number
          executed_at: string
          execution_time_ms: number | null
          failed: number
          global_result: string
          id: string
          passed: number
          report: Json
          total_tests: number
        }
        Insert: {
          created_at?: string
          errors: number
          executed_at?: string
          execution_time_ms?: number | null
          failed: number
          global_result: string
          id?: string
          passed: number
          report: Json
          total_tests: number
        }
        Update: {
          created_at?: string
          errors?: number
          executed_at?: string
          execution_time_ms?: number | null
          failed?: number
          global_result?: string
          id?: string
          passed?: number
          report?: Json
          total_tests?: number
        }
        Relationships: []
      }
      circuit_breaker_events: {
        Row: {
          created_at: string | null
          failure_count: number | null
          id: string
          previous_state: string | null
          reason: string | null
          service: string
          state: string
          tenant_id: string | null
          triggered_by: string | null
        }
        Insert: {
          created_at?: string | null
          failure_count?: number | null
          id?: string
          previous_state?: string | null
          reason?: string | null
          service: string
          state: string
          tenant_id?: string | null
          triggered_by?: string | null
        }
        Update: {
          created_at?: string | null
          failure_count?: number | null
          id?: string
          previous_state?: string | null
          reason?: string | null
          service?: string
          state?: string
          tenant_id?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "circuit_breaker_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circuit_breaker_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "circuit_breaker_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      compliance_policies: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content_hash: string | null
          created_at: string
          effective_date: string | null
          file_path: string | null
          id: string
          owner: string | null
          policy_code: string
          policy_name: string
          review_date: string | null
          soc2_criteria: string[] | null
          status: string
          tenant_id: string
          updated_at: string
          version: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content_hash?: string | null
          created_at?: string
          effective_date?: string | null
          file_path?: string | null
          id?: string
          owner?: string | null
          policy_code: string
          policy_name: string
          review_date?: string | null
          soc2_criteria?: string[] | null
          status?: string
          tenant_id: string
          updated_at?: string
          version?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content_hash?: string | null
          created_at?: string
          effective_date?: string | null
          file_path?: string | null
          id?: string
          owner?: string | null
          policy_code?: string
          policy_name?: string
          review_date?: string | null
          soc2_criteria?: string[] | null
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "compliance_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      custom_trials: {
        Row: {
          company_name: string
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string
          id: string
          notes: string | null
          status: string
          tenant_id: string | null
          trial_days: number
          trial_end: string
          trial_start: string
          updated_at: string
        }
        Insert: {
          company_name: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          notes?: string | null
          status?: string
          tenant_id?: string | null
          trial_days?: number
          trial_end: string
          trial_start?: string
          updated_at?: string
        }
        Update: {
          company_name?: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          notes?: string | null
          status?: string
          tenant_id?: string | null
          trial_days?: number
          trial_end?: string
          trial_start?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_trials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_trials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "custom_trials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      cve_database: {
        Row: {
          affected_products: Json | null
          affected_versions: Json | null
          cached_at: string | null
          cpe_matches: Json | null
          created_at: string | null
          cve_id: string
          cve_references: Json | null
          cvss_score: number | null
          cvss_vector: string | null
          cvss_version: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_modified: string | null
          published_date: string | null
          severity: string | null
          source: string | null
          weaknesses: Json | null
        }
        Insert: {
          affected_products?: Json | null
          affected_versions?: Json | null
          cached_at?: string | null
          cpe_matches?: Json | null
          created_at?: string | null
          cve_id: string
          cve_references?: Json | null
          cvss_score?: number | null
          cvss_vector?: string | null
          cvss_version?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_modified?: string | null
          published_date?: string | null
          severity?: string | null
          source?: string | null
          weaknesses?: Json | null
        }
        Update: {
          affected_products?: Json | null
          affected_versions?: Json | null
          cached_at?: string | null
          cpe_matches?: Json | null
          created_at?: string | null
          cve_id?: string
          cve_references?: Json | null
          cvss_score?: number | null
          cvss_vector?: string | null
          cvss_version?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_modified?: string | null
          published_date?: string | null
          severity?: string | null
          source?: string | null
          weaknesses?: Json | null
        }
        Relationships: []
      }
      cve_sync_status: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          last_modified_date: string | null
          last_sync_at: string | null
          sync_status: string | null
          total_cves_synced: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_modified_date?: string | null
          last_sync_at?: string | null
          sync_status?: string | null
          total_cves_synced?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_modified_date?: string | null
          last_sync_at?: string | null
          sync_status?: string | null
          total_cves_synced?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      decision_events: {
        Row: {
          action: string
          actions_executed: Json | null
          agent_id: string | null
          agent_name: string | null
          created_at: string
          decision_source: string
          decision_type: string
          evidence: Json
          id: string
          rule_code: string
          tenant_id: string
        }
        Insert: {
          action: string
          actions_executed?: Json | null
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string
          decision_source: string
          decision_type: string
          evidence?: Json
          id?: string
          rule_code: string
          tenant_id: string
        }
        Update: {
          action?: string
          actions_executed?: Json | null
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string
          decision_source?: string
          decision_type?: string
          evidence?: Json
          id?: string
          rule_code?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "decision_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "decision_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "decision_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "decision_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      decision_rules: {
        Row: {
          auto_execute: boolean | null
          code: string
          created_at: string
          definition: Json
          description: string
          id: string
          is_enabled: boolean
          scope: string
          updated_at: string | null
        }
        Insert: {
          auto_execute?: boolean | null
          code: string
          created_at?: string
          definition?: Json
          description: string
          id?: string
          is_enabled?: boolean
          scope?: string
          updated_at?: string | null
        }
        Update: {
          auto_execute?: boolean | null
          code?: string
          created_at?: string
          definition?: Json
          description?: string
          id?: string
          is_enabled?: boolean
          scope?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      edge_function_metrics: {
        Row: {
          created_at: string
          error_message: string | null
          function_name: string
          id: string
          latency_ms: number
          request_metadata: Json | null
          status_code: number | null
          success: boolean
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          function_name: string
          id?: string
          latency_ms: number
          request_metadata?: Json | null
          status_code?: number | null
          success?: boolean
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          function_name?: string
          id?: string
          latency_ms?: number
          request_metadata?: Json | null
          status_code?: number | null
          success?: boolean
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edge_function_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edge_function_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "edge_function_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      enrollment_keys: {
        Row: {
          agent_id: string | null
          agent_token: string | null
          created_at: string
          created_by: string | null
          current_uses: number
          description: string | null
          expiration_notified_at: string | null
          expires_at: string
          id: string
          installer_generated_at: string | null
          installer_sha256: string | null
          installer_size_bytes: number | null
          is_active: boolean
          key: string | null
          key_hash: string | null
          max_uses: number
          tenant_id: string
          used_at: string | null
          used_by_agent: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_token?: string | null
          created_at?: string
          created_by?: string | null
          current_uses?: number
          description?: string | null
          expiration_notified_at?: string | null
          expires_at: string
          id?: string
          installer_generated_at?: string | null
          installer_sha256?: string | null
          installer_size_bytes?: number | null
          is_active?: boolean
          key?: string | null
          key_hash?: string | null
          max_uses?: number
          tenant_id: string
          used_at?: string | null
          used_by_agent?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_token?: string | null
          created_at?: string
          created_by?: string | null
          current_uses?: number
          description?: string | null
          expiration_notified_at?: string | null
          expires_at?: string
          id?: string
          installer_generated_at?: string | null
          installer_sha256?: string | null
          installer_size_bytes?: number | null
          is_active?: boolean
          key?: string | null
          key_hash?: string | null
          max_uses?: number
          tenant_id?: string
          used_at?: string | null
          used_by_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "enrollment_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_enrollment_keys_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollment_keys_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_enrollment_keys_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      event_risk_scoring: {
        Row: {
          auto_action_threshold: number | null
          created_at: string | null
          description: string | null
          event_type: string
          id: string
          is_active: boolean | null
          risk_multipliers: Json | null
          severity_base: number
          updated_at: string | null
        }
        Insert: {
          auto_action_threshold?: number | null
          created_at?: string | null
          description?: string | null
          event_type: string
          id?: string
          is_active?: boolean | null
          risk_multipliers?: Json | null
          severity_base: number
          updated_at?: string | null
        }
        Update: {
          auto_action_threshold?: number | null
          created_at?: string | null
          description?: string | null
          event_type?: string
          id?: string
          is_active?: boolean | null
          risk_multipliers?: Json | null
          severity_base?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      evidence_bundles: {
        Row: {
          audit_id: string
          bundle_type: string
          created_at: string
          created_by: string | null
          download_expires_at: string | null
          download_url: string | null
          file_count: number
          id: string
          included_evidence: Json
          manifest_hash: string
          period_end: string
          period_start: string
          tenant_id: string
          total_size_bytes: number
          verification_url: string | null
        }
        Insert: {
          audit_id: string
          bundle_type?: string
          created_at?: string
          created_by?: string | null
          download_expires_at?: string | null
          download_url?: string | null
          file_count?: number
          id?: string
          included_evidence?: Json
          manifest_hash: string
          period_end: string
          period_start: string
          tenant_id: string
          total_size_bytes?: number
          verification_url?: string | null
        }
        Update: {
          audit_id?: string
          bundle_type?: string
          created_at?: string
          created_by?: string | null
          download_expires_at?: string | null
          download_url?: string | null
          file_count?: number
          id?: string
          included_evidence?: Json
          manifest_hash?: string
          period_end?: string
          period_start?: string
          tenant_id?: string
          total_size_bytes?: number
          verification_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_bundles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_bundles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "evidence_bundles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      failed_jobs_dlq: {
        Row: {
          agent_id: string | null
          agent_name: string
          auto_flagged_reason: string | null
          classification: string | null
          created_at: string | null
          error_count: number | null
          error_message: string | null
          failure_class: string | null
          first_failure_at: string | null
          flagged_suspicious: boolean | null
          id: string
          job_type: string
          last_failure_at: string | null
          max_retries: number | null
          metadata: Json | null
          next_retry_at: string | null
          original_job_id: string
          payload: Json | null
          payload_excerpt: string | null
          payload_hash: string | null
          payload_schema: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          retry_count: number | null
          review_notes: string | null
          review_required: boolean | null
          risk_category: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name: string
          auto_flagged_reason?: string | null
          classification?: string | null
          created_at?: string | null
          error_count?: number | null
          error_message?: string | null
          failure_class?: string | null
          first_failure_at?: string | null
          flagged_suspicious?: boolean | null
          id?: string
          job_type: string
          last_failure_at?: string | null
          max_retries?: number | null
          metadata?: Json | null
          next_retry_at?: string | null
          original_job_id: string
          payload?: Json | null
          payload_excerpt?: string | null
          payload_hash?: string | null
          payload_schema?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number | null
          review_notes?: string | null
          review_required?: boolean | null
          risk_category?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string
          auto_flagged_reason?: string | null
          classification?: string | null
          created_at?: string | null
          error_count?: number | null
          error_message?: string | null
          failure_class?: string | null
          first_failure_at?: string | null
          flagged_suspicious?: boolean | null
          id?: string
          job_type?: string
          last_failure_at?: string | null
          max_retries?: number | null
          metadata?: Json | null
          next_retry_at?: string | null
          original_job_id?: string
          payload?: Json | null
          payload_excerpt?: string | null
          payload_hash?: string | null
          payload_schema?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number | null
          review_notes?: string | null
          review_required?: boolean | null
          risk_category?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      failed_login_attempts: {
        Row: {
          block_count: number | null
          blocked_until: string | null
          created_at: string
          email: string | null
          id: string
          ip_address: string
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          block_count?: number | null
          blocked_until?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip_address: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          block_count?: number | null
          blocked_until?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip_address?: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "failed_login_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_login_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "failed_login_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      forensic_snapshots: {
        Row: {
          agent_id: string
          config_snapshot: Json | null
          created_at: string | null
          expires_at: string | null
          id: string
          metadata: Json | null
          network_snapshot: Json | null
          process_snapshot: Json | null
          system_liveness_snapshot: Json | null
          tenant_id: string
          trigger_event_id: string | null
          trigger_reason: string
        }
        Insert: {
          agent_id: string
          config_snapshot?: Json | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          network_snapshot?: Json | null
          process_snapshot?: Json | null
          system_liveness_snapshot?: Json | null
          tenant_id: string
          trigger_event_id?: string | null
          trigger_reason: string
        }
        Update: {
          agent_id?: string
          config_snapshot?: Json | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          network_snapshot?: Json | null
          process_snapshot?: Json | null
          system_liveness_snapshot?: Json | null
          tenant_id?: string
          trigger_event_id?: string | null
          trigger_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "forensic_snapshots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forensic_snapshots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forensic_snapshots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forensic_snapshots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forensic_snapshots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "forensic_snapshots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "forensic_snapshots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forensic_snapshots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "forensic_snapshots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forensic_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forensic_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "forensic_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      generated_reports: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          audit_id: string | null
          commercial_priority: string | null
          commercial_summary: string | null
          contacted_at: string | null
          created_at: string | null
          expires_at: string | null
          file_path: string | null
          file_url: string | null
          follow_up_at: string | null
          hmac_signature: string | null
          id: string
          job_id: string | null
          next_action: string | null
          report_data: Json | null
          report_type: string
          risk_level: string | null
          risk_score: number | null
          sales_status: string | null
          sha256: string | null
          statistics: Json | null
          status: string | null
          tenant_id: string
          title: string
          triggered_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          audit_id?: string | null
          commercial_priority?: string | null
          commercial_summary?: string | null
          contacted_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          file_path?: string | null
          file_url?: string | null
          follow_up_at?: string | null
          hmac_signature?: string | null
          id?: string
          job_id?: string | null
          next_action?: string | null
          report_data?: Json | null
          report_type: string
          risk_level?: string | null
          risk_score?: number | null
          sales_status?: string | null
          sha256?: string | null
          statistics?: Json | null
          status?: string | null
          tenant_id: string
          title: string
          triggered_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          audit_id?: string | null
          commercial_priority?: string | null
          commercial_summary?: string | null
          contacted_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          file_path?: string | null
          file_url?: string | null
          follow_up_at?: string | null
          hmac_signature?: string | null
          id?: string
          job_id?: string | null
          next_action?: string | null
          report_data?: Json | null
          report_type?: string
          risk_level?: string | null
          risk_score?: number | null
          sales_status?: string | null
          sha256?: string | null
          statistics?: Json | null
          status?: string | null
          tenant_id?: string
          title?: string
          triggered_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "generated_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "generated_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "generated_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_integrity_violations"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "generated_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_normalized"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_jobs_status_corrected"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_jobs_report"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "generated_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      hmac_signatures_2025_12: {
        Row: {
          agent_name: string
          id: string
          signature: string
          used_at: string
        }
        Insert: {
          agent_name: string
          id?: string
          signature: string
          used_at?: string
        }
        Update: {
          agent_name?: string
          id?: string
          signature?: string
          used_at?: string
        }
        Relationships: []
      }
      hmac_signatures_2026_01: {
        Row: {
          agent_name: string
          id: string
          signature: string
          used_at: string
        }
        Insert: {
          agent_name: string
          id?: string
          signature: string
          used_at?: string
        }
        Update: {
          agent_name?: string
          id?: string
          signature?: string
          used_at?: string
        }
        Relationships: []
      }
      hmac_signatures_partitioned: {
        Row: {
          agent_name: string
          id: string
          signature: string
          used_at: string
        }
        Insert: {
          agent_name: string
          id?: string
          signature: string
          used_at?: string
        }
        Update: {
          agent_name?: string
          id?: string
          signature?: string
          used_at?: string
        }
        Relationships: []
      }
      incident_timelines: {
        Row: {
          agent_id: string | null
          causal_chain: Json
          created_at: string
          id: string
          incident_type: string
          narrative_summary: string | null
          resolution: string | null
          resolved_at: string | null
          root_cause: string | null
          severity: string
          started_at: string
          status: string
          tenant_id: string
          timeline_events: Json
          title: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          causal_chain?: Json
          created_at?: string
          id?: string
          incident_type: string
          narrative_summary?: string | null
          resolution?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          severity: string
          started_at: string
          status?: string
          tenant_id: string
          timeline_events?: Json
          title: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          causal_chain?: Json
          created_at?: string
          id?: string
          incident_type?: string
          narrative_summary?: string | null
          resolution?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          severity?: string
          started_at?: string
          status?: string
          tenant_id?: string
          timeline_events?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_timelines_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_timelines_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_timelines_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_timelines_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_timelines_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "incident_timelines_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "incident_timelines_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_timelines_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "incident_timelines_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_timelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_timelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "incident_timelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      installation_analytics: {
        Row: {
          agent_id: string | null
          agent_name: string
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          installation_method: string | null
          installation_time_seconds: number | null
          ip_address: string | null
          metadata: Json | null
          network_connectivity: boolean | null
          platform: string
          success: boolean | null
          telemetry_hash: string | null
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name: string
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          installation_method?: string | null
          installation_time_seconds?: number | null
          ip_address?: string | null
          metadata?: Json | null
          network_connectivity?: boolean | null
          platform: string
          success?: boolean | null
          telemetry_hash?: string | null
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          installation_method?: string | null
          installation_time_seconds?: number | null
          ip_address?: string | null
          metadata?: Json | null
          network_connectivity?: boolean | null
          platform?: string
          success?: boolean | null
          telemetry_hash?: string | null
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "installation_analytics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_analytics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_analytics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_analytics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_analytics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "installation_analytics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "installation_analytics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_analytics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "installation_analytics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "installation_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          tenant_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_invites_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_invites_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_invites_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      ip_blocklist: {
        Row: {
          blocked_until: string
          created_at: string
          id: string
          ip_address: string
          reason: string
        }
        Insert: {
          blocked_until: string
          created_at?: string
          id?: string
          ip_address: string
          reason: string
        }
        Update: {
          blocked_until?: string
          created_at?: string
          id?: string
          ip_address?: string
          reason?: string
        }
        Relationships: []
      }
      job_executions: {
        Row: {
          agent_id: string
          agent_name: string
          agent_version: string
          claimed_at: string
          created_at: string
          error_message: string | null
          execution_hash: string | null
          execution_index: number | null
          execution_time_seconds: number | null
          exit_code: number | null
          finished_at: string | null
          id: string
          job_id: string
          legacy: boolean | null
          nonce: string
          output_hash: string | null
          payload_hash: string
          previous_execution_hash: string | null
          result_signature: string | null
          signature_algorithm: string | null
          signature_verified: boolean | null
          started_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          agent_id: string
          agent_name: string
          agent_version: string
          claimed_at?: string
          created_at?: string
          error_message?: string | null
          execution_hash?: string | null
          execution_index?: number | null
          execution_time_seconds?: number | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          job_id: string
          legacy?: boolean | null
          nonce?: string
          output_hash?: string | null
          payload_hash: string
          previous_execution_hash?: string | null
          result_signature?: string | null
          signature_algorithm?: string | null
          signature_verified?: boolean | null
          started_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          agent_id?: string
          agent_name?: string
          agent_version?: string
          claimed_at?: string
          created_at?: string
          error_message?: string | null
          execution_hash?: string | null
          execution_index?: number | null
          execution_time_seconds?: number | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          job_id?: string
          legacy?: boolean | null
          nonce?: string
          output_hash?: string | null
          payload_hash?: string
          previous_execution_hash?: string | null
          result_signature?: string | null
          signature_algorithm?: string | null
          signature_verified?: boolean | null
          started_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "job_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "job_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "job_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_executions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_integrity_violations"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_executions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_executions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_normalized"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_executions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_jobs_status_corrected"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_executions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_executions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_jobs_report"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "job_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      jobs: {
        Row: {
          agent_id: string | null
          agent_name: string
          approved: boolean
          completed_at: string | null
          created_at: string
          current_execution_id: string | null
          delivered_at: string | null
          delivery_attempts: number
          error_message: string | null
          execution_time_seconds: number | null
          expires_at: string | null
          failure_class: string | null
          finished_at: string | null
          id: string
          is_recurring: boolean | null
          last_run_at: string | null
          next_run_at: string | null
          output: Json | null
          parent_job_id: string | null
          payload: Json | null
          payload_hash: string
          priority: number | null
          recurrence_pattern: string | null
          retry_count: number | null
          scheduled_at: string | null
          started_at: string | null
          status: string
          tenant_id: string
          type: string
        }
        Insert: {
          agent_id?: string | null
          agent_name: string
          approved?: boolean
          completed_at?: string | null
          created_at?: string
          current_execution_id?: string | null
          delivered_at?: string | null
          delivery_attempts?: number
          error_message?: string | null
          execution_time_seconds?: number | null
          expires_at?: string | null
          failure_class?: string | null
          finished_at?: string | null
          id?: string
          is_recurring?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          output?: Json | null
          parent_job_id?: string | null
          payload?: Json | null
          payload_hash: string
          priority?: number | null
          recurrence_pattern?: string | null
          retry_count?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          tenant_id: string
          type: string
        }
        Update: {
          agent_id?: string | null
          agent_name?: string
          approved?: boolean
          completed_at?: string | null
          created_at?: string
          current_execution_id?: string | null
          delivered_at?: string | null
          delivery_attempts?: number
          error_message?: string | null
          execution_time_seconds?: number | null
          expires_at?: string | null
          failure_class?: string | null
          finished_at?: string | null
          id?: string
          is_recurring?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          output?: Json | null
          parent_job_id?: string | null
          payload?: Json | null
          payload_hash?: string
          priority?: number | null
          recurrence_pattern?: string | null
          retry_count?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_current_execution_id_fkey"
            columns: ["current_execution_id"]
            isOneToOne: false
            referencedRelation: "job_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "job_integrity_violations"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "jobs_normalized"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "v_jobs_status_corrected"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_jobs_report"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      marketing_costs: {
        Row: {
          channel: string
          conversions: number
          created_at: string
          created_by: string | null
          id: string
          leads_generated: number
          month: string
          notes: string | null
          spend_cents: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          channel?: string
          conversions?: number
          created_at?: string
          created_by?: string | null
          id?: string
          leads_generated?: number
          month: string
          notes?: string | null
          spend_cents?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          conversions?: number
          created_at?: string
          created_by?: string | null
          id?: string
          leads_generated?: number
          month?: string
          notes?: string | null
          spend_cents?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_costs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_costs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "marketing_costs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      network_anomalies: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          agent_id: string
          anomaly_type: string
          created_at: string
          description: string | null
          destination_ip: string | null
          detected_at: string
          id: string
          port: number | null
          protocol: string | null
          raw_data: Json | null
          severity: string
          source_ip: string | null
          tenant_id: string
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          agent_id: string
          anomaly_type: string
          created_at?: string
          description?: string | null
          destination_ip?: string | null
          detected_at?: string
          id?: string
          port?: number | null
          protocol?: string | null
          raw_data?: Json | null
          severity: string
          source_ip?: string | null
          tenant_id: string
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          agent_id?: string
          anomaly_type?: string
          created_at?: string
          description?: string | null
          destination_ip?: string | null
          detected_at?: string
          id?: string
          port?: number | null
          protocol?: string | null
          raw_data?: Json | null
          severity?: string
          source_ip?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_anomalies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_anomalies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_anomalies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_anomalies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_anomalies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "network_anomalies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "network_anomalies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_anomalies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "network_anomalies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_anomalies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_anomalies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "network_anomalies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      notification_channels: {
        Row: {
          channel_type: string
          config: Json
          created_at: string
          id: string
          is_active: boolean
          is_verified: boolean
          name: string
          tenant_id: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          channel_type: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          is_verified?: boolean
          name: string
          tenant_id: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          channel_type?: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          is_verified?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "notification_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      notification_log: {
        Row: {
          alert_id: string | null
          channel_id: string | null
          channel_type: string
          created_at: string
          error_message: string | null
          external_id: string | null
          id: string
          message_preview: string | null
          recipient: string
          sent_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          alert_id?: string | null
          channel_id?: string | null
          channel_type: string
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          message_preview?: string | null
          recipient: string
          sent_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          alert_id?: string | null
          channel_id?: string | null
          channel_type?: string
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          message_preview?: string | null
          recipient?: string
          sent_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "system_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "notification_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "notification_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          alert_types: string[]
          channel_id: string
          created_at: string
          enabled: boolean
          id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          quiet_hours_timezone: string | null
          severity_filter: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          alert_types?: string[]
          channel_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          quiet_hours_timezone?: string | null
          severity_filter?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          alert_types?: string[]
          channel_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          quiet_hours_timezone?: string | null
          severity_filter?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "notification_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "notification_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          channel: string
          created_at: string | null
          error_message: string | null
          id: string
          message_content: string | null
          priority: string | null
          recipient: string | null
          report_id: string | null
          retry_count: number | null
          scheduled_for: string | null
          sent_at: string | null
          status: string | null
          tenant_id: string
        }
        Insert: {
          channel: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_content?: string | null
          priority?: string | null
          recipient?: string | null
          report_id?: string | null
          retry_count?: number | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          tenant_id: string
        }
        Update: {
          channel?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_content?: string | null
          priority?: string | null
          recipient?: string | null
          report_id?: string | null
          retry_count?: number | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "generated_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "notification_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_step: number | null
          id: string
          skipped: boolean | null
          started_at: string | null
          steps_completed: Json | null
          tenant_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          id?: string
          skipped?: boolean | null
          started_at?: string | null
          steps_completed?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          id?: string
          skipped?: boolean | null
          started_at?: string | null
          steps_completed?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_progress_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "onboarding_progress_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      operational_calendar: {
        Row: {
          affected_agents: string[] | null
          created_at: string | null
          created_by: string | null
          end_date: string
          event_type: string
          id: string
          notes: string | null
          start_date: string
          tenant_id: string
          title: string
        }
        Insert: {
          affected_agents?: string[] | null
          created_at?: string | null
          created_by?: string | null
          end_date: string
          event_type: string
          id?: string
          notes?: string | null
          start_date: string
          tenant_id: string
          title: string
        }
        Update: {
          affected_agents?: string[] | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string
          event_type?: string
          id?: string
          notes?: string | null
          start_date?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_calendar_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_calendar_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "operational_calendar_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      performance_metrics: {
        Row: {
          created_at: string
          duration_ms: number
          error_message: string | null
          function_name: string
          id: string
          metadata: Json | null
          operation_type: string
          status_code: number | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms: number
          error_message?: string | null
          function_name: string
          id?: string
          metadata?: Json | null
          operation_type: string
          status_code?: number | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          function_name?: string
          id?: string
          metadata?: Json | null
          operation_type?: string
          status_code?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "performance_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      playbook_actions: {
        Row: {
          action_payload: Json
          action_type: string
          created_at: string | null
          description: string | null
          id: string
          label: string
          order_index: number
          playbook_id: string | null
          risk_level: string | null
        }
        Insert: {
          action_payload?: Json
          action_type: string
          created_at?: string | null
          description?: string | null
          id?: string
          label: string
          order_index: number
          playbook_id?: string | null
          risk_level?: string | null
        }
        Update: {
          action_payload?: Json
          action_type?: string
          created_at?: string | null
          description?: string | null
          id?: string
          label?: string
          order_index?: number
          playbook_id?: string | null
          risk_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playbook_actions_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_executions: {
        Row: {
          actions_snapshot: Json | null
          actions_taken: Json | null
          agent_id: string | null
          auto_executed: boolean | null
          completed_at: string | null
          dry_run: boolean | null
          evidence_ids: string[] | null
          executed_by: string | null
          id: string
          ignore_reason: string | null
          notes: string | null
          playbook_id: string | null
          playbook_snapshot: Json | null
          risk_score: number | null
          started_at: string | null
          status: string | null
          tenant_id: string
          trigger_context: Json | null
          trigger_event_id: string | null
          trigger_source: string | null
          triggered_at: string | null
          triggered_by: string | null
        }
        Insert: {
          actions_snapshot?: Json | null
          actions_taken?: Json | null
          agent_id?: string | null
          auto_executed?: boolean | null
          completed_at?: string | null
          dry_run?: boolean | null
          evidence_ids?: string[] | null
          executed_by?: string | null
          id?: string
          ignore_reason?: string | null
          notes?: string | null
          playbook_id?: string | null
          playbook_snapshot?: Json | null
          risk_score?: number | null
          started_at?: string | null
          status?: string | null
          tenant_id: string
          trigger_context?: Json | null
          trigger_event_id?: string | null
          trigger_source?: string | null
          triggered_at?: string | null
          triggered_by?: string | null
        }
        Update: {
          actions_snapshot?: Json | null
          actions_taken?: Json | null
          agent_id?: string | null
          auto_executed?: boolean | null
          completed_at?: string | null
          dry_run?: boolean | null
          evidence_ids?: string[] | null
          executed_by?: string | null
          id?: string
          ignore_reason?: string | null
          notes?: string | null
          playbook_id?: string | null
          playbook_snapshot?: Json | null
          risk_score?: number | null
          started_at?: string | null
          status?: string | null
          tenant_id?: string
          trigger_context?: Json | null
          trigger_event_id?: string | null
          trigger_source?: string | null
          triggered_at?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playbook_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "playbook_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "playbook_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "playbook_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_executions_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "playbook_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      playbooks: {
        Row: {
          cooldown_minutes: number | null
          created_at: string | null
          description: string | null
          execution_mode: string | null
          id: string
          is_enabled: boolean | null
          is_system: boolean | null
          name: string
          require_approval: boolean | null
          severity: string
          tenant_id: string | null
          trigger_conditions: Json
          trigger_type: string
          updated_at: string | null
          version: number
        }
        Insert: {
          cooldown_minutes?: number | null
          created_at?: string | null
          description?: string | null
          execution_mode?: string | null
          id?: string
          is_enabled?: boolean | null
          is_system?: boolean | null
          name: string
          require_approval?: boolean | null
          severity?: string
          tenant_id?: string | null
          trigger_conditions?: Json
          trigger_type: string
          updated_at?: string | null
          version?: number
        }
        Update: {
          cooldown_minutes?: number | null
          created_at?: string | null
          description?: string | null
          execution_mode?: string | null
          id?: string
          is_enabled?: boolean | null
          is_system?: boolean | null
          name?: string
          require_approval?: boolean | null
          severity?: string
          tenant_id?: string | null
          trigger_conditions?: Json
          trigger_type?: string
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "playbooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "playbooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      poe_chain_breaks: {
        Row: {
          agent_id: string
          break_type: string
          context: Json | null
          created_at: string
          detected_at: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          tenant_id: string
        }
        Insert: {
          agent_id: string
          break_type: string
          context?: Json | null
          created_at?: string
          detected_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id: string
        }
        Update: {
          agent_id?: string
          break_type?: string
          context?: Json | null
          created_at?: string
          detected_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poe_chain_breaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poe_chain_breaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poe_chain_breaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poe_chain_breaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poe_chain_breaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "poe_chain_breaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "poe_chain_breaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poe_chain_breaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "poe_chain_breaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poe_chain_breaks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poe_chain_breaks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "poe_chain_breaks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      policy_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          created_at: string | null
          id: string
          policy_id: string | null
          target_id: string
          target_type: string
          tenant_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          policy_id?: string | null
          target_id: string
          target_type: string
          tenant_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          policy_id?: string | null
          target_id?: string
          target_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_assignments_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "security_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_enforcement_logs: {
        Row: {
          action_taken: string
          agent_id: string | null
          blocked: boolean | null
          created_at: string | null
          details: Json | null
          id: string
          policy_id: string | null
          rule_id: string | null
          rule_type: string
          target: string
          tenant_id: string
        }
        Insert: {
          action_taken: string
          agent_id?: string | null
          blocked?: boolean | null
          created_at?: string | null
          details?: Json | null
          id?: string
          policy_id?: string | null
          rule_id?: string | null
          rule_type: string
          target: string
          tenant_id: string
        }
        Update: {
          action_taken?: string
          agent_id?: string | null
          blocked?: boolean | null
          created_at?: string | null
          details?: Json | null
          id?: string
          policy_id?: string | null
          rule_id?: string | null
          rule_type?: string
          target?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_enforcement_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "security_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "security_policy_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      policy_rules: {
        Row: {
          action: Json
          condition: Json
          enabled: boolean
          id: string
          policy_id: string
          priority: number
          rule_type: string
        }
        Insert: {
          action: Json
          condition: Json
          enabled?: boolean
          id?: string
          policy_id: string
          priority?: number
          rule_type: string
        }
        Update: {
          action?: Json
          condition?: Json
          enabled?: boolean
          id?: string
          policy_id?: string
          priority?: number
          rule_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_rules_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "security_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quarantined_files: {
        Row: {
          agent_name: string
          created_at: string
          file_hash: string
          file_path: string
          id: string
          quarantine_reason: string
          quarantined_at: string
          restored_at: string | null
          restored_by: string | null
          status: string
          tenant_id: string
          virus_scan_id: string | null
        }
        Insert: {
          agent_name: string
          created_at?: string
          file_hash: string
          file_path: string
          id?: string
          quarantine_reason: string
          quarantined_at?: string
          restored_at?: string | null
          restored_by?: string | null
          status?: string
          tenant_id: string
          virus_scan_id?: string | null
        }
        Update: {
          agent_name?: string
          created_at?: string
          file_hash?: string
          file_path?: string
          id?: string
          quarantine_reason?: string
          quarantined_at?: string
          restored_at?: string | null
          restored_by?: string | null
          status?: string
          tenant_id?: string
          virus_scan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quarantined_files_virus_scan_id_fkey"
            columns: ["virus_scan_id"]
            isOneToOne: false
            referencedRelation: "virus_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          blocked_until: string | null
          endpoint: string
          id: string
          identifier: string
          last_request_at: string
          request_count: number
          window_start: string
        }
        Insert: {
          blocked_until?: string | null
          endpoint: string
          id?: string
          identifier: string
          last_request_at?: string
          request_count?: number
          window_start?: string
        }
        Update: {
          blocked_until?: string | null
          endpoint?: string
          id?: string
          identifier?: string
          last_request_at?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      red_team_assessments: {
        Row: {
          ai_model: string | null
          ai_prompt_hash: string | null
          ai_response_raw: Json | null
          attack_vectors: Json
          created_at: string
          executive_threat_summary: string | null
          id: string
          metrics_snapshot: Json | null
          recommended_hardening: Json | null
          red_score: number
          residual_risks: Json
          tenant_id: string
          threat_compliance_alignment: number | null
          threat_cross_tenant_isolation: number | null
          threat_evidence_proof: number | null
          threat_governance: number | null
          threat_human_oversight: number | null
          threat_level: string
          threat_market_trust: number | null
          threat_operational_resilience: number | null
          threat_system_identity: number | null
          threat_transparency_explainability: number | null
          worst_case_scenario: string | null
        }
        Insert: {
          ai_model?: string | null
          ai_prompt_hash?: string | null
          ai_response_raw?: Json | null
          attack_vectors?: Json
          created_at?: string
          executive_threat_summary?: string | null
          id?: string
          metrics_snapshot?: Json | null
          recommended_hardening?: Json | null
          red_score: number
          residual_risks?: Json
          tenant_id: string
          threat_compliance_alignment?: number | null
          threat_cross_tenant_isolation?: number | null
          threat_evidence_proof?: number | null
          threat_governance?: number | null
          threat_human_oversight?: number | null
          threat_level: string
          threat_market_trust?: number | null
          threat_operational_resilience?: number | null
          threat_system_identity?: number | null
          threat_transparency_explainability?: number | null
          worst_case_scenario?: string | null
        }
        Update: {
          ai_model?: string | null
          ai_prompt_hash?: string | null
          ai_response_raw?: Json | null
          attack_vectors?: Json
          created_at?: string
          executive_threat_summary?: string | null
          id?: string
          metrics_snapshot?: Json | null
          recommended_hardening?: Json | null
          red_score?: number
          residual_risks?: Json
          tenant_id?: string
          threat_compliance_alignment?: number | null
          threat_cross_tenant_isolation?: number | null
          threat_evidence_proof?: number | null
          threat_governance?: number | null
          threat_human_oversight?: number | null
          threat_level?: string
          threat_market_trust?: number | null
          threat_operational_resilience?: number | null
          threat_system_identity?: number | null
          threat_transparency_explainability?: number | null
          worst_case_scenario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "red_team_assessments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "red_team_assessments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "red_team_assessments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      report_executions: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          file_path: string | null
          file_size_bytes: number | null
          id: string
          metadata: Json | null
          recipients: Json | null
          report_type: string
          scheduled_report_id: string | null
          started_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          metadata?: Json | null
          recipients?: Json | null
          report_type: string
          scheduled_report_id?: string | null
          started_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          metadata?: Json | null
          recipients?: Json | null
          report_type?: string
          scheduled_report_id?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_executions_scheduled_report_id_fkey"
            columns: ["scheduled_report_id"]
            isOneToOne: false
            referencedRelation: "scheduled_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "report_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      reports: {
        Row: {
          agent_name: string
          created_at: string
          file_data: string
          file_path: string
          id: string
          kind: string
          tenant_id: string
        }
        Insert: {
          agent_name: string
          created_at?: string
          file_data: string
          file_path: string
          id?: string
          kind: string
          tenant_id: string
        }
        Update: {
          agent_name?: string
          created_at?: string
          file_data?: string
          file_path?: string
          id?: string
          kind?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_reports_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reports_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_reports_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      risk_decision_log: {
        Row: {
          agent_id: string | null
          context: Json | null
          created_at: string
          decision: string
          decision_reason: string | null
          dry_run: boolean | null
          event_type: string
          id: string
          playbook_execution_id: string | null
          playbook_id: string | null
          playbook_name: string | null
          risk_score: number
          tenant_id: string
          threshold: number
        }
        Insert: {
          agent_id?: string | null
          context?: Json | null
          created_at?: string
          decision: string
          decision_reason?: string | null
          dry_run?: boolean | null
          event_type: string
          id?: string
          playbook_execution_id?: string | null
          playbook_id?: string | null
          playbook_name?: string | null
          risk_score: number
          tenant_id: string
          threshold: number
        }
        Update: {
          agent_id?: string | null
          context?: Json | null
          created_at?: string
          decision?: string
          decision_reason?: string | null
          dry_run?: boolean | null
          event_type?: string
          id?: string
          playbook_execution_id?: string | null
          playbook_id?: string | null
          playbook_name?: string | null
          risk_score?: number
          tenant_id?: string
          threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "risk_decision_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_decision_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_decision_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_decision_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_decision_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "risk_decision_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "risk_decision_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_decision_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "risk_decision_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_decision_log_playbook_execution_id_fkey"
            columns: ["playbook_execution_id"]
            isOneToOne: false
            referencedRelation: "playbook_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_decision_log_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_decision_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_decision_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "risk_decision_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      risk_delta_snapshots: {
        Row: {
          actions_executed: number
          actions_pending_approval: number
          created_at: string
          delta: number | null
          estimated_cost_avoided: number | null
          executive_summary: string | null
          id: string
          incidents_prevented: number
          key_events: Json
          risk_score_end: number | null
          risk_score_start: number | null
          snapshot_date: string
          tenant_id: string
          threats_blocked: number
        }
        Insert: {
          actions_executed?: number
          actions_pending_approval?: number
          created_at?: string
          delta?: number | null
          estimated_cost_avoided?: number | null
          executive_summary?: string | null
          id?: string
          incidents_prevented?: number
          key_events?: Json
          risk_score_end?: number | null
          risk_score_start?: number | null
          snapshot_date: string
          tenant_id: string
          threats_blocked?: number
        }
        Update: {
          actions_executed?: number
          actions_pending_approval?: number
          created_at?: string
          delta?: number | null
          estimated_cost_avoided?: number | null
          executive_summary?: string | null
          id?: string
          incidents_prevented?: number
          key_events?: Json
          risk_score_end?: number | null
          risk_score_start?: number | null
          snapshot_date?: string
          tenant_id?: string
          threats_blocked?: number
        }
        Relationships: [
          {
            foreignKeyName: "risk_delta_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_delta_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "risk_delta_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      rls_test_results: {
        Row: {
          details: Json | null
          failure_reason: string | null
          id: string
          passed: boolean
          table_name: string | null
          test_name: string
          test_run_id: string
          tested_at: string | null
        }
        Insert: {
          details?: Json | null
          failure_reason?: string | null
          id?: string
          passed: boolean
          table_name?: string | null
          test_name: string
          test_run_id: string
          tested_at?: string | null
        }
        Update: {
          details?: Json | null
          failure_reason?: string | null
          id?: string
          passed?: boolean
          table_name?: string | null
          test_name?: string
          test_run_id?: string
          tested_at?: string | null
        }
        Relationships: []
      }
      sales_contacts: {
        Row: {
          client_ip: string | null
          company: string | null
          created_at: string
          email: string
          endpoints: number | null
          id: string
          message: string | null
          name: string
          phone: string | null
          status: string | null
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          client_ip?: string | null
          company?: string | null
          created_at?: string
          email: string
          endpoints?: number | null
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          status?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          client_ip?: string | null
          company?: string | null
          created_at?: string
          email?: string
          endpoints?: number | null
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          status?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "sales_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      sales_pipeline: {
        Row: {
          assigned_to: string | null
          closed_at: string | null
          company_name: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          converted_tenant_id: string | null
          created_at: string
          expected_close_date: string | null
          expected_devices: number
          expected_value_cents: number
          id: string
          notes: string | null
          probability: number
          source: string | null
          stage: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          closed_at?: string | null
          company_name: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          converted_tenant_id?: string | null
          created_at?: string
          expected_close_date?: string | null
          expected_devices?: number
          expected_value_cents?: number
          id?: string
          notes?: string | null
          probability?: number
          source?: string | null
          stage?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          closed_at?: string | null
          company_name?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          converted_tenant_id?: string | null
          created_at?: string
          expected_close_date?: string | null
          expected_devices?: number
          expected_value_cents?: number
          id?: string
          notes?: string | null
          probability?: number
          source?: string | null
          stage?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_pipeline_converted_tenant_id_fkey"
            columns: ["converted_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_pipeline_converted_tenant_id_fkey"
            columns: ["converted_tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "sales_pipeline_converted_tenant_id_fkey"
            columns: ["converted_tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "sales_pipeline_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_pipeline_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "sales_pipeline_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      scheduled_job_runs: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          error: string | null
          id: string
          job_key: string
          job_source: string
          processed_count: number | null
          ran_at: string
          result: Json | null
          success: boolean
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          job_key: string
          job_source?: string
          processed_count?: number | null
          ran_at?: string
          result?: Json | null
          success?: boolean
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          job_key?: string
          job_source?: string
          processed_count?: number | null
          ran_at?: string
          result?: Json | null
          success?: boolean
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_job_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_job_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "scheduled_job_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      scheduled_jobs: {
        Row: {
          agent_group_id: string | null
          agent_id: string | null
          created_at: string
          cron_expr: string
          description: string | null
          enabled: boolean
          id: string
          job_type: string
          last_run_at: string | null
          name: string
          next_run_at: string | null
          payload: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agent_group_id?: string | null
          agent_id?: string | null
          created_at?: string
          cron_expr: string
          description?: string | null
          enabled?: boolean
          id?: string
          job_type: string
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          payload?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agent_group_id?: string | null
          agent_id?: string | null
          created_at?: string
          cron_expr?: string
          description?: string | null
          enabled?: boolean
          id?: string
          job_type?: string
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          payload?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "scheduled_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "scheduled_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "scheduled_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "scheduled_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      scheduled_reports: {
        Row: {
          created_at: string | null
          created_by: string | null
          day_of_week: number | null
          hour: number | null
          id: string
          include_agents_summary: boolean | null
          include_antivirus: boolean | null
          include_software_inventory: boolean | null
          include_vulnerabilities: boolean | null
          include_web_activity: boolean | null
          is_active: boolean | null
          last_sent_at: string | null
          name: string
          next_send_at: string | null
          recipients: string[]
          report_type: string
          schedule: string
          tenant_id: string
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          day_of_week?: number | null
          hour?: number | null
          id?: string
          include_agents_summary?: boolean | null
          include_antivirus?: boolean | null
          include_software_inventory?: boolean | null
          include_vulnerabilities?: boolean | null
          include_web_activity?: boolean | null
          is_active?: boolean | null
          last_sent_at?: string | null
          name?: string
          next_send_at?: string | null
          recipients?: string[]
          report_type?: string
          schedule?: string
          tenant_id: string
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          day_of_week?: number | null
          hour?: number | null
          id?: string
          include_agents_summary?: boolean | null
          include_antivirus?: boolean | null
          include_software_inventory?: boolean | null
          include_vulnerabilities?: boolean | null
          include_web_activity?: boolean | null
          is_active?: boolean | null
          last_sent_at?: string | null
          name?: string
          next_send_at?: string | null
          recipients?: string[]
          report_type?: string
          schedule?: string
          tenant_id?: string
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "scheduled_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      security_events: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          created_at: string
          data: Json | null
          description: string | null
          event_type: string | null
          id: string
          policy_id: string | null
          rule_id: string | null
          severity: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string
          data?: Json | null
          description?: string | null
          event_type?: string | null
          id?: string
          policy_id?: string | null
          rule_id?: string | null
          severity: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string
          data?: Json | null
          description?: string | null
          event_type?: string | null
          id?: string
          policy_id?: string | null
          rule_id?: string | null
          severity?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "security_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "security_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "security_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "security_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "policy_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "security_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      security_logs: {
        Row: {
          attack_type: string
          blocked: boolean
          created_at: string
          details: Json | null
          endpoint: string
          id: string
          ip_address: string
          request_id: string | null
          severity: string
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          attack_type: string
          blocked?: boolean
          created_at?: string
          details?: Json | null
          endpoint: string
          id?: string
          ip_address: string
          request_id?: string | null
          severity: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          attack_type?: string
          blocked?: boolean
          created_at?: string
          details?: Json | null
          endpoint?: string
          id?: string
          ip_address?: string
          request_id?: string | null
          severity?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "security_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      security_policies: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          is_active: boolean | null
          name: string
          priority: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          is_active?: boolean | null
          name: string
          priority?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          is_active?: boolean | null
          name?: string
          priority?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "security_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      security_policy_rules: {
        Row: {
          action: string
          conditions: Json | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          policy_id: string
          rule_type: string
          target: string
        }
        Insert: {
          action: string
          conditions?: Json | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          policy_id: string
          rule_type: string
          target: string
        }
        Update: {
          action?: string
          conditions?: Json | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          policy_id?: string
          rule_type?: string
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_policy_rules_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "security_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      security_reports: {
        Row: {
          agent_id: string | null
          content: Json | null
          created_at: string | null
          error_message: string | null
          expires_at: string | null
          generated_at: string | null
          id: string
          report_type: string
          status: string | null
          tenant_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          content?: Json | null
          created_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          report_type: string
          status?: string | null
          tenant_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          content?: Json | null
          created_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          report_type?: string
          status?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "security_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "security_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "security_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "security_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      signed_documents: {
        Row: {
          algorithm: string
          audit_level: string | null
          created_at: string
          curve: string
          document_hash: string
          document_name: string
          hash_algorithm: string
          id: string
          invariants_version: string | null
          metadata: Json | null
          signature_base64: string
          signed_at: string
          signed_by: string
        }
        Insert: {
          algorithm?: string
          audit_level?: string | null
          created_at?: string
          curve?: string
          document_hash: string
          document_name: string
          hash_algorithm?: string
          id?: string
          invariants_version?: string | null
          metadata?: Json | null
          signature_base64: string
          signed_at?: string
          signed_by: string
        }
        Update: {
          algorithm?: string
          audit_level?: string | null
          created_at?: string
          curve?: string
          document_hash?: string
          document_name?: string
          hash_algorithm?: string
          id?: string
          invariants_version?: string | null
          metadata?: Json | null
          signature_base64?: string
          signed_at?: string
          signed_by?: string
        }
        Relationships: []
      }
      slo_alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string | null
          id: string
          measurement_id: string | null
          message: string | null
          severity: string | null
          slo_id: string | null
          tenant_id: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string | null
          id?: string
          measurement_id?: string | null
          message?: string | null
          severity?: string | null
          slo_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string | null
          id?: string
          measurement_id?: string | null
          message?: string | null
          severity?: string | null
          slo_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slo_alerts_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "slo_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slo_alerts_slo_id_fkey"
            columns: ["slo_id"]
            isOneToOne: false
            referencedRelation: "slo_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slo_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slo_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "slo_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      slo_definitions: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean | null
          measurement_window: string | null
          name: string
          target_percent: number
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          measurement_window?: string | null
          name: string
          target_percent: number
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          measurement_window?: string | null
          name?: string
          target_percent?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      slo_measurements: {
        Row: {
          created_at: string | null
          current_value: number | null
          error_budget_used: number | null
          id: string
          is_breached: boolean | null
          measured_at: string | null
          sample_size: number | null
          slo_id: string | null
          target_value: number | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          current_value?: number | null
          error_budget_used?: number | null
          id?: string
          is_breached?: boolean | null
          measured_at?: string | null
          sample_size?: number | null
          slo_id?: string | null
          target_value?: number | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          current_value?: number | null
          error_budget_used?: number | null
          id?: string
          is_breached?: boolean | null
          measured_at?: string | null
          sample_size?: number | null
          slo_id?: string | null
          target_value?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slo_measurements_slo_id_fkey"
            columns: ["slo_id"]
            isOneToOne: false
            referencedRelation: "slo_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slo_measurements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slo_measurements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "slo_measurements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      soc2_controls: {
        Row: {
          control_code: string
          control_name: string
          created_at: string
          criteria_id: string
          description: string | null
          due_date: string | null
          evidence_ref: string | null
          evidence_type: string | null
          gap_notes: string | null
          id: string
          owner: string | null
          remediation_plan: string | null
          status: string
          tenant_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          control_code: string
          control_name: string
          created_at?: string
          criteria_id: string
          description?: string | null
          due_date?: string | null
          evidence_ref?: string | null
          evidence_type?: string | null
          gap_notes?: string | null
          id?: string
          owner?: string | null
          remediation_plan?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          control_code?: string
          control_name?: string
          created_at?: string
          criteria_id?: string
          description?: string | null
          due_date?: string | null
          evidence_ref?: string | null
          evidence_type?: string | null
          gap_notes?: string | null
          id?: string
          owner?: string | null
          remediation_plan?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "soc2_controls_criteria_id_fkey"
            columns: ["criteria_id"]
            isOneToOne: false
            referencedRelation: "soc2_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soc2_controls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soc2_controls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "soc2_controls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      soc2_criteria: {
        Row: {
          created_at: string
          criteria_code: string
          criteria_name: string
          description: string | null
          id: string
          implementation_notes: string | null
          status: string
          tenant_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          criteria_code: string
          criteria_name: string
          description?: string | null
          id?: string
          implementation_notes?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          criteria_code?: string
          criteria_name?: string
          description?: string | null
          id?: string
          implementation_notes?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "soc2_criteria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soc2_criteria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "soc2_criteria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      software_inventory: {
        Row: {
          agent_id: string
          first_seen_at: string
          id: string
          install_location: string | null
          last_seen_at: string
          name: string
          risk_level: string | null
          tenant_id: string
          vendor: string | null
          version: string | null
        }
        Insert: {
          agent_id: string
          first_seen_at?: string
          id?: string
          install_location?: string | null
          last_seen_at?: string
          name: string
          risk_level?: string | null
          tenant_id: string
          vendor?: string | null
          version?: string | null
        }
        Update: {
          agent_id?: string
          first_seen_at?: string
          id?: string
          install_location?: string | null
          last_seen_at?: string
          name?: string
          risk_level?: string | null
          tenant_id?: string
          vendor?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "software_inventory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "software_inventory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "software_inventory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "software_inventory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "software_inventory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "software_inventory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "software_inventory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "software_inventory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "software_inventory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "software_inventory_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "software_inventory_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "software_inventory_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      software_knowledge_base: {
        Row: {
          category: string
          created_at: string | null
          default_risk_level: string
          description: string | null
          id: string
          is_active: boolean | null
          match_type: string
          software_pattern: string
          updated_at: string | null
          vendor_patterns: string[] | null
        }
        Insert: {
          category: string
          created_at?: string | null
          default_risk_level: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          match_type: string
          software_pattern: string
          updated_at?: string | null
          vendor_patterns?: string[] | null
        }
        Update: {
          category?: string
          created_at?: string | null
          default_risk_level?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          match_type?: string
          software_pattern?: string
          updated_at?: string | null
          vendor_patterns?: string[] | null
        }
        Relationships: []
      }
      software_vulnerability_baseline: {
        Row: {
          action: string
          created_at: string | null
          cve_refs: string[] | null
          id: string
          impact: string
          is_active: boolean | null
          min_safe_version: string
          remediation: string
          severity: string
          software_name: string
          software_name_patterns: string[] | null
          updated_at: string | null
          vendor: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          cve_refs?: string[] | null
          id?: string
          impact: string
          is_active?: boolean | null
          min_safe_version: string
          remediation: string
          severity: string
          software_name: string
          software_name_patterns?: string[] | null
          updated_at?: string | null
          vendor?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          cve_refs?: string[] | null
          id?: string
          impact?: string
          is_active?: boolean | null
          min_safe_version?: string
          remediation?: string
          severity?: string
          software_name?: string
          software_name_patterns?: string[] | null
          updated_at?: string | null
          vendor?: string | null
        }
        Relationships: []
      }
      stripe_plan_mapping: {
        Row: {
          base_devices: number | null
          billing_interval: string | null
          created_at: string | null
          currency: string | null
          id: string
          logical_plan: string
          plan_type: string
          price_cents: number
          stripe_price_id: string
          stripe_product_id: string
          updated_at: string | null
        }
        Insert: {
          base_devices?: number | null
          billing_interval?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          logical_plan: string
          plan_type: string
          price_cents: number
          stripe_price_id: string
          stripe_product_id: string
          updated_at?: string | null
        }
        Update: {
          base_devices?: number | null
          billing_interval?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          logical_plan?: string
          plan_type?: string
          price_cents?: number
          stripe_price_id?: string
          stripe_product_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          addon_quantity: number | null
          created_at: string | null
          created_by: string | null
          effective_at: string | null
          event_type: string
          id: string
          metadata: Json | null
          new_devices: number | null
          new_plan: string | null
          old_devices: number | null
          old_plan: string | null
          stripe_event_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
        }
        Insert: {
          addon_quantity?: number | null
          created_at?: string | null
          created_by?: string | null
          effective_at?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          new_devices?: number | null
          new_plan?: string | null
          old_devices?: number | null
          old_plan?: string | null
          stripe_event_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
        }
        Update: {
          addon_quantity?: number | null
          created_at?: string | null
          created_by?: string | null
          effective_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          new_devices?: number | null
          new_plan?: string | null
          old_devices?: number | null
          old_plan?: string | null
          stripe_event_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "subscription_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          billing_period: string | null
          created_at: string
          discount_pct: number | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          is_sales_only: boolean | null
          max_agents: number | null
          max_devices: number | null
          max_scans_per_month: number | null
          max_users: number
          name: string
          price_per_device: number | null
          stripe_price_id: string | null
          trial_days: number | null
          updated_at: string
        }
        Insert: {
          billing_period?: string | null
          created_at?: string
          discount_pct?: number | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          is_sales_only?: boolean | null
          max_agents?: number | null
          max_devices?: number | null
          max_scans_per_month?: number | null
          max_users: number
          name: string
          price_per_device?: number | null
          stripe_price_id?: string | null
          trial_days?: number | null
          updated_at?: string
        }
        Update: {
          billing_period?: string | null
          created_at?: string
          discount_pct?: number | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          is_sales_only?: boolean | null
          max_agents?: number | null
          max_devices?: number | null
          max_scans_per_month?: number | null
          max_users?: number
          name?: string
          price_per_device?: number | null
          stripe_price_id?: string | null
          trial_days?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          agent_id: string | null
          alert_type: string
          created_at: string
          details: Json | null
          email_sent: boolean | null
          email_sent_at: string | null
          human_reviewed: boolean | null
          id: string
          message: string
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string
          tenant_id: string
          title: string
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          agent_id?: string | null
          alert_type: string
          created_at?: string
          details?: Json | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          human_reviewed?: boolean | null
          id?: string
          message: string
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity: string
          tenant_id: string
          title: string
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          agent_id?: string | null
          alert_type?: string
          created_at?: string
          details?: Json | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          human_reviewed?: boolean | null
          id?: string
          message?: string
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "system_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "system_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "system_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "system_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      system_audits: {
        Row: {
          ai_model: string | null
          analysis_control_vs_monitor: string | null
          analysis_evidence_proof: string | null
          analysis_failure_handling: string | null
          analysis_limitations: string | null
          analysis_market_value: string | null
          analysis_maturity: string | null
          analysis_operational_trust: string | null
          analysis_simplicity: string | null
          analysis_system_identity: string | null
          created_at: string
          created_by: string | null
          evidence_basis: Json | null
          executive_summary: string | null
          falsification_criteria: Json | null
          final_sentence: string | null
          id: string
          metrics_snapshot: Json | null
          overall_score: number
          prompt_hash: string | null
          recommendation: string | null
          score_control_vs_monitor: number
          score_evidence_proof: number
          score_failure_handling: number
          score_limitations: number
          score_market_value: number
          score_maturity: number
          score_operational_trust: number
          score_simplicity: number
          score_system_identity: number
          tenant_id: string | null
          tokens_used: number | null
        }
        Insert: {
          ai_model?: string | null
          analysis_control_vs_monitor?: string | null
          analysis_evidence_proof?: string | null
          analysis_failure_handling?: string | null
          analysis_limitations?: string | null
          analysis_market_value?: string | null
          analysis_maturity?: string | null
          analysis_operational_trust?: string | null
          analysis_simplicity?: string | null
          analysis_system_identity?: string | null
          created_at?: string
          created_by?: string | null
          evidence_basis?: Json | null
          executive_summary?: string | null
          falsification_criteria?: Json | null
          final_sentence?: string | null
          id?: string
          metrics_snapshot?: Json | null
          overall_score: number
          prompt_hash?: string | null
          recommendation?: string | null
          score_control_vs_monitor: number
          score_evidence_proof: number
          score_failure_handling: number
          score_limitations: number
          score_market_value: number
          score_maturity: number
          score_operational_trust: number
          score_simplicity: number
          score_system_identity: number
          tenant_id?: string | null
          tokens_used?: number | null
        }
        Update: {
          ai_model?: string | null
          analysis_control_vs_monitor?: string | null
          analysis_evidence_proof?: string | null
          analysis_failure_handling?: string | null
          analysis_limitations?: string | null
          analysis_market_value?: string | null
          analysis_maturity?: string | null
          analysis_operational_trust?: string | null
          analysis_simplicity?: string | null
          analysis_system_identity?: string | null
          created_at?: string
          created_by?: string | null
          evidence_basis?: Json | null
          executive_summary?: string | null
          falsification_criteria?: Json | null
          final_sentence?: string | null
          id?: string
          metrics_snapshot?: Json | null
          overall_score?: number
          prompt_hash?: string | null
          recommendation?: string | null
          score_control_vs_monitor?: number
          score_evidence_proof?: number
          score_failure_handling?: number
          score_limitations?: number
          score_market_value?: number
          score_maturity?: number
          score_operational_trust?: number
          score_simplicity?: number
          score_system_identity?: number
          tenant_id?: string | null
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "system_audits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_audits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "system_audits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      system_kill_switch: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          created_at: string | null
          enabled: boolean
          reason: string | null
          scope: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          created_at?: string | null
          enabled?: boolean
          reason?: string | null
          scope?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          created_at?: string | null
          enabled?: boolean
          reason?: string | null
          scope?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_kill_switch_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_kill_switch_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "system_kill_switch_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      system_liveness: {
        Row: {
          component_name: string
          created_at: string | null
          expected_interval_seconds: number
          id: string
          last_heartbeat: string | null
          metadata: Json | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          component_name: string
          created_at?: string | null
          expected_interval_seconds?: number
          id?: string
          last_heartbeat?: string | null
          metadata?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          component_name?: string
          created_at?: string | null
          expected_interval_seconds?: number
          id?: string
          last_heartbeat?: string | null
          metadata?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tenant_action_policies: {
        Row: {
          created_at: string | null
          created_by: string | null
          execution_mode: string
          id: string
          insight_type: string
          last_applied_at: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          execution_mode: string
          id?: string
          insight_type: string
          last_applied_at?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          execution_mode?: string
          id?: string
          insight_type?: string
          last_applied_at?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_action_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_action_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_action_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenant_features: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          metadata: Json | null
          quota_limit: number | null
          quota_used: number | null
          quota_warning_threshold: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          metadata?: Json | null
          quota_limit?: number | null
          quota_used?: number | null
          quota_warning_threshold?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          metadata?: Json | null
          quota_limit?: number | null
          quota_used?: number | null
          quota_warning_threshold?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_features_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_features_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_features_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenant_job_quotas: {
        Row: {
          created_at: string
          id: string
          max_delivered_jobs: number
          max_queued_jobs: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_delivered_jobs?: number
          max_queued_jobs?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_delivered_jobs?: number
          max_queued_jobs?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_job_quotas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_job_quotas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_job_quotas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenant_risk_scores: {
        Row: {
          agent_id: string | null
          breakdown: Json
          calculated_at: string
          calculation_version: string
          id: string
          previous_score: number | null
          scope: string
          score: number
          tenant_id: string
          trend: string | null
        }
        Insert: {
          agent_id?: string | null
          breakdown?: Json
          calculated_at?: string
          calculation_version?: string
          id?: string
          previous_score?: number | null
          scope: string
          score: number
          tenant_id: string
          trend?: string | null
        }
        Update: {
          agent_id?: string | null
          breakdown?: Json
          calculated_at?: string
          calculation_version?: string
          id?: string
          previous_score?: number | null
          scope?: string
          score?: number
          tenant_id?: string
          trend?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_risk_scores_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_risk_scores_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_risk_scores_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_risk_scores_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_risk_scores_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "tenant_risk_scores_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "tenant_risk_scores_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_risk_scores_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "tenant_risk_scores_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_risk_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_risk_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_risk_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          alert_email: string | null
          alert_threshold_failed_jobs: number | null
          alert_threshold_offline_agents: number | null
          alert_threshold_virus_positive: number | null
          alert_webhook_url: string | null
          business_hours: Json | null
          created_at: string
          dns_local_filter_enabled: boolean | null
          enable_auto_quarantine: boolean | null
          enable_dry_run_mode: boolean | null
          enable_email_alerts: boolean | null
          enable_webhook_alerts: boolean | null
          id: string
          stripe_enabled: boolean | null
          tenant_id: string
          updated_at: string
          virustotal_enabled: boolean | null
        }
        Insert: {
          alert_email?: string | null
          alert_threshold_failed_jobs?: number | null
          alert_threshold_offline_agents?: number | null
          alert_threshold_virus_positive?: number | null
          alert_webhook_url?: string | null
          business_hours?: Json | null
          created_at?: string
          dns_local_filter_enabled?: boolean | null
          enable_auto_quarantine?: boolean | null
          enable_dry_run_mode?: boolean | null
          enable_email_alerts?: boolean | null
          enable_webhook_alerts?: boolean | null
          id?: string
          stripe_enabled?: boolean | null
          tenant_id: string
          updated_at?: string
          virustotal_enabled?: boolean | null
        }
        Update: {
          alert_email?: string | null
          alert_threshold_failed_jobs?: number | null
          alert_threshold_offline_agents?: number | null
          alert_threshold_virus_positive?: number | null
          alert_webhook_url?: string | null
          business_hours?: Json | null
          created_at?: string
          dns_local_filter_enabled?: boolean | null
          enable_auto_quarantine?: boolean | null
          enable_dry_run_mode?: boolean | null
          enable_email_alerts?: boolean | null
          enable_webhook_alerts?: boolean | null
          id?: string
          stripe_enabled?: boolean | null
          tenant_id?: string
          updated_at?: string
          virustotal_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_tenant_settings_tenant"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tenant_settings_tenant"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_tenant_settings_tenant"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          addon_devices: number | null
          created_at: string
          current_period_end: string | null
          device_quantity: number | null
          id: string
          is_legacy: boolean | null
          pending_downgrade_at: string | null
          pending_downgrade_to: string | null
          plan_id: string
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          addon_devices?: number | null
          created_at?: string
          current_period_end?: string | null
          device_quantity?: number | null
          id?: string
          is_legacy?: boolean | null
          pending_downgrade_at?: string | null
          pending_downgrade_to?: string | null
          plan_id: string
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          addon_devices?: number | null
          created_at?: string
          current_period_end?: string | null
          device_quantity?: number | null
          id?: string
          is_legacy?: boolean | null
          pending_downgrade_at?: string | null
          pending_downgrade_to?: string | null
          plan_id?: string
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          auto_action_mode: string | null
          city: string | null
          cnpj: string | null
          company_name: string | null
          contact_email: string | null
          created_at: string
          id: string
          name: string
          owner_user_id: string
          phone: string | null
          setup_completed: boolean | null
          slug: string
          state: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          auto_action_mode?: string | null
          city?: string | null
          cnpj?: string | null
          company_name?: string | null
          contact_email?: string | null
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          phone?: string | null
          setup_completed?: boolean | null
          slug: string
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          auto_action_mode?: string | null
          city?: string | null
          cnpj?: string | null
          company_name?: string | null
          contact_email?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          phone?: string | null
          setup_completed?: boolean | null
          slug?: string
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      threat_intelligence_cache: {
        Row: {
          cached_at: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          raw_responses: Json | null
          reputation: string
          risk_score: number | null
          sources: Json | null
          ssl_data: Json | null
          target: string
          target_type: string
          tenant_id: string | null
          whois_data: Json | null
        }
        Insert: {
          cached_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          raw_responses?: Json | null
          reputation: string
          risk_score?: number | null
          sources?: Json | null
          ssl_data?: Json | null
          target: string
          target_type: string
          tenant_id?: string | null
          whois_data?: Json | null
        }
        Update: {
          cached_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          raw_responses?: Json | null
          reputation?: string
          risk_score?: number | null
          sources?: Json | null
          ssl_data?: Json | null
          target?: string
          target_type?: string
          tenant_id?: string | null
          whois_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "threat_intelligence_cache_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threat_intelligence_cache_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "threat_intelligence_cache_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      url_reputation: {
        Row: {
          category: string | null
          details: Json | null
          domain: string | null
          id: string
          last_checked_at: string
          reputation: string | null
          score: number | null
          tenant_id: string
          url: string
        }
        Insert: {
          category?: string | null
          details?: Json | null
          domain?: string | null
          id?: string
          last_checked_at?: string
          reputation?: string | null
          score?: number | null
          tenant_id: string
          url: string
        }
        Update: {
          category?: string | null
          details?: Json | null
          domain?: string | null
          id?: string
          last_checked_at?: string
          reputation?: string | null
          score?: number | null
          tenant_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "url_reputation_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "url_reputation_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "url_reputation_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_roles_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_roles_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_user_roles_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      vendor_risk_registry: {
        Row: {
          compliance_certifications: string[] | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string
          criticality: string
          data_shared: string[] | null
          id: string
          last_review_date: string | null
          next_review_date: string | null
          risk_notes: string | null
          risk_score: number | null
          services_provided: string[] | null
          status: string
          tenant_id: string
          updated_at: string
          vendor_name: string
          vendor_type: string
        }
        Insert: {
          compliance_certifications?: string[] | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          criticality?: string
          data_shared?: string[] | null
          id?: string
          last_review_date?: string | null
          next_review_date?: string | null
          risk_notes?: string | null
          risk_score?: number | null
          services_provided?: string[] | null
          status?: string
          tenant_id: string
          updated_at?: string
          vendor_name: string
          vendor_type: string
        }
        Update: {
          compliance_certifications?: string[] | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          criticality?: string
          data_shared?: string[] | null
          id?: string
          last_review_date?: string | null
          next_review_date?: string | null
          risk_notes?: string | null
          risk_score?: number | null
          services_provided?: string[] | null
          status?: string
          tenant_id?: string
          updated_at?: string
          vendor_name?: string
          vendor_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_risk_registry_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_risk_registry_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "vendor_risk_registry_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      virus_scans: {
        Row: {
          agent_name: string
          file_hash: string
          file_path: string
          id: string
          is_malicious: boolean | null
          positives: number | null
          scan_result: Json | null
          scanned_at: string
          tenant_id: string
          total_scans: number | null
          virustotal_permalink: string | null
        }
        Insert: {
          agent_name: string
          file_hash: string
          file_path: string
          id?: string
          is_malicious?: boolean | null
          positives?: number | null
          scan_result?: Json | null
          scanned_at?: string
          tenant_id: string
          total_scans?: number | null
          virustotal_permalink?: string | null
        }
        Update: {
          agent_name?: string
          file_hash?: string
          file_path?: string
          id?: string
          is_malicious?: boolean | null
          positives?: number | null
          scan_result?: Json | null
          scanned_at?: string
          tenant_id?: string
          total_scans?: number | null
          virustotal_permalink?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_virus_scans_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_virus_scans_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_virus_scans_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "virus_scans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virus_scans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "virus_scans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      vuln_findings: {
        Row: {
          acknowledged_at: string | null
          agent_id: string
          check_key: string
          description: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          remediation: string | null
          severity: string
          tenant_id: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          agent_id: string
          check_key: string
          description?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          remediation?: string | null
          severity: string
          tenant_id: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          agent_id?: string
          check_key?: string
          description?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          remediation?: string | null
          severity?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "vuln_findings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vuln_findings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vuln_findings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vuln_findings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vuln_findings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "vuln_findings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "vuln_findings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vuln_findings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "vuln_findings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vuln_findings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vuln_findings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "vuln_findings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      web_access_policies: {
        Row: {
          action: string
          applied_at: string | null
          created_at: string | null
          created_by: string | null
          domain: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          reason: string | null
          source: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          action: string
          applied_at?: string | null
          created_at?: string | null
          created_by?: string | null
          domain: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          reason?: string | null
          source?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          action?: string
          applied_at?: string | null
          created_at?: string | null
          created_by?: string | null
          domain?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          reason?: string | null
          source?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "web_access_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_access_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "web_access_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      weekly_security_reports: {
        Row: {
          created_at: string | null
          executive_summary: string | null
          generated_at: string | null
          id: string
          metrics: Json
          sent_at: string | null
          tenant_id: string
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string | null
          executive_summary?: string | null
          generated_at?: string | null
          id?: string
          metrics: Json
          sent_at?: string | null
          tenant_id: string
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string | null
          executive_summary?: string | null
          generated_at?: string | null
          id?: string
          metrics?: Json
          sent_at?: string | null
          tenant_id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_security_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_security_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "weekly_security_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
    }
    Views: {
      active_agents: {
        Row: {
          agent_mode: string | null
          agent_name: string | null
          agent_state: string | null
          agent_state_changed_at: string | null
          agent_state_reason: string | null
          agent_version: string | null
          agent_version_code: number | null
          archived_at: string | null
          archived_reason: string | null
          display_name: string | null
          ed25519_supported: boolean | null
          enrolled_at: string | null
          force_update_at: string | null
          force_update_override_safe_mode: boolean | null
          force_update_override_safe_mode_expires_at: string | null
          force_update_reason: string | null
          force_update_version: string | null
          hmac_secret: string | null
          hostname: string | null
          id: string | null
          is_isolated: boolean | null
          is_throttled: boolean | null
          isolated_at: string | null
          isolation_reason: string | null
          last_block_sync_at: string | null
          last_forced_update_applied: string | null
          last_heartbeat: string | null
          offline_detected_at: string | null
          offline_reason: string | null
          os_type: string | null
          os_version: string | null
          payload_hash: string | null
          poll_interval_seconds: number | null
          result_key_fingerprint: string | null
          result_key_registered_at: string | null
          result_public_key: string | null
          safe_mode_entered_at: string | null
          safe_mode_reason: string | null
          signature_mode: string | null
          status: string | null
          tenant_id: string | null
          throttle_reason: string | null
          throttled_at: string | null
        }
        Insert: {
          agent_mode?: string | null
          agent_name?: string | null
          agent_state?: string | null
          agent_state_changed_at?: string | null
          agent_state_reason?: string | null
          agent_version?: string | null
          agent_version_code?: number | null
          archived_at?: string | null
          archived_reason?: string | null
          display_name?: string | null
          ed25519_supported?: boolean | null
          enrolled_at?: string | null
          force_update_at?: string | null
          force_update_override_safe_mode?: boolean | null
          force_update_override_safe_mode_expires_at?: string | null
          force_update_reason?: string | null
          force_update_version?: string | null
          hmac_secret?: string | null
          hostname?: string | null
          id?: string | null
          is_isolated?: boolean | null
          is_throttled?: boolean | null
          isolated_at?: string | null
          isolation_reason?: string | null
          last_block_sync_at?: string | null
          last_forced_update_applied?: string | null
          last_heartbeat?: string | null
          offline_detected_at?: string | null
          offline_reason?: string | null
          os_type?: string | null
          os_version?: string | null
          payload_hash?: string | null
          poll_interval_seconds?: number | null
          result_key_fingerprint?: string | null
          result_key_registered_at?: string | null
          result_public_key?: string | null
          safe_mode_entered_at?: string | null
          safe_mode_reason?: string | null
          signature_mode?: string | null
          status?: string | null
          tenant_id?: string | null
          throttle_reason?: string | null
          throttled_at?: string | null
        }
        Update: {
          agent_mode?: string | null
          agent_name?: string | null
          agent_state?: string | null
          agent_state_changed_at?: string | null
          agent_state_reason?: string | null
          agent_version?: string | null
          agent_version_code?: number | null
          archived_at?: string | null
          archived_reason?: string | null
          display_name?: string | null
          ed25519_supported?: boolean | null
          enrolled_at?: string | null
          force_update_at?: string | null
          force_update_override_safe_mode?: boolean | null
          force_update_override_safe_mode_expires_at?: string | null
          force_update_reason?: string | null
          force_update_version?: string | null
          hmac_secret?: string | null
          hostname?: string | null
          id?: string | null
          is_isolated?: boolean | null
          is_throttled?: boolean | null
          isolated_at?: string | null
          isolation_reason?: string | null
          last_block_sync_at?: string | null
          last_forced_update_applied?: string | null
          last_heartbeat?: string | null
          offline_detected_at?: string | null
          offline_reason?: string | null
          os_type?: string | null
          os_version?: string | null
          payload_hash?: string | null
          poll_interval_seconds?: number | null
          result_key_fingerprint?: string | null
          result_key_registered_at?: string | null
          result_public_key?: string | null
          safe_mode_entered_at?: string | null
          safe_mode_reason?: string | null
          signature_mode?: string | null
          status?: string | null
          tenant_id?: string | null
          throttle_reason?: string | null
          throttled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_installation_metrics: {
        Row: {
          avg_install_time_seconds: number | null
          failed_events: number | null
          last_event_at: string | null
          platform: string | null
          successful_events: number | null
          tenant_id: string | null
          total_copied: number | null
          total_downloaded: number | null
          total_generated: number | null
          total_installed: number | null
          with_network: number | null
          without_network: number | null
        }
        Relationships: [
          {
            foreignKeyName: "installation_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "installation_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_releases_public: {
        Row: {
          channel: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          platform: string | null
          release_notes: string | null
          sha256: string | null
          version: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          platform?: string | null
          release_notes?: string | null
          sha256?: string | null
          version?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          platform?: string | null
          release_notes?: string | null
          sha256?: string | null
          version?: string | null
        }
        Relationships: []
      }
      agent_system_metrics_unified: {
        Row: {
          agent_id: string | null
          collected_at: string | null
          cpu_cores: number | null
          cpu_name: string | null
          cpu_usage_percent: number | null
          created_at: string | null
          disk_free_gb: number | null
          disk_total_gb: number | null
          disk_usage_percent: number | null
          disk_used_gb: number | null
          id: string | null
          last_boot_time: string | null
          memory_free_gb: number | null
          memory_total_gb: number | null
          memory_usage_percent: number | null
          memory_used_gb: number | null
          network_bytes_received: number | null
          network_bytes_sent: number | null
          tenant_id: string | null
          uptime_seconds: number | null
        }
        Relationships: []
      }
      agent_timeline_events: {
        Row: {
          agent_id: string | null
          data: Json | null
          event_key: string | null
          event_time: string | null
          event_type: string | null
          source_id: string | null
          tenant_id: string | null
        }
        Relationships: []
      }
      agents_health_view: {
        Row: {
          agent_name: string | null
          agent_version: string | null
          enrolled_at: string | null
          health_status: string | null
          hostname: string | null
          id: string | null
          is_isolated: boolean | null
          is_throttled: boolean | null
          isolated_at: string | null
          isolation_reason: string | null
          last_heartbeat: string | null
          os_type: string | null
          os_version: string | null
          safe_mode_entered_at: string | null
          safe_mode_reason: string | null
          seconds_since_heartbeat: number | null
          status: string | null
          tenant_id: string | null
          throttle_reason: string | null
          throttled_at: string | null
        }
        Insert: {
          agent_name?: string | null
          agent_version?: string | null
          enrolled_at?: string | null
          health_status?: never
          hostname?: string | null
          id?: string | null
          is_isolated?: boolean | null
          is_throttled?: boolean | null
          isolated_at?: string | null
          isolation_reason?: string | null
          last_heartbeat?: string | null
          os_type?: string | null
          os_version?: string | null
          safe_mode_entered_at?: string | null
          safe_mode_reason?: string | null
          seconds_since_heartbeat?: never
          status?: string | null
          tenant_id?: string | null
          throttle_reason?: string | null
          throttled_at?: string | null
        }
        Update: {
          agent_name?: string | null
          agent_version?: string | null
          enrolled_at?: string | null
          health_status?: never
          hostname?: string | null
          id?: string | null
          is_isolated?: boolean | null
          is_throttled?: boolean | null
          isolated_at?: string | null
          isolation_reason?: string | null
          last_heartbeat?: string | null
          os_type?: string | null
          os_version?: string | null
          safe_mode_entered_at?: string | null
          safe_mode_reason?: string | null
          seconds_since_heartbeat?: never
          status?: string | null
          tenant_id?: string | null
          throttle_reason?: string | null
          throttled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agents_safe: {
        Row: {
          agent_name: string | null
          agent_version: string | null
          enrolled_at: string | null
          hostname: string | null
          id: string | null
          last_heartbeat: string | null
          os_type: string | null
          os_version: string | null
          payload_hash: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_name?: string | null
          agent_version?: string | null
          enrolled_at?: string | null
          hostname?: string | null
          id?: string | null
          last_heartbeat?: string | null
          os_type?: string | null
          os_version?: string | null
          payload_hash?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          agent_name?: string | null
          agent_version?: string | null
          enrolled_at?: string | null
          hostname?: string | null
          id?: string | null
          last_heartbeat?: string | null
          os_type?: string | null
          os_version?: string | null
          payload_hash?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      audit_logs_safe: {
        Row: {
          action: string | null
          created_at: string | null
          details: Json | null
          id: string | null
          ip_address_masked: string | null
          resource_id: string | null
          resource_type: string | null
          success: boolean | null
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string | null
          ip_address_masked?: never
          resource_id?: string | null
          resource_type?: string | null
          success?: boolean | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string | null
          ip_address_masked?: never
          resource_id?: string | null
          resource_type?: string | null
          success?: boolean | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_audit_logs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_audit_logs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_audit_logs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      circuit_breaker_health: {
        Row: {
          failure_count: number | null
          health_status: string | null
          last_event: string | null
          service: string | null
          state: string | null
          tenant_id: string | null
        }
        Insert: {
          failure_count?: number | null
          health_status?: never
          last_event?: string | null
          service?: string | null
          state?: string | null
          tenant_id?: string | null
        }
        Update: {
          failure_count?: number | null
          health_status?: never
          last_event?: string | null
          service?: string | null
          state?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "circuit_breaker_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circuit_breaker_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "circuit_breaker_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      dlq_categorized: {
        Row: {
          agent_id: string | null
          created_at: string | null
          error_message: string | null
          flagged_suspicious: boolean | null
          id: string | null
          job_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          retry_count: number | null
          review_notes: string | null
          risk_category: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          error_message?: string | null
          flagged_suspicious?: boolean | null
          id?: string | null
          job_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number | null
          review_notes?: string | null
          risk_category?: never
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          error_message?: string | null
          flagged_suspicious?: boolean | null
          id?: string | null
          job_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number | null
          review_notes?: string | null
          risk_category?: never
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      dlq_risk_overview: {
        Row: {
          newest_item: string | null
          oldest_item: string | null
          pending_items: number | null
          requires_attention: boolean | null
          risk_category: string | null
          total_items: number | null
        }
        Relationships: []
      }
      enrollment_keys_safe: {
        Row: {
          agent_id: string | null
          created_at: string | null
          created_by: string | null
          current_uses: number | null
          description: string | null
          expires_at: string | null
          id: string | null
          is_active: boolean | null
          key_masked: string | null
          max_uses: number | null
          tenant_id: string | null
          used_at: string | null
          used_by_agent: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          description?: string | null
          expires_at?: string | null
          id?: string | null
          is_active?: boolean | null
          key_masked?: never
          max_uses?: number | null
          tenant_id?: string | null
          used_at?: string | null
          used_by_agent?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          description?: string | null
          expires_at?: string | null
          id?: string | null
          is_active?: boolean | null
          key_masked?: never
          max_uses?: number | null
          tenant_id?: string | null
          used_at?: string | null
          used_by_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "enrollment_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_enrollment_keys_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollment_keys_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_enrollment_keys_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      governance_health_metrics: {
        Row: {
          decision_events_human: number | null
          decision_events_system: number | null
          decision_events_total: number | null
          human_decision_rate: number | null
          rollback_total: number | null
        }
        Relationships: []
      }
      hmac_signatures: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          hmac_secret: string | null
          result_key_fingerprint: string | null
          result_public_key: string | null
          signature_mode: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          hmac_secret?: string | null
          result_key_fingerprint?: string | null
          result_public_key?: string | null
          signature_mode?: string | null
          tenant_id?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          hmac_secret?: string | null
          result_key_fingerprint?: string | null
          result_public_key?: string | null
          signature_mode?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      insight_feedback_quality: {
        Row: {
          false_positive: number | null
          insight_type: string | null
          noise: number | null
          tenant_id: string | null
          total_feedback: number | null
          useful: number | null
          usefulness_rate: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_insight_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insight_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_insight_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      installation_error_summary: {
        Row: {
          error_count: number | null
          error_message: string | null
          event_type: string | null
          last_occurrence: string | null
          platform: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "installation_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "installation_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      installation_health_status: {
        Row: {
          activation_rate_pct: number | null
          active_agents: number | null
          pending_agents: number | null
          stuck_agents: number | null
          tenant_id: string | null
          total_agents: number | null
          window_interval: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      installation_metrics_summary: {
        Row: {
          date: string | null
          event_count: number | null
          event_type: string | null
          platform: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "installation_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "installation_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      job_failure_health: {
        Row: {
          failure_class: string | null
          is_retryable: boolean | null
          last_24h: number | null
          last_7d: number | null
          total: number | null
        }
        Relationships: []
      }
      job_integrity_violations: {
        Row: {
          agent_id: string | null
          completed_at: string | null
          job_created_at: string | null
          job_id: string | null
          job_type: string | null
          status: string | null
          violation_type: string | null
        }
        Insert: {
          agent_id?: string | null
          completed_at?: string | null
          job_created_at?: string | null
          job_id?: string | null
          job_type?: string | null
          status?: string | null
          violation_type?: never
        }
        Update: {
          agent_id?: string | null
          completed_at?: string | null
          job_created_at?: string | null
          job_id?: string | null
          job_type?: string | null
          status?: string | null
          violation_type?: never
        }
        Relationships: [
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs_normalized: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          approved: boolean | null
          completed_at: string | null
          created_at: string | null
          delivered_at: string | null
          duration_seconds: number | null
          error_message: string | null
          execution_time_seconds: number | null
          finished_at: string | null
          id: string | null
          is_recurring: boolean | null
          is_stuck: boolean | null
          is_v3: boolean | null
          last_run_at: string | null
          next_run_at: string | null
          normalized_status: string | null
          output: Json | null
          parent_job_id: string | null
          payload: Json | null
          recurrence_pattern: string | null
          scheduled_at: string | null
          started_at: string | null
          status: string | null
          tenant_id: string | null
          type: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          approved?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          execution_time_seconds?: number | null
          finished_at?: string | null
          id?: string | null
          is_recurring?: boolean | null
          is_stuck?: never
          is_v3?: never
          last_run_at?: string | null
          next_run_at?: string | null
          normalized_status?: string | null
          output?: Json | null
          parent_job_id?: string | null
          payload?: Json | null
          recurrence_pattern?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          type?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          approved?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          execution_time_seconds?: number | null
          finished_at?: string | null
          id?: string | null
          is_recurring?: boolean | null
          is_stuck?: never
          is_v3?: never
          last_run_at?: string | null
          next_run_at?: string | null
          normalized_status?: string | null
          output?: Json | null
          parent_job_id?: string | null
          payload?: Json | null
          recurrence_pattern?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "job_integrity_violations"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "jobs_normalized"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "v_jobs_status_corrected"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_jobs_report"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      rate_limit_stats: {
        Row: {
          blocked_until: string | null
          endpoint: string | null
          identifier: string | null
          is_blocked: boolean | null
          request_count: number | null
          window_start: string | null
        }
        Insert: {
          blocked_until?: string | null
          endpoint?: string | null
          identifier?: string | null
          is_blocked?: never
          request_count?: number | null
          window_start?: string | null
        }
        Update: {
          blocked_until?: string | null
          endpoint?: string | null
          identifier?: string | null
          is_blocked?: never
          request_count?: number | null
          window_start?: string | null
        }
        Relationships: []
      }
      v_action_center: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          context: Json | null
          created_at: string | null
          description: string | null
          hostname: string | null
          item_id: string | null
          playbook_id: string | null
          priority_score: number | null
          risk_score: number | null
          severity: string | null
          source_type: string | null
          tenant_id: string | null
          title: string | null
          trigger_type: string | null
        }
        Relationships: []
      }
      v_agent_execution_health: {
        Row: {
          agent_id: string | null
          agent_mode: string | null
          agent_name: string | null
          agent_version: string | null
          checked_at: string | null
          health_description: string | null
          health_status: string | null
          last_execution_at: string | null
          last_heartbeat: string | null
          minutes_since_execution: number | null
          minutes_since_heartbeat: number | null
          pending_jobs: number | null
          severity: string | null
          stale_delivered_jobs: number | null
          stale_queued_jobs: number | null
          status: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_agent_health_summary: {
        Row: {
          agent_name: string | null
          connection_status: string | null
          hostname: string | null
          id: string | null
          last_heartbeat: string | null
          os_type: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_name?: string | null
          connection_status?: never
          hostname?: string | null
          id?: string | null
          last_heartbeat?: string | null
          os_type?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          agent_name?: string | null
          connection_status?: never
          hostname?: string | null
          id?: string | null
          last_heartbeat?: string | null
          os_type?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_agent_lifecycle_state: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          agent_status: string | null
          command_copied_at: string | null
          downloaded_at: string | null
          enrolled_at: string | null
          generated_at: string | null
          hostname: string | null
          installation_metadata: Json | null
          installation_method: string | null
          installation_success: boolean | null
          installation_time_seconds: number | null
          installed_at: string | null
          last_error_at: string | null
          last_error_message: string | null
          last_heartbeat: string | null
          lifecycle_stage: string | null
          minutes_since_enrollment: number | null
          minutes_since_heartbeat: number | null
          minutes_to_install: number | null
          network_connectivity: boolean | null
          os_type: string | null
          os_version: string | null
          platform: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          agent_status?: string | null
          command_copied_at?: never
          downloaded_at?: never
          enrolled_at?: never
          generated_at?: never
          hostname?: string | null
          installation_metadata?: never
          installation_method?: never
          installation_success?: never
          installation_time_seconds?: never
          installed_at?: never
          last_error_at?: never
          last_error_message?: never
          last_heartbeat?: never
          lifecycle_stage?: never
          minutes_since_enrollment?: never
          minutes_since_heartbeat?: never
          minutes_to_install?: never
          network_connectivity?: never
          os_type?: string | null
          os_version?: string | null
          platform?: never
          tenant_id?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          agent_status?: string | null
          command_copied_at?: never
          downloaded_at?: never
          enrolled_at?: never
          generated_at?: never
          hostname?: string | null
          installation_metadata?: never
          installation_method?: never
          installation_success?: never
          installation_time_seconds?: never
          installed_at?: never
          last_error_at?: never
          last_error_message?: never
          last_heartbeat?: never
          lifecycle_stage?: never
          minutes_since_enrollment?: never
          minutes_since_heartbeat?: never
          minutes_to_install?: never
          network_connectivity?: never
          os_type?: string | null
          os_version?: string | null
          platform?: never
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_ai_anomalies: {
        Row: {
          action_type: string | null
          anomaly_type: string | null
          executed: number | null
          failed: number | null
          resolved_insights: number | null
          severity: string | null
          tenant_id: string | null
          total_actions: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_audit_integrity_status: {
        Row: {
          all_checks_valid: boolean | null
          last_check: string | null
          status: string | null
          tenant_id: string | null
          total_breaks: number | null
          total_checks: number | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_integrity_checks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_integrity_checks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "audit_integrity_checks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_confidence_gap_trend: {
        Row: {
          alert_triggered: boolean | null
          ana_score: number | null
          avg_gap_30d: number | null
          avg_gap_90d: number | null
          confidence_gap: number | null
          consecutive_alerts: number | null
          consecutive_decrease: boolean | null
          created_at: string | null
          gap_change: number | null
          gap_delta: number | null
          health_status: string | null
          id: string | null
          red_score: number | null
          tenant_id: string | null
          trend_direction: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_confidence_gaps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_confidence_gaps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "audit_confidence_gaps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_dlq_risk_overview: {
        Row: {
          manually_reviewed: number | null
          overdue_items: number | null
          resolved_items: number | null
          review_rate_pct: number | null
          suspicious_items: number | null
          tenant_id: string | null
          total_items: number | null
        }
        Relationships: [
          {
            foreignKeyName: "failed_jobs_dlq_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_edge_function_stats: {
        Row: {
          avg_latency_ms: number | null
          failed_calls: number | null
          first_call: string | null
          function_name: string | null
          last_call: string | null
          max_latency_ms: number | null
          min_latency_ms: number | null
          p50_latency_ms: number | null
          p95_latency_ms: number | null
          p99_latency_ms: number | null
          successful_calls: number | null
          total_calls: number | null
        }
        Relationships: []
      }
      v_execution_chain_health: {
        Row: {
          actual_max_index: number | null
          agent_id: string | null
          agent_name: string | null
          agent_status: string | null
          chain_index: number | null
          chain_updated_at: string | null
          sync_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      v_integrity_score: {
        Row: {
          active_releases: number | null
          archived_releases: number | null
          calculated_at: string | null
          completed_jobs: number | null
          completed_without_output: number | null
          failed_jobs: number | null
          failed_jobs_score: number | null
          failed_with_error: number | null
          global_integrity_score: number | null
          job_integrity_score: number | null
          supply_chain_score: number | null
          total_jobs: number | null
          total_releases: number | null
          valid_active_releases: number | null
          valid_completed_jobs: number | null
        }
        Relationships: []
      }
      v_job_execution_health: {
        Row: {
          avg_execution_time_seconds: number | null
          avg_queue_time_seconds: number | null
          calculated_at: string | null
          completed_count: number | null
          delivered_count: number | null
          duplicate_execution_jobs: number | null
          expired_completed_count: number | null
          failed_count: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_job_health: {
        Row: {
          avg_duration_ms: number | null
          failure_count_24h: number | null
          health_status: string | null
          job_key: string | null
          job_source: string | null
          last_failure: string | null
          last_run: string | null
          last_success: string | null
          max_duration_ms: number | null
          severity: string | null
          success_count_24h: number | null
          total_runs_24h: number | null
        }
        Relationships: []
      }
      v_job_hourly_trends: {
        Row: {
          completed: number | null
          failed: number | null
          hour: string | null
          success_rate_pct: number | null
          tenant_id: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_job_metrics_by_type: {
        Row: {
          avg_execution_seconds: number | null
          completed: number | null
          delivered: number | null
          failed: number | null
          queued: number | null
          stuck: number | null
          success_rate_pct: number | null
          tenant_id: string | null
          total_jobs: number | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_jobs_status_corrected: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          approved: boolean | null
          completed_at: string | null
          corrected_status: string | null
          created_at: string | null
          current_execution_id: string | null
          delivered_at: string | null
          delivery_attempts: number | null
          error_message: string | null
          execution_time_seconds: number | null
          expires_at: string | null
          finished_at: string | null
          id: string | null
          is_real_failure: boolean | null
          is_recurring: boolean | null
          last_run_at: string | null
          next_run_at: string | null
          output: Json | null
          parent_job_id: string | null
          payload: Json | null
          payload_hash: string | null
          priority: number | null
          recurrence_pattern: string | null
          scheduled_at: string | null
          started_at: string | null
          status: string | null
          tenant_id: string | null
          type: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          approved?: boolean | null
          completed_at?: string | null
          corrected_status?: never
          created_at?: string | null
          current_execution_id?: string | null
          delivered_at?: string | null
          delivery_attempts?: number | null
          error_message?: string | null
          execution_time_seconds?: number | null
          expires_at?: string | null
          finished_at?: string | null
          id?: string | null
          is_real_failure?: never
          is_recurring?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          output?: Json | null
          parent_job_id?: string | null
          payload?: Json | null
          payload_hash?: string | null
          priority?: number | null
          recurrence_pattern?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          type?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          approved?: boolean | null
          completed_at?: string | null
          corrected_status?: never
          created_at?: string | null
          current_execution_id?: string | null
          delivered_at?: string | null
          delivery_attempts?: number | null
          error_message?: string | null
          execution_time_seconds?: number | null
          expires_at?: string | null
          finished_at?: string | null
          id?: string | null
          is_real_failure?: never
          is_recurring?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          output?: Json | null
          parent_job_id?: string | null
          payload?: Json | null
          payload_hash?: string | null
          priority?: number | null
          recurrence_pattern?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_current_execution_id_fkey"
            columns: ["current_execution_id"]
            isOneToOne: false
            referencedRelation: "job_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "job_integrity_violations"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "jobs_normalized"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "v_jobs_status_corrected"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_jobs_report"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_pipeline_health_metrics: {
        Row: {
          completed_jobs: number | null
          completed_with_data: number | null
          failed_jobs: number | null
          hour: string | null
          in_progress_jobs: number | null
          queued_jobs: number | null
          silent_failures: number | null
          success_rate: number | null
          total_jobs: number | null
          type: string | null
        }
        Relationships: []
      }
      v_problematic_agents: {
        Row: {
          agent_name: string | null
          enrolled_at: string | null
          has_active_token: boolean | null
          hostname: string | null
          id: string | null
          issue_type: string | null
          last_heartbeat: string | null
          minutes_since_enrollment: number | null
          os_type: string | null
          pending_jobs_count: number | null
          status: string | null
          tenant_id: string | null
          tenant_name: string | null
          token_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agents_tenant_id_new_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_problematic_jobs: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string | null
          minutes_stuck: number | null
          problem_type: string | null
          status: string | null
          tenant_id: string | null
          type: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string | null
          minutes_stuck?: never
          problem_type?: never
          status?: string | null
          tenant_id?: string | null
          type?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string | null
          minutes_stuck?: never
          problem_type?: never
          status?: string | null
          tenant_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_signatures"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_health_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_rls_security_status: {
        Row: {
          failed: number | null
          pass_rate_pct: number | null
          passed: number | null
          run_at: string | null
          test_run_id: string | null
          total_tests: number | null
        }
        Relationships: []
      }
      v_soc2_readiness: {
        Row: {
          criteria_code: string | null
          criteria_name: string | null
          criteria_readiness_score: number | null
          criteria_status: string | null
          implemented_controls: number | null
          in_progress_controls: number | null
          not_started_controls: number | null
          tenant_id: string | null
          total_controls: number | null
          verified_controls: number | null
        }
        Relationships: [
          {
            foreignKeyName: "soc2_criteria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soc2_criteria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "soc2_criteria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_stuck_jobs_report: {
        Row: {
          agent_name: string | null
          created_at: string | null
          delivered_at: string | null
          id: string | null
          minutes_stuck: number | null
          problem_type: string | null
          status: string | null
          tenant_id: string | null
          type: string | null
        }
        Insert: {
          agent_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string | null
          minutes_stuck?: never
          problem_type?: never
          status?: string | null
          tenant_id?: string | null
          type?: string | null
        }
        Update: {
          agent_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string | null
          minutes_stuck?: never
          problem_type?: never
          status?: string | null
          tenant_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_jobs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_system_operations_summary: {
        Row: {
          jobs_24h: number | null
          jobs_completed_24h: number | null
          jobs_failed_24h: number | null
          offline_agents: number | null
          online_agents: number | null
          open_alerts: number | null
          tenant_id: string | null
          tenant_name: string | null
          total_agents: number | null
        }
        Insert: {
          jobs_24h?: never
          jobs_completed_24h?: never
          jobs_failed_24h?: never
          offline_agents?: never
          online_agents?: never
          open_alerts?: never
          tenant_id?: string | null
          tenant_name?: string | null
          total_agents?: never
        }
        Update: {
          jobs_24h?: never
          jobs_completed_24h?: never
          jobs_failed_24h?: never
          offline_agents?: never
          online_agents?: never
          open_alerts?: never
          tenant_id?: string | null
          tenant_name?: string | null
          total_agents?: never
        }
        Relationships: []
      }
      v_tenant_plan_status: {
        Row: {
          agent_limit_status: string | null
          current_agents: number | null
          max_agents: number | null
          tenant_id: string | null
          tenant_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      acknowledge_all_alerts: { Args: { p_tenant_id: string }; Returns: Json }
      aggregate_daily_metrics: {
        Args: { p_date?: string }
        Returns: {
          agents_processed: number
          rows_inserted: number
        }[]
      }
      apply_agent_isolation: {
        Args: { p_agent_id: string; p_reason?: string }
        Returns: boolean
      }
      apply_agent_throttle: {
        Args: {
          p_agent_id: string
          p_poll_interval_seconds?: number
          p_reason?: string
        }
        Returns: boolean
      }
      apply_version_block: {
        Args: {
          p_blocked_by?: string
          p_platform: string
          p_reason?: string
          p_version: string
        }
        Returns: boolean
      }
      archive_agent: { Args: { p_agent_id: string }; Returns: Json }
      authorize_agent_recovery: {
        Args: {
          p_agent_id: string
          p_approved_by: string
          p_expires_in_minutes?: number
        }
        Returns: Json
      }
      auto_acknowledge_old_insights: {
        Args: never
        Returns: {
          acknowledged_count: number
          insight_ids: string[]
        }[]
      }
      auto_cancel_zombie_jobs: {
        Args: never
        Returns: {
          cancelled_count: number
          job_ids: string[]
        }[]
      }
      backfill_audit_log_hashes: {
        Args: { p_tenant_id?: string }
        Returns: {
          tenant_id: string
          updated_count: number
        }[]
      }
      calculate_confidence_gap: {
        Args: {
          p_ana_score: number
          p_audit_id: string
          p_dimension_gaps?: Json
          p_red_score: number
          p_red_team_id: string
          p_tenant_id: string
        }
        Returns: {
          alert_reason: string | null
          alert_triggered: boolean | null
          ana_score: number
          audit_id: string | null
          confidence_gap: number
          created_at: string
          dimension_gaps: Json | null
          gap_delta: number | null
          health_status: string
          id: string
          previous_gap: number | null
          red_score: number
          red_team_id: string | null
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "audit_confidence_gaps"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      calculate_event_risk: {
        Args: { p_context: Json; p_event_type: string }
        Returns: number
      }
      calculate_next_run: {
        Args: { from_time?: string; pattern: string }
        Returns: string
      }
      calculate_payload_hash: { Args: { p_payload: Json }; Returns: string }
      calculate_pipeline_metrics: {
        Args: { p_hours_back?: number; p_tenant_id: string }
        Returns: {
          avg_install_time_seconds: number
          conversion_rate_copied_to_installed_pct: number
          conversion_rate_generated_to_installed_pct: number
          success_rate_pct: number
          total_active: number
          total_command_copied: number
          total_downloaded: number
          total_generated: number
          total_installed: number
          total_stuck: number
        }[]
      }
      can_hard_delete_agent: { Args: { p_agent_id: string }; Returns: Json }
      capture_forensic_snapshot_full: {
        Args: {
          p_agent_id: string
          p_metadata?: Json
          p_trigger_event_id?: string
          p_trigger_reason: string
        }
        Returns: string
      }
      check_action_rate_limit: {
        Args: { p_action_type: string; p_tenant_id: string }
        Returns: boolean
      }
      check_ai_circuit_breaker: {
        Args: { p_action_type: string; p_tenant_id: string }
        Returns: Json
      }
      check_and_block_ip: {
        Args: { p_email?: string; p_ip_address: string }
        Returns: {
          attempt_count: number
          block_level: number
          blocked_until: string
          is_blocked: boolean
        }[]
      }
      check_approval_complete: { Args: { p_request_id: string }; Returns: Json }
      check_execution_orphans: {
        Args: never
        Returns: {
          affected_job_ids: string[]
          null_payload_hash_count: number
          orphan_count: number
          residual_execution_id_count: number
        }[]
      }
      check_expired_agent_keys: {
        Args: never
        Returns: {
          agents_affected: string[]
          expired_count: number
        }[]
      }
      check_installation_failure_rate: {
        Args: {
          p_hours_back?: number
          p_tenant_id?: string
          p_threshold_pct?: number
        }
        Returns: {
          exceeds_threshold: boolean
          failed_attempts: number
          failure_rate_pct: number
          period_end: string
          period_start: string
          tenant_id: string
          total_attempts: number
        }[]
      }
      claim_jobs_for_agent:
        | {
            Args: { p_agent_id: string; p_agent_name: string; p_limit?: number }
            Returns: {
              agent_id: string
              agent_name: string
              approved: boolean
              created_at: string
              expires_at: string
              id: string
              payload: Json
              priority: number
              type: string
            }[]
          }
        | {
            Args: {
              p_agent_id: string
              p_agent_name: string
              p_limit?: number
              p_tenant_id: string
            }
            Returns: {
              execution_id: string
              expires_at: string
              job_id: string
              job_type: string
              nonce: string
              payload: Json
              payload_hash: string
            }[]
          }
        | {
            Args: { p_agent_id: string; p_max_jobs?: number }
            Returns: {
              execution_id: string
              execution_index: number
              expires_at: string
              job_id: string
              job_type: string
              nonce: string
              payload: Json
              payload_hash: string
              previous_execution_hash: string
            }[]
          }
      classify_job_failure: {
        Args: { p_error_message: string }
        Returns: string
      }
      cleanup_all_problematic_agents: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      cleanup_expired_keys: { Args: never; Returns: undefined }
      cleanup_offline_agents_jobs: {
        Args: never
        Returns: {
          agent_ids: string[]
          cleaned_count: number
          job_ids: string[]
        }[]
      }
      cleanup_old_data: { Args: never; Returns: undefined }
      cleanup_old_data_scheduled: { Args: never; Returns: Json }
      cleanup_old_disk_metrics: {
        Args: { retention_days?: number }
        Returns: number
      }
      cleanup_old_failed_attempts: { Args: never; Returns: undefined }
      cleanup_old_hmac_signatures: { Args: never; Returns: number }
      cleanup_old_metrics: { Args: never; Returns: undefined }
      cleanup_old_metrics_90days: {
        Args: never
        Returns: {
          deleted_count: number
          table_name: string
        }[]
      }
      cleanup_old_metrics_aggressive: {
        Args: never
        Returns: {
          deleted_count: number
          oldest_remaining: string
        }[]
      }
      cleanup_old_performance_metrics: { Args: never; Returns: undefined }
      cleanup_old_problematic_jobs: {
        Args: { p_days_old?: number }
        Returns: {
          deleted_count: number
          job_ids: string[]
        }[]
      }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      cleanup_old_security_logs: { Args: never; Returns: undefined }
      cleanup_old_system_metrics: {
        Args: { retention_days?: number }
        Returns: {
          deleted_count: number
          partition_name: string
        }[]
      }
      cleanup_old_update_decisions: { Args: never; Returns: undefined }
      cleanup_orphaned_agents: { Args: never; Returns: number }
      cleanup_problematic_agent: { Args: { p_agent_id: string }; Returns: Json }
      cleanup_stale_queued_jobs: {
        Args: { p_hours_threshold?: number }
        Returns: {
          cleaned_count: number
          job_ids: string[]
        }[]
      }
      cleanup_stuck_builds: {
        Args: never
        Returns: {
          build_ids: string[]
          cleaned_count: number
        }[]
      }
      cleanup_stuck_jobs: {
        Args: never
        Returns: {
          cleaned_count: number
          job_ids: string[]
        }[]
      }
      cleanup_stuck_jobs_v2: {
        Args: {
          p_delivered_timeout_hours?: number
          p_queued_timeout_hours?: number
        }
        Returns: {
          cleaned_delivered: number
          cleaned_queued: number
          job_ids: string[]
        }[]
      }
      create_approval_request: {
        Args: {
          p_action_payload: Json
          p_action_type: string
          p_playbook_execution_id?: string
          p_target_agent_id?: string
        }
        Returns: Json
      }
      create_metrics_partition_if_needed: { Args: never; Returns: undefined }
      create_retroactive_execution: {
        Args: { p_job_id: string }
        Returns: string
      }
      current_user_tenant_id: { Args: never; Returns: string }
      detect_blocked_access_attempts: {
        Args: never
        Returns: {
          inserted_count: number
        }[]
      }
      detect_chain_breaks: {
        Args: never
        Returns: {
          affected_agents: string[]
          break_count: number
        }[]
      }
      detect_critical_failure_pattern: {
        Args: { p_min_failures?: number; p_window_minutes?: number }
        Returns: {
          agent_id: string
          agent_name: string
          failure_count: number
          failure_type: string
          first_failure: string
          heartbeat_active: boolean
          last_failure: string
          last_heartbeat: string
          tenant_id: string
        }[]
      }
      detect_duplicate_executions: {
        Args: { p_hours_back?: number }
        Returns: {
          agent_name: string
          execution_count: number
          first_claimed_at: string
          job_id: string
          last_claimed_at: string
          tenant_id: string
        }[]
      }
      detect_improdutive_agents: {
        Args: never
        Returns: {
          agent_id: string
          agent_name: string
          health_status: string
          minutes_since_execution: number
          minutes_since_heartbeat: number
          pending_jobs: number
          stale_queued_jobs: number
          tenant_id: string
        }[]
      }
      detect_isolation_candidates: {
        Args: {
          p_suspicious_events_count?: number
          p_time_window_minutes?: number
        }
        Returns: {
          agent_id: string
          agent_name: string
          event_count: number
          event_types: string[]
          tenant_id: string
        }[]
      }
      detect_throttle_candidates: {
        Args: { p_requests_per_minute?: number; p_time_window_minutes?: number }
        Returns: {
          agent_id: string
          agent_name: string
          error_count: number
          error_rate: number
          request_count: number
          tenant_id: string
        }[]
      }
      detect_throttle_revert_candidates: {
        Args: never
        Returns: {
          agent_id: string
          agent_name: string
          minutes_since_execution: number
          pending_jobs: number
          tenant_id: string
          throttled_at: string
        }[]
      }
      detect_version_block_candidates: {
        Args: {
          p_affected_agents_count?: number
          p_failure_rate_percent?: number
          p_time_window_hours?: number
        }
        Returns: {
          failed_agents: number
          failure_rate: number
          platform: string
          total_agents: number
          version: string
          version_id: string
        }[]
      }
      diagnose_agent: { Args: { p_agent_name: string }; Returns: Json }
      diagnose_agent_issues: {
        Args: { p_agent_name: string; p_tenant_id: string }
        Returns: {
          details: Json
          detected_at: string
          issue_type: string
          message: string
          origin: string
          severity: string
        }[]
      }
      drop_old_metrics_partitions: {
        Args: { retention_months?: number }
        Returns: {
          partition_dropped: string
        }[]
      }
      ensure_tenant_features: {
        Args: {
          p_device_quantity?: number
          p_plan_name: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      enter_autonomous_safe_mode: {
        Args: {
          p_agent_id: string
          p_failure_count: number
          p_failure_type: string
          p_reason: string
        }
        Returns: Json
      }
      evaluate_decision_rules: { Args: never; Returns: Json }
      evaluate_playbook_trigger: {
        Args: {
          p_agent_id?: string
          p_tenant_id: string
          p_trigger_context?: Json
          p_trigger_type: string
        }
        Returns: string
      }
      execute_ai_action_rollback: {
        Args: { p_ai_action_id: string; p_notes?: string; p_success: boolean }
        Returns: Json
      }
      finalize_job_execution: {
        Args: {
          p_agent_id: string
          p_error_message?: string
          p_execution_hash?: string
          p_execution_id: string
          p_execution_index?: number
          p_execution_time_seconds?: number
          p_finished_at?: string
          p_job_id: string
          p_output_hash?: string
          p_previous_execution_hash?: string
          p_result_signature?: string
          p_signature_verified?: boolean
          p_started_at?: string
          p_status: string
        }
        Returns: Json
      }
      force_review_unreviewed_dlq: {
        Args: { p_max_items?: number; p_reviewer_id: string }
        Returns: {
          flagged_suspicious: number
          items_processed: string[]
          reviewed_count: number
        }[]
      }
      generate_ai_actions_from_insights: { Args: never; Returns: Json }
      generate_audit_reason_tree: {
        Args: { p_score: number; p_tenant_id: string }
        Returns: Json
      }
      get_action_center_feed: { Args: { p_tenant_id: string }; Returns: Json }
      get_agent_disk_details: {
        Args: { p_agent_id: string }
        Returns: {
          collected_at: string
          drive_label: string
          drive_letter: string
          drive_type: string
          free_gb: number
          is_system_drive: boolean
          total_gb: number
          usage_percent: number
          used_gb: number
        }[]
      }
      get_agent_health_metrics: {
        Args: { p_tenant_id: string }
        Returns: {
          agent_name: string
          agent_version: string
          enrolled_at: string
          has_critical_alerts: boolean
          health_status: string
          hostname: string
          id: string
          is_in_safe_mode: boolean
          is_isolated: boolean
          is_throttled: boolean
          isolation_reason: string
          last_heartbeat: string
          os_type: string
          os_version: string
          safe_mode_reason: string
          seconds_since_heartbeat: number
          status: string
          throttle_reason: string
        }[]
      }
      get_alert_decision_chain: { Args: { p_alert_id: string }; Returns: Json }
      get_audit_raw_metrics:
        | { Args: { p_tenant_id: string }; Returns: Json }
        | { Args: { p_tenant_id: string; p_user_id: string }; Returns: Json }
      get_autonomy_metrics: {
        Args: { p_days?: number; p_tenant_id: string }
        Returns: Json
      }
      get_critical_insights_count: {
        Args: { p_tenant_id: string }
        Returns: number
      }
      get_decision_timeline: {
        Args: {
          p_agent_id?: string
          p_limit?: number
          p_rule_code?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_enrollment_key_full: { Args: { p_key_id: string }; Returns: string }
      get_governance_snapshot: { Args: never; Returns: Json }
      get_installation_health_status: {
        Args: { p_tenant_id: string }
        Returns: {
          failure_rate_pct: number
          status: string
          threshold: number
          total_attempts: number
        }[]
      }
      get_job_health_summary: { Args: never; Returns: Json }
      get_latest_agent_metrics: {
        Args: { p_tenant_id: string }
        Returns: {
          agent_id: string
          agent_name: string
          cpu_usage_percent: number
          disk_usage_percent: number
          hostname: string
          last_heartbeat: string
          memory_usage_percent: number
          metrics_age_minutes: number
          os_type: string
          os_version: string
          status: string
          uptime_seconds: number
        }[]
      }
      get_playbook_execution_breakdown: {
        Args: { p_days_back?: number; p_tenant_id: string }
        Returns: {
          avg_response_minutes: number
          completed_count: number
          failed_count: number
          ignored_count: number
          last_triggered_at: string
          playbook_id: string
          playbook_name: string
          severity: string
          total_triggers: number
        }[]
      }
      get_playbook_metrics: {
        Args: { p_days_back?: number; p_tenant_id: string }
        Returns: {
          avg_response_time_minutes: number
          execution_rate_pct: number
          ignore_rate_pct: number
          max_response_time_minutes: number
          min_response_time_minutes: number
          most_triggered_count: number
          most_triggered_playbook_id: string
          most_triggered_playbook_name: string
          period_end: string
          period_start: string
          total_completed: number
          total_executions: number
          total_failed: number
          total_ignored: number
        }[]
      }
      get_problematic_agents: {
        Args: { p_tenant_id: string }
        Returns: {
          agent_name: string
          created_at: string
          id: string
          installation_success: boolean
          metadata: Json
          minutes_since_creation: number
          network_connectivity: boolean
          status: string
        }[]
      }
      get_rate_limit_summary: {
        Args: { p_hours_back?: number }
        Returns: {
          avg_requests_per_identifier: number
          blocked_count: number
          endpoint: string
          total_requests: number
          unique_identifiers: number
        }[]
      }
      get_recent_jobs: {
        Args: { p_limit?: number; p_tenant_id: string }
        Returns: {
          agent_id: string | null
          agent_name: string
          approved: boolean
          completed_at: string | null
          created_at: string
          current_execution_id: string | null
          delivered_at: string | null
          delivery_attempts: number
          error_message: string | null
          execution_time_seconds: number | null
          expires_at: string | null
          failure_class: string | null
          finished_at: string | null
          id: string
          is_recurring: boolean | null
          last_run_at: string | null
          next_run_at: string | null
          output: Json | null
          parent_job_id: string | null
          payload: Json | null
          payload_hash: string
          priority: number | null
          recurrence_pattern: string | null
          retry_count: number | null
          scheduled_at: string | null
          started_at: string | null
          status: string
          tenant_id: string
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_replay_attempts: {
        Args: { hours_back?: number }
        Returns: {
          attempt_count: number
          first_attempt: string
          last_attempt: string
          signature: string
        }[]
      }
      get_report_frequency_days: {
        Args: { p_plan_name: string }
        Returns: number
      }
      get_software_risk_summary: {
        Args: { p_tenant_id: string }
        Returns: {
          category_breakdown: Json
          count: number
          risk_level: string
        }[]
      }
      get_valid_agent_signing_key: {
        Args: { p_agent_id: string; p_fingerprint: string }
        Returns: {
          algorithm: string
          is_current: boolean
          key_id: string
          public_key: string
          version: number
        }[]
      }
      get_valid_agent_signing_key_by_agent: {
        Args: { p_agent_id: string }
        Returns: {
          algorithm: string
          is_current: boolean
          key_id: string
          public_key: string
          version: number
        }[]
      }
      hard_delete_agent: { Args: { p_agent_id: string }; Returns: Json }
      has_recent_playbook_execution: {
        Args: {
          p_agent_id?: string
          p_cooldown_minutes?: number
          p_playbook_id: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_agent_token: { Args: { p_token: string }; Returns: string }
      hash_enrollment_key: { Args: { p_key: string }; Returns: string }
      hash_enrollment_key_secure: { Args: { p_key: string }; Returns: string }
      installation_health_summary: {
        Args: never
        Returns: {
          failed_events: number
          os_type: string
          success_rate: number
          successful_events: number
          total_events: number
          window_interval: string
        }[]
      }
      is_operator_or_viewer: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      log_scheduled_job_run: {
        Args: {
          p_duration_ms?: number
          p_error?: string
          p_job_key: string
          p_job_source?: string
          p_processed_count?: number
          p_result?: Json
          p_success: boolean
        }
        Returns: string
      }
      log_sensitive_access: {
        Args: {
          p_action: string
          p_details?: Json
          p_resource_id: string
          p_resource_type: string
        }
        Returns: undefined
      }
      log_state_change: {
        Args: {
          p_action: string
          p_details?: Json
          p_request_id?: string
          p_resource_id: string
          p_resource_type: string
          p_state_after?: Json
          p_state_before?: Json
        }
        Returns: undefined
      }
      parse_version_code: { Args: { version_text: string }; Returns: number }
      persist_chain_breaks: { Args: never; Returns: number }
      process_autonomous_safe_mode: { Args: never; Returns: Json }
      process_safe_mode_entry: {
        Args: {
          p_agent_id: string
          p_agent_version?: string
          p_entered_at: string
          p_execution_hash?: string
          p_failure_count?: number
          p_reason: string
        }
        Returns: string
      }
      reconstruct_incident_timeline: {
        Args: { p_agent_id: string; p_end_time: string; p_start_time: string }
        Returns: Json
      }
      register_agent_signing_key: {
        Args: {
          p_agent_id: string
          p_algorithm?: string
          p_fingerprint: string
          p_public_key: string
        }
        Returns: {
          key_id: string
          valid_from: string
          version: number
        }[]
      }
      remove_agent_isolation: { Args: { p_agent_id: string }; Returns: boolean }
      remove_agent_throttle: { Args: { p_agent_id: string }; Returns: boolean }
      reprocess_job_outputs: {
        Args: { p_hours_back?: number }
        Returns: {
          agent_name: string
          job_id: string
          job_type: string
          needs_reprocessing: boolean
          output_type: string
        }[]
      }
      request_ai_action_rollback: {
        Args: {
          p_ai_action_id: string
          p_reason: string
          p_requested_by: string
        }
        Returns: Json
      }
      reset_monthly_scan_quota: { Args: never; Returns: undefined }
      review_dlq_item: {
        Args: {
          p_dlq_id: string
          p_review_notes: string
          p_risk_category?: string
        }
        Returns: Json
      }
      revive_agent_on_reenroll: {
        Args: { p_agent_id: string; p_new_hmac_secret: string }
        Returns: Json
      }
      revoke_agent_signing_key: {
        Args: { p_key_id: string; p_reason?: string }
        Returns: boolean
      }
      should_auto_execute_playbook: {
        Args: { p_context: Json; p_event_type: string; p_playbook_id: string }
        Returns: Json
      }
      should_auto_quarantine: {
        Args: { p_context: Json; p_tenant_id: string }
        Returns: boolean
      }
      submit_agent_evidence: {
        Args: {
          p_agent_id: string
          p_agent_name: string
          p_agent_version: string
          p_event_data: Json
          p_event_type: string
          p_evidence_hash: string
          p_severity?: string
          p_state_after?: string
          p_state_before?: string
          p_tenant_id: string
        }
        Returns: string
      }
      submit_approval: {
        Args: { p_decision: string; p_reason?: string; p_request_id: string }
        Returns: Json
      }
      sync_agent_status_from_heartbeat: { Args: never; Returns: undefined }
      sync_pending_agents_status: {
        Args: never
        Returns: {
          agent_id: string
          agent_name: string
          minutes_since_enrollment: number
          new_status: string
          old_status: string
        }[]
      }
      test_tenant_isolation: {
        Args: never
        Returns: {
          details: string
          has_rls_enabled: boolean
          has_tenant_id: boolean
          isolation_valid: boolean
          table_name: string
        }[]
      }
      update_quota_usage: {
        Args: { p_delta: number; p_feature_key: string; p_tenant_id: string }
        Returns: undefined
      }
      update_user_role_rpc: {
        Args: {
          p_new_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: Json
      }
      user_belongs_to_tenant: { Args: { _tenant_id: string }; Returns: boolean }
      user_has_tenant_access: { Args: { _tenant_id: string }; Returns: boolean }
      validate_agent_release_integrity: {
        Args: never
        Returns: {
          channel: string
          is_valid: boolean
          platform: string
          release_id: string
          validation_notes: string
          version: string
        }[]
      }
      validate_audit_trail_integrity: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      validate_blast_radius: {
        Args: {
          p_action_type: string
          p_target_agent_ids: string[]
          p_tenant_id: string
        }
        Returns: Json
      }
      validate_enrollment_key_by_hash: {
        Args: { p_key_hash: string }
        Returns: {
          agent_id: string
          current_uses: number
          expires_at: string
          id: string
          is_active: boolean
          max_uses: number
          tenant_id: string
        }[]
      }
      verify_audit_log_chain: {
        Args: {
          p_end_date?: string
          p_start_date?: string
          p_tenant_id: string
        }
        Returns: {
          broken_log_id: string
          chain_valid: boolean
          first_broken_at: string
          total_logs: number
        }[]
      }
      verify_document_signature: {
        Args: { p_document_hash: string; p_signature: string }
        Returns: {
          document_name: string
          is_valid: boolean
          signed_at: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "viewer" | "super_admin" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "operator", "viewer", "super_admin", "member"],
    },
  },
} as const
