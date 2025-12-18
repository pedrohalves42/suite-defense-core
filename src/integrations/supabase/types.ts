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
          version?: string
        }
        Relationships: []
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
      agent_versions: {
        Row: {
          created_at: string | null
          download_url: string
          id: string
          is_latest: boolean | null
          platform: string
          release_notes: string | null
          sha256: string
          size_bytes: number
          version: string
        }
        Insert: {
          created_at?: string | null
          download_url: string
          id?: string
          is_latest?: boolean | null
          platform: string
          release_notes?: string | null
          sha256: string
          size_bytes: number
          version: string
        }
        Update: {
          created_at?: string | null
          download_url?: string
          id?: string
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
        ]
      }
      agents: {
        Row: {
          agent_name: string
          agent_version: string | null
          display_name: string | null
          enrolled_at: string
          hmac_secret: string
          hostname: string | null
          id: string
          last_heartbeat: string | null
          os_type: string | null
          os_version: string | null
          payload_hash: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          agent_name: string
          agent_version?: string | null
          display_name?: string | null
          enrolled_at?: string
          hmac_secret: string
          hostname?: string | null
          id?: string
          last_heartbeat?: string | null
          os_type?: string | null
          os_version?: string | null
          payload_hash?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          agent_name?: string
          agent_version?: string | null
          display_name?: string | null
          enrolled_at?: string
          hmac_secret?: string
          hostname?: string | null
          id?: string
          last_heartbeat?: string | null
          os_type?: string | null
          os_version?: string | null
          payload_hash?: string | null
          status?: string
          tenant_id?: string
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
          created_at: string | null
          description: string | null
          id: string
          is_enabled: boolean | null
          max_executions_per_day: number | null
          requires_approval: boolean | null
          risk_level: string | null
          updated_at: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          max_executions_per_day?: number | null
          requires_approval?: boolean | null
          risk_level?: string | null
          updated_at?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          description?: string | null
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
        ]
      }
      ai_actions: {
        Row: {
          action_payload: Json
          action_type: string
          created_at: string
          error_message: string | null
          executed_at: string | null
          executed_by: string | null
          id: string
          insight_id: string | null
          result: Json | null
          status: string
          tenant_id: string
        }
        Insert: {
          action_payload?: Json
          action_type: string
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          insight_id?: string | null
          result?: Json | null
          status?: string
          tenant_id: string
        }
        Update: {
          action_payload?: Json
          action_type?: string
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          insight_id?: string | null
          result?: Json | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
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
        ]
      }
      ai_insights: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          confidence_score: number | null
          created_at: string
          description: string
          evidence: Json
          id: string
          insight_type: string
          metadata: Json | null
          recommendation: string | null
          severity: string
          tenant_id: string
          title: string
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          confidence_score?: number | null
          created_at?: string
          description: string
          evidence?: Json
          id?: string
          insight_type: string
          metadata?: Json | null
          recommendation?: string | null
          severity: string
          tenant_id: string
          title: string
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          confidence_score?: number | null
          created_at?: string
          description?: string
          evidence?: Json
          id?: string
          insight_type?: string
          metadata?: Json | null
          recommendation?: string | null
          severity?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
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
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_type: string
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
          ip_address?: string | null
          resource_id?: string | null
          resource_type: string
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
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string
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
        ]
      }
      blocked_websites: {
        Row: {
          blocked_by: string | null
          created_at: string | null
          domain_pattern: string
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
          key: string
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
          key: string
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
          key?: string
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
        ]
      }
      failed_jobs_dlq: {
        Row: {
          agent_id: string | null
          agent_name: string
          created_at: string | null
          error_count: number | null
          error_message: string | null
          first_failure_at: string | null
          id: string
          job_type: string
          last_failure_at: string | null
          max_retries: number | null
          metadata: Json | null
          next_retry_at: string | null
          original_job_id: string
          payload: Json | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          retry_count: number | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name: string
          created_at?: string | null
          error_count?: number | null
          error_message?: string | null
          first_failure_at?: string | null
          id?: string
          job_type: string
          last_failure_at?: string | null
          max_retries?: number | null
          metadata?: Json | null
          next_retry_at?: string | null
          original_job_id: string
          payload?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string
          created_at?: string | null
          error_count?: number | null
          error_message?: string | null
          first_failure_at?: string | null
          id?: string
          job_type?: string
          last_failure_at?: string | null
          max_retries?: number | null
          metadata?: Json | null
          next_retry_at?: string | null
          original_job_id?: string
          payload?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
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
        ]
      }
      generated_reports: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          commercial_priority: string | null
          commercial_summary: string | null
          contacted_at: string | null
          created_at: string | null
          expires_at: string | null
          file_path: string | null
          file_url: string | null
          follow_up_at: string | null
          id: string
          job_id: string | null
          next_action: string | null
          report_data: Json | null
          report_type: string
          risk_level: string | null
          risk_score: number | null
          sales_status: string | null
          statistics: Json | null
          status: string | null
          tenant_id: string
          title: string
          triggered_by: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          commercial_priority?: string | null
          commercial_summary?: string | null
          contacted_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          file_path?: string | null
          file_url?: string | null
          follow_up_at?: string | null
          id?: string
          job_id?: string | null
          next_action?: string | null
          report_data?: Json | null
          report_type: string
          risk_level?: string | null
          risk_score?: number | null
          sales_status?: string | null
          statistics?: Json | null
          status?: string | null
          tenant_id: string
          title: string
          triggered_by?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          commercial_priority?: string | null
          commercial_summary?: string | null
          contacted_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          file_path?: string | null
          file_url?: string | null
          follow_up_at?: string | null
          id?: string
          job_id?: string | null
          next_action?: string | null
          report_data?: Json | null
          report_type?: string
          risk_level?: string | null
          risk_score?: number | null
          sales_status?: string | null
          statistics?: Json | null
          status?: string | null
          tenant_id?: string
          title?: string
          triggered_by?: string | null
        }
        Relationships: [
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
      jobs: {
        Row: {
          agent_id: string | null
          agent_name: string
          approved: boolean
          completed_at: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          execution_time_seconds: number | null
          finished_at: string | null
          id: string
          is_recurring: boolean | null
          last_run_at: string | null
          next_run_at: string | null
          output: Json | null
          parent_job_id: string | null
          payload: Json | null
          priority: number | null
          recurrence_pattern: string | null
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
          delivered_at?: string | null
          error_message?: string | null
          execution_time_seconds?: number | null
          finished_at?: string | null
          id?: string
          is_recurring?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          output?: Json | null
          parent_job_id?: string | null
          payload?: Json | null
          priority?: number | null
          recurrence_pattern?: string | null
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
          delivered_at?: string | null
          error_message?: string | null
          execution_time_seconds?: number | null
          finished_at?: string | null
          id?: string
          is_recurring?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          output?: Json | null
          parent_job_id?: string | null
          payload?: Json | null
          priority?: number | null
          recurrence_pattern?: string | null
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
        ]
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
        ]
      }
      security_events: {
        Row: {
          agent_id: string | null
          created_at: string
          data: Json | null
          description: string | null
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
          created_at?: string
          data?: Json | null
          description?: string | null
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
          created_at?: string
          data?: Json | null
          description?: string | null
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
        ]
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
      subscription_plans: {
        Row: {
          billing_period: string | null
          created_at: string
          discount_pct: number | null
          id: string
          is_active: boolean | null
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
          id: string
          message: string
          resolved: boolean | null
          resolved_at: string | null
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
          id?: string
          message: string
          resolved?: boolean | null
          resolved_at?: string | null
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
          id?: string
          message?: string
          resolved?: boolean | null
          resolved_at?: string | null
          severity?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
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
        ]
      }
      tenant_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          device_quantity: number | null
          id: string
          plan_id: string
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          device_quantity?: number | null
          id?: string
          plan_id: string
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          device_quantity?: number | null
          id?: string
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
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          slug?: string
          updated_at?: string
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
        ]
      }
    }
    Views: {
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
          last_heartbeat: string | null
          os_type: string | null
          os_version: string | null
          seconds_since_heartbeat: number | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_name?: string | null
          agent_version?: string | null
          enrolled_at?: string | null
          health_status?: never
          hostname?: string | null
          id?: string | null
          last_heartbeat?: string | null
          os_type?: string | null
          os_version?: string | null
          seconds_since_heartbeat?: never
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          agent_name?: string | null
          agent_version?: string | null
          enrolled_at?: string | null
          health_status?: never
          hostname?: string | null
          id?: string | null
          last_heartbeat?: string | null
          os_type?: string | null
          os_version?: string | null
          seconds_since_heartbeat?: never
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
        ]
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
        ]
      }
      hmac_signatures: {
        Row: {
          agent_name: string | null
          id: string | null
          signature: string | null
          used_at: string | null
        }
        Relationships: []
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
          is_stuck: boolean | null
          last_error_at: string | null
          last_error_message: string | null
          last_heartbeat: string | null
          lifecycle_stage: string | null
          minutes_between_copy_and_install: number | null
          minutes_since_enrollment: number | null
          minutes_since_heartbeat: number | null
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
          is_stuck?: never
          last_error_at?: never
          last_error_message?: never
          last_heartbeat?: never
          lifecycle_stage?: never
          minutes_between_copy_and_install?: never
          minutes_since_enrollment?: never
          minutes_since_heartbeat?: never
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
          is_stuck?: never
          last_error_at?: never
          last_error_message?: never
          last_heartbeat?: never
          lifecycle_stage?: never
          minutes_between_copy_and_install?: never
          minutes_since_enrollment?: never
          minutes_since_heartbeat?: never
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
        ]
      }
      v_problematic_jobs: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          completed_at: string | null
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string | null
          issue_type: string | null
          minutes_since_creation: number | null
          started_at: string | null
          status: string | null
          tenant_id: string | null
          type: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          completed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string | null
          issue_type?: never
          minutes_since_creation?: never
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          type?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          completed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string | null
          issue_type?: never
          minutes_since_creation?: never
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
        ]
      }
      v_system_operations_summary: {
        Row: {
          active_alerts: number | null
          jobs_24h: number | null
          jobs_completed_24h: number | null
          jobs_failed_24h: number | null
          offline_agents: number | null
          online_agents: number | null
          quota_warnings: number | null
          stuck_jobs: number | null
          tenant_id: string | null
          tenant_name: string | null
          total_agents: number | null
        }
        Insert: {
          active_alerts?: never
          jobs_24h?: never
          jobs_completed_24h?: never
          jobs_failed_24h?: never
          offline_agents?: never
          online_agents?: never
          quota_warnings?: never
          stuck_jobs?: never
          tenant_id?: string | null
          tenant_name?: string | null
          total_agents?: never
        }
        Update: {
          active_alerts?: never
          jobs_24h?: never
          jobs_completed_24h?: never
          jobs_failed_24h?: never
          offline_agents?: never
          online_agents?: never
          quota_warnings?: never
          stuck_jobs?: never
          tenant_id?: string | null
          tenant_name?: string | null
          total_agents?: never
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
      calculate_next_run: {
        Args: { from_time?: string; pattern: string }
        Returns: string
      }
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
      check_action_rate_limit: {
        Args: { p_action_type: string; p_tenant_id: string }
        Returns: boolean
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
      cleanup_all_problematic_agents: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      cleanup_expired_keys: { Args: never; Returns: undefined }
      cleanup_old_data: { Args: never; Returns: undefined }
      cleanup_old_data_scheduled: { Args: never; Returns: Json }
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
      create_metrics_partition_if_needed: { Args: never; Returns: undefined }
      current_user_tenant_id: { Args: never; Returns: string }
      detect_blocked_access_attempts: {
        Args: never
        Returns: {
          inserted_count: number
        }[]
      }
      diagnose_agent: { Args: { p_agent_name: string }; Returns: Json }
      diagnose_agent_issues: {
        Args: { p_agent_name: string; p_tenant_id: string }
        Returns: {
          description: string
          details: Json
          issue_type: string
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
      get_agent_health_metrics: {
        Args: { p_tenant_id: string }
        Returns: {
          agent_name: string
          agent_version: string
          failed_jobs_24h: number
          failure_rate_pct: number
          health_status: string
          hostname: string
          last_heartbeat: string
          os_type: string
          os_version: string
          seconds_since_heartbeat: number
          total_jobs_24h: number
        }[]
      }
      get_enrollment_key_full: { Args: { p_key_id: string }; Returns: string }
      get_installation_health_status: {
        Args: { p_tenant_id: string }
        Returns: {
          failure_rate_pct: number
          status: string
          threshold: number
          total_attempts: number
        }[]
      }
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
          delivered_at: string | null
          error_message: string | null
          execution_time_seconds: number | null
          finished_at: string | null
          id: string
          is_recurring: boolean | null
          last_run_at: string | null
          next_run_at: string | null
          output: Json | null
          parent_job_id: string | null
          payload: Json | null
          priority: number | null
          recurrence_pattern: string | null
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_agent_token: { Args: { p_token: string }; Returns: string }
      hash_enrollment_key: { Args: { p_key: string }; Returns: string }
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
      log_sensitive_access: {
        Args: {
          p_action: string
          p_details?: Json
          p_resource_id: string
          p_resource_type: string
        }
        Returns: undefined
      }
      reset_monthly_scan_quota: { Args: never; Returns: undefined }
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
    }
    Enums: {
      app_role: "admin" | "operator" | "viewer" | "super_admin"
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
      app_role: ["admin", "operator", "viewer", "super_admin"],
    },
  },
} as const
