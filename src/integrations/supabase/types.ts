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
      active_sessions: {
        Row: {
          expires_at: string
          id: string
          ip_address: string
          is_super_admin: boolean | null
          last_activity_at: string | null
          metadata: Json | null
          session_token_hash: string | null
          started_at: string | null
          tenant_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          expires_at: string
          id?: string
          ip_address: string
          is_super_admin?: boolean | null
          last_activity_at?: string | null
          metadata?: Json | null
          session_token_hash?: string | null
          started_at?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          expires_at?: string
          id?: string
          ip_address?: string
          is_super_admin?: boolean | null
          last_activity_at?: string | null
          metadata?: Json | null
          session_token_hash?: string | null
          started_at?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "active_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "active_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      admin_ip_whitelist: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          ip_address: unknown
          is_active: boolean | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          ip_address: unknown
          is_active?: boolean | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_ip_whitelist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_ip_whitelist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "admin_ip_whitelist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "admin_ip_whitelist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_archive_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          agent_id: string
          created_at: string | null
          id: string
          notes: string | null
          reason: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          agent_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          reason: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          agent_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_behavioral_baseline: {
        Row: {
          agent_id: string
          baseline_data: Json
          baseline_period_end: string | null
          baseline_period_start: string | null
          baseline_type: string
          created_at: string | null
          id: string
          is_active: boolean | null
          last_updated: string | null
          mean_value: number | null
          std_deviation: number | null
          tenant_id: string
          threshold_multiplier: number | null
        }
        Insert: {
          agent_id: string
          baseline_data?: Json
          baseline_period_end?: string | null
          baseline_period_start?: string | null
          baseline_type: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_updated?: string | null
          mean_value?: number | null
          std_deviation?: number | null
          tenant_id: string
          threshold_multiplier?: number | null
        }
        Update: {
          agent_id?: string
          baseline_data?: Json
          baseline_period_end?: string | null
          baseline_period_start?: string | null
          baseline_type?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_updated?: string | null
          mean_value?: number | null
          std_deviation?: number | null
          tenant_id?: string
          threshold_multiplier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_behavioral_baseline_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_behavioral_baseline_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_behavioral_baseline_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_behavioral_baseline_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_behavioral_baseline_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_behavioral_baseline_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_behavioral_baseline_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_behavioral_baseline_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_behavioral_baseline_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_behavioral_baseline_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_behavioral_baseline_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_behavioral_baseline_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_behavioral_baseline_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_behavioral_baseline_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_behavioral_baseline_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_behavioral_baseline_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_builds: {
        Row: {
          agent_id: string
          build_completed_at: string | null
          build_duration_seconds: number | null
          build_log: Json | null
          build_started_at: string | null
          build_status: string
          cache_key: string | null
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
          script_hash: string | null
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
          cache_key?: string | null
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
          script_hash?: string | null
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
          cache_key?: string | null
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
          script_hash?: string | null
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_builds_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_builds_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_builds_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      agent_certificates: {
        Row: {
          agent_id: string
          cert_store: string
          collected_at: string | null
          created_at: string | null
          id: string
          is_self_signed: boolean | null
          issuer: string | null
          key_usage: string[] | null
          serial_number: string | null
          subject: string
          tenant_id: string
          thumbprint: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          agent_id: string
          cert_store?: string
          collected_at?: string | null
          created_at?: string | null
          id?: string
          is_self_signed?: boolean | null
          issuer?: string | null
          key_usage?: string[] | null
          serial_number?: string | null
          subject: string
          tenant_id: string
          thumbprint: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          agent_id?: string
          cert_store?: string
          collected_at?: string | null
          created_at?: string | null
          id?: string
          is_self_signed?: boolean | null
          issuer?: string | null
          key_usage?: string[] | null
          serial_number?: string | null
          subject?: string
          tenant_id?: string
          thumbprint?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_certificates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_certificates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_certificates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_certificates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_certificates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_certificates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_certificates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_certificates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_certificates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_certificates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_certificates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_certificates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_certificates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_certificates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_certificates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_certificates_tenant_id_fkey"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_disk_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_disk_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_disk_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_evidence_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_evidence_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_evidence_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
      agent_file_integrity: {
        Row: {
          actual_hash: string | null
          agent_id: string
          collected_at: string | null
          created_at: string | null
          expected_hash: string | null
          file_path: string
          file_size: number | null
          id: string
          integrity_status: string
          modified_at: string | null
          scan_type: string
          severity: string | null
          tenant_id: string
        }
        Insert: {
          actual_hash?: string | null
          agent_id: string
          collected_at?: string | null
          created_at?: string | null
          expected_hash?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          integrity_status?: string
          modified_at?: string | null
          scan_type?: string
          severity?: string | null
          tenant_id: string
        }
        Update: {
          actual_hash?: string | null
          agent_id?: string
          collected_at?: string | null
          created_at?: string | null
          expected_hash?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          integrity_status?: string
          modified_at?: string | null
          scan_type?: string
          severity?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_file_integrity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_file_integrity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_file_integrity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_file_integrity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_file_integrity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_file_integrity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_file_integrity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_file_integrity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_file_integrity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_file_integrity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_file_integrity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_file_integrity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_file_integrity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_file_integrity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_file_integrity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_file_integrity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
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
          {
            foreignKeyName: "agent_group_policies_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "v_enforcement_compliance"
            referencedColumns: ["policy_id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      agent_hmac_format_cache: {
        Row: {
          agent_id: string
          body_format: string
          hit_count: number | null
          key_encoding: string
          last_verified_at: string | null
          separator: string
        }
        Insert: {
          agent_id: string
          body_format?: string
          hit_count?: number | null
          key_encoding?: string
          last_verified_at?: string | null
          separator?: string
        }
        Update: {
          agent_id?: string
          body_format?: string
          hit_count?: number | null
          key_encoding?: string
          last_verified_at?: string | null
          separator?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_hmac_format_cache_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_hmac_format_cache_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_hmac_format_cache_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_hmac_format_cache_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_hmac_format_cache_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_hmac_format_cache_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_hmac_format_cache_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_hmac_format_cache_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_hmac_format_cache_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_hmac_format_cache_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_hmac_format_cache_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_hmac_format_cache_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_light_mode_configs: {
        Row: {
          activated_at: string | null
          active_media_processes: Json
          agent_id: string
          collection_interval_seconds: number
          compress_payloads: boolean
          cpu_threshold_percent: number
          created_at: string
          duration_minutes: number
          expires_at: string | null
          id: string
          is_active: boolean
          media_processes: Json
          network_threshold_mbps: number
          reason: string
          reduced_interval_seconds: number
          skip_network_collection: boolean
          skip_process_collection: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          active_media_processes?: Json
          agent_id: string
          collection_interval_seconds?: number
          compress_payloads?: boolean
          cpu_threshold_percent?: number
          created_at?: string
          duration_minutes?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          media_processes?: Json
          network_threshold_mbps?: number
          reason?: string
          reduced_interval_seconds?: number
          skip_network_collection?: boolean
          skip_process_collection?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          active_media_processes?: Json
          agent_id?: string
          collection_interval_seconds?: number
          compress_payloads?: boolean
          cpu_threshold_percent?: number
          created_at?: string
          duration_minutes?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          media_processes?: Json
          network_threshold_mbps?: number
          reason?: string
          reduced_interval_seconds?: number
          skip_network_collection?: boolean
          skip_process_collection?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_light_mode_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_light_mode_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_light_mode_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_light_mode_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_light_mode_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_light_mode_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_light_mode_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_light_mode_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_light_mode_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_light_mode_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_light_mode_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_light_mode_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_light_mode_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_light_mode_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_light_mode_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_light_mode_configs_tenant_id_fkey"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_network_info_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_info_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_network_info_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      agent_network_metrics: {
        Row: {
          agent_id: string
          bytes_received: number | null
          bytes_sent: number | null
          collected_at: string | null
          connections_active: number | null
          connections_listening: number | null
          created_at: string | null
          errors_received: number | null
          errors_sent: number | null
          id: string
          interface_name: string
          packets_received: number | null
          packets_sent: number | null
          tenant_id: string
        }
        Insert: {
          agent_id: string
          bytes_received?: number | null
          bytes_sent?: number | null
          collected_at?: string | null
          connections_active?: number | null
          connections_listening?: number | null
          created_at?: string | null
          errors_received?: number | null
          errors_sent?: number | null
          id?: string
          interface_name: string
          packets_received?: number | null
          packets_sent?: number | null
          tenant_id: string
        }
        Update: {
          agent_id?: string
          bytes_received?: number | null
          bytes_sent?: number | null
          collected_at?: string | null
          connections_active?: number | null
          connections_listening?: number | null
          created_at?: string | null
          errors_received?: number | null
          errors_sent?: number | null
          id?: string
          interface_name?: string
          packets_received?: number | null
          packets_sent?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_network_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_network_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_network_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_network_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_network_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_network_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_network_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_network_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_network_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_processes: {
        Row: {
          agent_id: string
          collected_at: string
          created_at: string
          id: string
          new_processes: Json | null
          processes: Json
          services: Json
          services_running: number | null
          services_stopped: number | null
          suspicious_processes: Json | null
          tenant_id: string
          total_processes: number | null
          total_services: number | null
        }
        Insert: {
          agent_id: string
          collected_at?: string
          created_at?: string
          id?: string
          new_processes?: Json | null
          processes?: Json
          services?: Json
          services_running?: number | null
          services_stopped?: number | null
          suspicious_processes?: Json | null
          tenant_id: string
          total_processes?: number | null
          total_services?: number | null
        }
        Update: {
          agent_id?: string
          collected_at?: string
          created_at?: string
          id?: string
          new_processes?: Json | null
          processes?: Json
          services?: Json
          services_running?: number | null
          services_stopped?: number | null
          suspicious_processes?: Json | null
          tenant_id?: string
          total_processes?: number | null
          total_services?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_processes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_processes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_processes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_processes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_processes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_processes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_processes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_processes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_processes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_processes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_processes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_processes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_processes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_processes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_processes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_processes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_quarantine: {
        Row: {
          agent_id: string
          created_at: string | null
          duration_hours: number
          id: string
          quarantine_end: string | null
          quarantine_reason: string
          quarantined_by: string
          released_at: string | null
          released_by: string | null
          restrict_file_access: boolean | null
          restrict_network: boolean | null
          restrict_processes: boolean | null
          severity: string
          status: string
          tenant_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          duration_hours?: number
          id?: string
          quarantine_end?: string | null
          quarantine_reason: string
          quarantined_by?: string
          released_at?: string | null
          released_by?: string | null
          restrict_file_access?: boolean | null
          restrict_network?: boolean | null
          restrict_processes?: boolean | null
          severity?: string
          status?: string
          tenant_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          duration_hours?: number
          id?: string
          quarantine_end?: string | null
          quarantine_reason?: string
          quarantined_by?: string
          released_at?: string | null
          released_by?: string | null
          restrict_file_access?: boolean | null
          restrict_network?: boolean | null
          restrict_processes?: boolean | null
          severity?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_quarantine_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_quarantine_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_quarantine_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_quarantine_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_quarantine_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_quarantine_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_quarantine_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_quarantine_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_quarantine_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_quarantine_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_quarantine_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_quarantine_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_quarantine_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_quarantine_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_quarantine_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_quarantine_tenant_id_fkey"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_recovery_authorizations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_recovery_authorizations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_recovery_authorizations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_rollback_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_rollback_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_rollback_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_safe_mode_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_safe_mode_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_safe_mode_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_signing_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_signing_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_signing_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
      agent_tag_assignments: {
        Row: {
          agent_id: string
          assigned_by: string | null
          created_at: string
          id: string
          tag_id: string
        }
        Insert: {
          agent_id: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          tag_id: string
        }
        Update: {
          agent_id?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tag_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tag_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_tag_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tag_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tag_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tag_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_tag_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_tag_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_tag_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tag_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_tag_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tag_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "agent_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tags: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_tokens: {
        Row: {
          agent_id: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          last_rotated_at: string | null
          last_used_at: string | null
          rotation_policy_days: number | null
          rotation_required_at: string | null
          token_hash: string
          token_prefix: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_rotated_at?: string | null
          last_used_at?: string | null
          rotation_policy_days?: number | null
          rotation_required_at?: string | null
          token_hash: string
          token_prefix: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_rotated_at?: string | null
          last_used_at?: string | null
          rotation_policy_days?: number | null
          rotation_required_at?: string | null
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_update_decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_update_decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_update_decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
      agent_updates: {
        Row: {
          agent_id: string
          apply_completed_at: string | null
          apply_started_at: string | null
          created_at: string
          download_completed_at: string | null
          download_started_at: string | null
          error_message: string | null
          id: string
          package_id: string
          rollback_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          apply_completed_at?: string | null
          apply_started_at?: string | null
          created_at?: string
          download_completed_at?: string | null
          download_started_at?: string | null
          error_message?: string | null
          id?: string
          package_id: string
          rollback_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          apply_completed_at?: string | null
          apply_started_at?: string | null
          created_at?: string
          download_completed_at?: string | null
          download_started_at?: string | null
          error_message?: string | null
          id?: string
          package_id?: string
          rollback_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_updates_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "update_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_usb_devices: {
        Row: {
          agent_id: string
          block_reason: string | null
          collected_at: string | null
          created_at: string | null
          device_id: string
          device_name: string | null
          device_type: string | null
          first_seen: string | null
          id: string
          is_blocked: boolean | null
          last_seen: string | null
          product_id: string | null
          serial_number: string | null
          tenant_id: string
          vendor_id: string | null
        }
        Insert: {
          agent_id: string
          block_reason?: string | null
          collected_at?: string | null
          created_at?: string | null
          device_id: string
          device_name?: string | null
          device_type?: string | null
          first_seen?: string | null
          id?: string
          is_blocked?: boolean | null
          last_seen?: string | null
          product_id?: string | null
          serial_number?: string | null
          tenant_id: string
          vendor_id?: string | null
        }
        Update: {
          agent_id?: string
          block_reason?: string | null
          collected_at?: string | null
          created_at?: string | null
          device_id?: string
          device_name?: string | null
          device_type?: string | null
          first_seen?: string | null
          id?: string
          is_blocked?: boolean | null
          last_seen?: string | null
          product_id?: string | null
          serial_number?: string | null
          tenant_id?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_usb_devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_usb_devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_usb_devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_usb_devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_usb_devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_usb_devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_usb_devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_usb_devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_usb_devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_usb_devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_usb_devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_usb_devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_usb_devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_usb_devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_usb_devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_usb_devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
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
      agent_vulnerabilities: {
        Row: {
          affected_software: string | null
          agent_id: string
          created_at: string | null
          cve_id: string
          cvss_score: number | null
          detected_at: string | null
          id: string
          remediation_completed_at: string | null
          remediation_started_at: string | null
          remediation_status: string
          severity: string
          tenant_id: string
        }
        Insert: {
          affected_software?: string | null
          agent_id: string
          created_at?: string | null
          cve_id: string
          cvss_score?: number | null
          detected_at?: string | null
          id?: string
          remediation_completed_at?: string | null
          remediation_started_at?: string | null
          remediation_status?: string
          severity?: string
          tenant_id: string
        }
        Update: {
          affected_software?: string | null
          agent_id?: string
          created_at?: string | null
          cve_id?: string
          cvss_score?: number | null
          detected_at?: string | null
          id?: string
          remediation_completed_at?: string | null
          remediation_started_at?: string | null
          remediation_status?: string
          severity?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_vulnerabilities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerabilities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_vulnerabilities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerabilities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerabilities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerabilities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_vulnerabilities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_vulnerabilities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_vulnerabilities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerabilities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_vulnerabilities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerabilities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerabilities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerabilities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_vulnerabilities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_vulnerabilities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      agent_vulnerability_scans: {
        Row: {
          agent_id: string
          auto_remediated: boolean | null
          created_at: string | null
          cve_id: string
          cvss_score: number | null
          detected_at: string | null
          fixed_version: string | null
          id: string
          installed_version: string | null
          remediated_at: string | null
          remediation_action: string | null
          remediation_status: string | null
          severity: string
          software_name: string
          tenant_id: string
        }
        Insert: {
          agent_id: string
          auto_remediated?: boolean | null
          created_at?: string | null
          cve_id: string
          cvss_score?: number | null
          detected_at?: string | null
          fixed_version?: string | null
          id?: string
          installed_version?: string | null
          remediated_at?: string | null
          remediation_action?: string | null
          remediation_status?: string | null
          severity?: string
          software_name: string
          tenant_id: string
        }
        Update: {
          agent_id?: string
          auto_remediated?: boolean | null
          created_at?: string | null
          cve_id?: string
          cvss_score?: number | null
          detected_at?: string | null
          fixed_version?: string | null
          id?: string
          installed_version?: string | null
          remediated_at?: string | null
          remediation_action?: string | null
          remediation_status?: string | null
          severity?: string
          software_name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_vulnerability_scans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerability_scans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_vulnerability_scans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerability_scans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerability_scans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerability_scans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_vulnerability_scans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_vulnerability_scans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_vulnerability_scans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerability_scans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_vulnerability_scans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerability_scans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerability_scans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_vulnerability_scans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_vulnerability_scans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_vulnerability_scans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_web_activity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_web_activity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_web_activity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          force_update_delivered_count: number | null
          force_update_first_delivered_at: string | null
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
          requires_revalidation: boolean | null
          result_key_fingerprint: string | null
          result_key_registered_at: string | null
          result_public_key: string | null
          revalidation_reason: string | null
          revalidation_required_at: string | null
          safe_mode_entered_at: string | null
          safe_mode_reason: string | null
          scheduling_paused: boolean
          scheduling_paused_reason: string | null
          signature_mode: string | null
          status: string
          tenant_id: string
          throttle_reason: string | null
          throttled_at: string | null
          web_activity_consent_at: string | null
          web_activity_consent_by: string | null
          web_activity_consent_enabled: boolean | null
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
          force_update_delivered_count?: number | null
          force_update_first_delivered_at?: string | null
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
          requires_revalidation?: boolean | null
          result_key_fingerprint?: string | null
          result_key_registered_at?: string | null
          result_public_key?: string | null
          revalidation_reason?: string | null
          revalidation_required_at?: string | null
          safe_mode_entered_at?: string | null
          safe_mode_reason?: string | null
          scheduling_paused?: boolean
          scheduling_paused_reason?: string | null
          signature_mode?: string | null
          status?: string
          tenant_id: string
          throttle_reason?: string | null
          throttled_at?: string | null
          web_activity_consent_at?: string | null
          web_activity_consent_by?: string | null
          web_activity_consent_enabled?: boolean | null
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
          force_update_delivered_count?: number | null
          force_update_first_delivered_at?: string | null
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
          requires_revalidation?: boolean | null
          result_key_fingerprint?: string | null
          result_key_registered_at?: string | null
          result_public_key?: string | null
          revalidation_reason?: string | null
          revalidation_required_at?: string | null
          safe_mode_entered_at?: string | null
          safe_mode_reason?: string | null
          scheduling_paused?: boolean
          scheduling_paused_reason?: string | null
          signature_mode?: string | null
          status?: string
          tenant_id?: string
          throttle_reason?: string | null
          throttled_at?: string | null
          web_activity_consent_at?: string | null
          web_activity_consent_by?: string | null
          web_activity_consent_enabled?: boolean | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agents_groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agents_groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      ai_action_logs: {
        Row: {
          action_data: Json
          action_type: string
          created_at: string
          error_message: string | null
          id: string
          processed_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          action_data?: Json
          action_type: string
          created_at?: string
          error_message?: string | null
          id?: string
          processed_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          action_data?: Json
          action_type?: string
          created_at?: string
          error_message?: string | null
          id?: string
          processed_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_action_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_action_logs_tenant_id_fkey"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          approval_request_id: string | null
          approved_at: string | null
          approved_by: string | null
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
          explanation: string | null
          human_reviewed: boolean | null
          id: string
          insight_id: string | null
          reasoning_summary: string | null
          result: Json | null
          reversible: boolean | null
          review_decision: string | null
          review_justification: string | null
          reviewed_at: string | null
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
          approval_request_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
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
          explanation?: string | null
          human_reviewed?: boolean | null
          id?: string
          insight_id?: string | null
          reasoning_summary?: string | null
          result?: Json | null
          reversible?: boolean | null
          review_decision?: string | null
          review_justification?: string | null
          reviewed_at?: string | null
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
          approval_request_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
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
          explanation?: string | null
          human_reviewed?: boolean | null
          id?: string
          insight_id?: string | null
          reasoning_summary?: string | null
          result?: Json | null
          reversible?: boolean | null
          review_decision?: string | null
          review_justification?: string | null
          reviewed_at?: string | null
          risk_level?: string | null
          rollback_reason?: string | null
          rollback_status?: string | null
          shadow_validation?: Json | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_actions_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_actions_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "v_pending_critical_approvals"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      ai_anomalies: {
        Row: {
          anomaly_type: string
          context: Json
          created_at: string | null
          detected_at: string | null
          function_name: string
          id: string
          resolution: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string
          tenant_id: string
        }
        Insert: {
          anomaly_type: string
          context?: Json
          created_at?: string | null
          detected_at?: string | null
          function_name: string
          id?: string
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity: string
          tenant_id: string
        }
        Update: {
          anomaly_type?: string
          context?: Json
          created_at?: string | null
          detected_at?: string | null
          function_name?: string
          id?: string
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_anomalies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_anomalies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_anomalies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_anomalies_tenant_id_fkey"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      ai_feedback: {
        Row: {
          action_id: string | null
          comment: string | null
          context: Json | null
          created_at: string
          feedback_type: string
          id: string
          insight_id: string | null
          rating: number | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          action_id?: string | null
          comment?: string | null
          context?: Json | null
          created_at?: string
          feedback_type: string
          id?: string
          insight_id?: string | null
          rating?: number | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          action_id?: string | null
          comment?: string | null
          context?: Json | null
          created_at?: string
          feedback_type?: string
          id?: string
          insight_id?: string | null
          rating?: number | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "ai_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "ai_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_feedback_tenant_id_fkey"
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
          cost_usd: number | null
          created_at: string | null
          error: string | null
          function_name: string
          id: string
          latency_ms: number
          model: string
          provider: string | null
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
          cost_usd?: number | null
          created_at?: string | null
          error?: string | null
          function_name: string
          id?: string
          latency_ms: number
          model: string
          provider?: string | null
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
          cost_usd?: number | null
          created_at?: string | null
          error?: string | null
          function_name?: string
          id?: string
          latency_ms?: number
          model?: string
          provider?: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          dismissal_reason: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          evidence: Json
          evidence_pack: Json | null
          final_outcome: string | null
          id: string
          insight_type: string
          metadata: Json | null
          reasoning_summary: string | null
          recommendation: string | null
          recommended_actions: Json | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          resolution_method: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_by_decision_event: string | null
          severity: string
          status: string
          tenant_id: string
          title: string
          updated_at: string | null
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
          dismissal_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          evidence?: Json
          evidence_pack?: Json | null
          final_outcome?: string | null
          id?: string
          insight_type: string
          metadata?: Json | null
          reasoning_summary?: string | null
          recommendation?: string | null
          recommended_actions?: Json | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          resolution_method?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_decision_event?: string | null
          severity: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string | null
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
          dismissal_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          evidence?: Json
          evidence_pack?: Json | null
          final_outcome?: string | null
          id?: string
          insight_type?: string
          metadata?: Json | null
          reasoning_summary?: string | null
          recommendation?: string | null
          recommended_actions?: Json | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          resolution_method?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_decision_event?: string | null
          severity?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string | null
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      ai_response_cache: {
        Row: {
          cost_usd: number | null
          created_at: string
          expires_at: string
          function_name: string | null
          hit_count: number
          id: string
          last_hit_at: string | null
          latency_ms: number | null
          model: string
          prompt_hash: string
          provider: string
          response_content: string
          system_prompt_hash: string | null
          task_category: string
          tenant_id: string | null
          tokens_used: number | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          expires_at?: string
          function_name?: string | null
          hit_count?: number
          id?: string
          last_hit_at?: string | null
          latency_ms?: number | null
          model: string
          prompt_hash: string
          provider: string
          response_content: string
          system_prompt_hash?: string | null
          task_category?: string
          tenant_id?: string | null
          tokens_used?: number | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          expires_at?: string
          function_name?: string | null
          hit_count?: number
          id?: string
          last_hit_at?: string | null
          latency_ms?: number | null
          model?: string
          prompt_hash?: string
          provider?: string
          response_content?: string
          system_prompt_hash?: string | null
          task_category?: string
          tenant_id?: string | null
          tokens_used?: number | null
        }
        Relationships: []
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "anomaly_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "anomaly_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "antivirus_status_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "antivirus_status_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "antivirus_status_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "approval_requests_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "approval_requests_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          {
            foreignKeyName: "approvals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "v_pending_critical_approvals"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      auto_remediation_actions: {
        Row: {
          action_type: string
          agent_id: string | null
          agent_name: string | null
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          executed_at: string | null
          id: string
          requires_approval: boolean | null
          result: Json | null
          status: string | null
          tenant_id: string
          trigger_details: Json | null
          trigger_source: string
        }
        Insert: {
          action_type: string
          agent_id?: string | null
          agent_name?: string | null
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          requires_approval?: boolean | null
          result?: Json | null
          status?: string | null
          tenant_id: string
          trigger_details?: Json | null
          trigger_source: string
        }
        Update: {
          action_type?: string
          agent_id?: string | null
          agent_name?: string | null
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          requires_approval?: boolean | null
          result?: Json | null
          status?: string | null
          tenant_id?: string
          trigger_details?: Json | null
          trigger_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_remediation_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_remediation_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "auto_remediation_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_remediation_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_remediation_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_remediation_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "auto_remediation_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "auto_remediation_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "auto_remediation_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_remediation_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "auto_remediation_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_remediation_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_remediation_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_remediation_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "auto_remediation_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "auto_remediation_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      automation_executions: {
        Row: {
          action_result: Json | null
          action_taken: string
          agent_id: string | null
          created_at: string
          error_message: string | null
          executed_at: string | null
          id: string
          rule_id: string
          status: string
          tenant_id: string
          trigger_data: Json
          triggered_at: string
        }
        Insert: {
          action_result?: Json | null
          action_taken: string
          agent_id?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          rule_id: string
          status?: string
          tenant_id: string
          trigger_data: Json
          triggered_at?: string
        }
        Update: {
          action_result?: Json | null
          action_taken?: string
          agent_id?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          rule_id?: string
          status?: string
          tenant_id?: string
          trigger_data?: Json
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "automation_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "automation_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "automation_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "automation_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "automation_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "automation_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "automation_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          action_config: Json
          action_type: string
          cooldown_minutes: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          priority: number
          target_ids: string[] | null
          target_scope: string
          tenant_id: string
          trigger_conditions: Json
          trigger_count: number
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_config: Json
          action_type: string
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          priority?: number
          target_ids?: string[] | null
          target_scope?: string
          tenant_id: string
          trigger_conditions: Json
          trigger_count?: number
          trigger_type: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          priority?: number
          target_ids?: string[] | null
          target_scope?: string
          tenant_id?: string
          trigger_conditions?: Json
          trigger_count?: number
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "automation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "automation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "blocked_access_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_access_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "blocked_access_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            foreignKeyName: "blocked_websites_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      compliance_snapshots: {
        Row: {
          calculated_at: string
          category_scores: Json | null
          created_at: string
          grade: string
          id: string
          overall_score: number
          tenant_id: string
        }
        Insert: {
          calculated_at?: string
          category_scores?: Json | null
          created_at?: string
          grade: string
          id?: string
          overall_score: number
          tenant_id: string
        }
        Update: {
          calculated_at?: string
          category_scores?: Json | null
          created_at?: string
          grade?: string
          id?: string
          overall_score?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "compliance_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "compliance_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      cron_health: {
        Row: {
          avg_duration_ms: number | null
          consecutive_failures: number
          created_at: string
          cron_name: string
          id: string
          last_duration_ms: number | null
          last_error: string | null
          last_failure_at: string | null
          last_success_at: string | null
          metadata: Json | null
          total_failures: number
          total_runs: number
          updated_at: string
        }
        Insert: {
          avg_duration_ms?: number | null
          consecutive_failures?: number
          created_at?: string
          cron_name: string
          id?: string
          last_duration_ms?: number | null
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          metadata?: Json | null
          total_failures?: number
          total_runs?: number
          updated_at?: string
        }
        Update: {
          avg_duration_ms?: number | null
          consecutive_failures?: number
          created_at?: string
          cron_name?: string
          id?: string
          last_duration_ms?: number | null
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          metadata?: Json | null
          total_failures?: number
          total_runs?: number
          updated_at?: string
        }
        Relationships: []
      }
      cron_health_checks: {
        Row: {
          consecutive_failures: number | null
          cron_name: string
          id: string
          last_error: string | null
          last_failure_at: string | null
          last_result: Json | null
          last_success_at: string | null
          updated_at: string | null
        }
        Insert: {
          consecutive_failures?: number | null
          cron_name: string
          id?: string
          last_error?: string | null
          last_failure_at?: string | null
          last_result?: Json | null
          last_success_at?: string | null
          updated_at?: string | null
        }
        Update: {
          consecutive_failures?: number | null
          cron_name?: string
          id?: string
          last_error?: string | null
          last_failure_at?: string | null
          last_result?: Json | null
          last_success_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          actor_id: string | null
          actor_type: string | null
          agent_id: string | null
          agent_name: string | null
          created_at: string
          decision_source: string
          decision_type: string
          evidence: Json
          human_reviewed: boolean | null
          id: string
          justification: string | null
          rule_code: string
          tenant_id: string
        }
        Insert: {
          action: string
          actions_executed?: Json | null
          actor_id?: string | null
          actor_type?: string | null
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string
          decision_source?: string
          decision_type?: string
          evidence?: Json
          human_reviewed?: boolean | null
          id?: string
          justification?: string | null
          rule_code: string
          tenant_id: string
        }
        Update: {
          action?: string
          actions_executed?: Json | null
          actor_id?: string | null
          actor_type?: string | null
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string
          decision_source?: string
          decision_type?: string
          evidence?: Json
          human_reviewed?: boolean | null
          id?: string
          justification?: string | null
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "decision_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "decision_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      domain_events: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          created_at: string
          event_type: string
          event_version: number
          id: string
          occurred_on: string
          payload: Json
          tenant_id: string | null
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          created_at?: string
          event_type: string
          event_version?: number
          id?: string
          occurred_on?: string
          payload?: Json
          tenant_id?: string | null
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          created_at?: string
          event_type?: string
          event_version?: number
          id?: string
          occurred_on?: string
          payload?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "domain_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "domain_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          auto_generated: boolean | null
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
          auto_generated?: boolean | null
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
          auto_generated?: boolean | null
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          decision_event_id: string | null
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
          resolution_source: string | null
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
          decision_event_id?: string | null
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
          resolution_source?: string | null
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
          decision_event_id?: string | null
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
          resolution_source?: string | null
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_decision_event_id_fkey"
            columns: ["decision_event_id"]
            isOneToOne: false
            referencedRelation: "decision_events"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      failure_fingerprints: {
        Row: {
          created_at: string
          distinct_agents: number
          distinct_tenants: number
          failure_class: string
          fingerprint_hash: string
          fingerprint_version: number
          first_seen_at: string
          id: string
          is_active: boolean
          is_trending: boolean
          last_seen_at: string
          normalized_signature: Json
          severity_hint: string
          slo_dirty: boolean | null
          source_type: string
          total_occurrences: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          distinct_agents?: number
          distinct_tenants?: number
          failure_class: string
          fingerprint_hash: string
          fingerprint_version?: number
          first_seen_at?: string
          id?: string
          is_active?: boolean
          is_trending?: boolean
          last_seen_at?: string
          normalized_signature: Json
          severity_hint: string
          slo_dirty?: boolean | null
          source_type: string
          total_occurrences?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          distinct_agents?: number
          distinct_tenants?: number
          failure_class?: string
          fingerprint_hash?: string
          fingerprint_version?: number
          first_seen_at?: string
          id?: string
          is_active?: boolean
          is_trending?: boolean
          last_seen_at?: string
          normalized_signature?: Json
          severity_hint?: string
          slo_dirty?: boolean | null
          source_type?: string
          total_occurrences?: number
          updated_at?: string
        }
        Relationships: []
      }
      failure_occurrences: {
        Row: {
          agent_id: string | null
          created_at: string
          error_excerpt: string | null
          fingerprint_id: string
          id: string
          occurred_at: string
          source_id: string
          source_type: string
          tenant_id: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          error_excerpt?: string | null
          fingerprint_id: string
          id?: string
          occurred_at?: string
          source_id: string
          source_type: string
          tenant_id: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          error_excerpt?: string | null
          fingerprint_id?: string
          id?: string
          occurred_at?: string
          source_id?: string
          source_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "failure_occurrences_fingerprint_id_fkey"
            columns: ["fingerprint_id"]
            isOneToOne: false
            referencedRelation: "failure_fingerprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failure_occurrences_fingerprint_id_fkey"
            columns: ["fingerprint_id"]
            isOneToOne: false
            referencedRelation: "v_incident_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failure_occurrences_fingerprint_id_fkey"
            columns: ["fingerprint_id"]
            isOneToOne: false
            referencedRelation: "v_incident_groups_with_slo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failure_occurrences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failure_occurrences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "failure_occurrences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "failure_occurrences_tenant_id_fkey"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "forensic_snapshots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forensic_snapshots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "forensic_snapshots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "generated_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "generated_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      governance_adrs: {
        Row: {
          adr_code: string
          approved_at: string | null
          approved_by: string | null
          consequences: string | null
          created_at: string | null
          decision: string
          id: string
          rationale: string | null
          status: string | null
          tenant_id: string | null
          title: string
        }
        Insert: {
          adr_code: string
          approved_at?: string | null
          approved_by?: string | null
          consequences?: string | null
          created_at?: string | null
          decision: string
          id?: string
          rationale?: string | null
          status?: string | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          adr_code?: string
          approved_at?: string | null
          approved_by?: string | null
          consequences?: string | null
          created_at?: string | null
          decision?: string
          id?: string
          rationale?: string | null
          status?: string | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "governance_adrs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_adrs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "governance_adrs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "governance_adrs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      governance_reports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          executive_summary: string
          generated_at: string
          generated_by: string
          human_decisions: Json | null
          id: string
          key_metrics: Json
          period_end: string
          period_start: string
          report_type: string
          risk_debt_summary: Json | null
          sla_performance: Json | null
          tenant_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          executive_summary: string
          generated_at?: string
          generated_by?: string
          human_decisions?: Json | null
          id?: string
          key_metrics?: Json
          period_end: string
          period_start: string
          report_type: string
          risk_debt_summary?: Json | null
          sla_performance?: Json | null
          tenant_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          executive_summary?: string
          generated_at?: string
          generated_by?: string
          human_decisions?: Json | null
          id?: string
          key_metrics?: Json
          period_end?: string
          period_start?: string
          report_type?: string
          risk_debt_summary?: Json | null
          sla_performance?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "governance_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "governance_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "governance_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      hmac_signatures: {
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
      hmac_signatures_2026_02: {
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
      hmac_signatures_2026_03: {
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
      hmac_signatures_2026_04: {
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
      hmac_signatures_2026_05: {
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
      hmac_signatures_2026_06: {
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
      hmac_signatures_2026_07: {
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
      incident_slo_state: {
        Row: {
          budget_consumed: number
          budget_remaining: number
          burn_rate_1h: number
          burn_rate_24h: number
          burn_rate_6h: number
          created_at: string
          error_budget: number
          expected_rate_1h: number
          fingerprint_id: string
          id: string
          last_evaluated_at: string
          last_task_id: string | null
          occurrences_1h: number
          occurrences_24h: number
          occurrences_6h: number
          slo_target: number
          status: string
          updated_at: string
        }
        Insert: {
          budget_consumed?: number
          budget_remaining?: number
          burn_rate_1h?: number
          burn_rate_24h?: number
          burn_rate_6h?: number
          created_at?: string
          error_budget?: number
          expected_rate_1h?: number
          fingerprint_id: string
          id?: string
          last_evaluated_at?: string
          last_task_id?: string | null
          occurrences_1h?: number
          occurrences_24h?: number
          occurrences_6h?: number
          slo_target?: number
          status?: string
          updated_at?: string
        }
        Update: {
          budget_consumed?: number
          budget_remaining?: number
          burn_rate_1h?: number
          burn_rate_24h?: number
          burn_rate_6h?: number
          created_at?: string
          error_budget?: number
          expected_rate_1h?: number
          fingerprint_id?: string
          id?: string
          last_evaluated_at?: string
          last_task_id?: string | null
          occurrences_1h?: number
          occurrences_24h?: number
          occurrences_6h?: number
          slo_target?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_slo_state_fingerprint_id_fkey"
            columns: ["fingerprint_id"]
            isOneToOne: true
            referencedRelation: "failure_fingerprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_slo_state_fingerprint_id_fkey"
            columns: ["fingerprint_id"]
            isOneToOne: true
            referencedRelation: "v_incident_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_slo_state_fingerprint_id_fkey"
            columns: ["fingerprint_id"]
            isOneToOne: true
            referencedRelation: "v_incident_groups_with_slo"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "incident_timelines_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_timelines_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "incident_timelines_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "installation_analytics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_analytics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "installation_analytics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      itsm_integrations: {
        Row: {
          auth_type: string
          auto_create_on_alert: boolean
          auto_create_severity_threshold: string | null
          base_url: string
          created_at: string
          created_by: string | null
          credentials_encrypted: Json
          default_issue_type: string | null
          default_priority: string | null
          display_name: string
          field_mappings: Json | null
          id: string
          is_active: boolean
          project_key: string | null
          provider: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auth_type?: string
          auto_create_on_alert?: boolean
          auto_create_severity_threshold?: string | null
          base_url: string
          created_at?: string
          created_by?: string | null
          credentials_encrypted?: Json
          default_issue_type?: string | null
          default_priority?: string | null
          display_name?: string
          field_mappings?: Json | null
          id?: string
          is_active?: boolean
          project_key?: string | null
          provider: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auth_type?: string
          auto_create_on_alert?: boolean
          auto_create_severity_threshold?: string | null
          base_url?: string
          created_at?: string
          created_by?: string | null
          credentials_encrypted?: Json
          default_issue_type?: string | null
          default_priority?: string | null
          display_name?: string
          field_mappings?: Json | null
          id?: string
          is_active?: boolean
          project_key?: string | null
          provider?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itsm_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itsm_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "itsm_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "itsm_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      itsm_tickets: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          created_at: string
          created_by: string | null
          description: string | null
          external_status: string | null
          external_ticket_id: string
          external_ticket_key: string | null
          external_ticket_url: string | null
          id: string
          integration_id: string
          priority: string | null
          provider: string
          source_id: string | null
          source_type: string
          status: string | null
          summary: string
          synced_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          external_status?: string | null
          external_ticket_id: string
          external_ticket_key?: string | null
          external_ticket_url?: string | null
          id?: string
          integration_id: string
          priority?: string | null
          provider: string
          source_id?: string | null
          source_type: string
          status?: string | null
          summary: string
          synced_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          external_status?: string | null
          external_ticket_id?: string
          external_ticket_key?: string | null
          external_ticket_url?: string | null
          id?: string
          integration_id?: string
          priority?: string | null
          provider?: string
          source_id?: string | null
          source_type?: string
          status?: string | null
          summary?: string
          synced_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itsm_tickets_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "itsm_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itsm_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itsm_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "itsm_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "itsm_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      job_executions: {
        Row: {
          agent_id: string
          agent_name: string
          agent_version: string
          archived_at: string | null
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
          archived_at?: string | null
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
          archived_at?: string | null
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "job_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "job_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      job_slo_state: {
        Row: {
          burn_rate: number
          created_at: string
          error_jobs: number
          error_rate: number
          evaluated_at: string
          id: string
          last_task_id: string | null
          tenant_id: string
          time_window: string
          total_jobs: number
          updated_at: string
        }
        Insert: {
          burn_rate?: number
          created_at?: string
          error_jobs?: number
          error_rate?: number
          evaluated_at?: string
          id?: string
          last_task_id?: string | null
          tenant_id: string
          time_window: string
          total_jobs?: number
          updated_at?: string
        }
        Update: {
          burn_rate?: number
          created_at?: string
          error_jobs?: number
          error_rate?: number
          evaluated_at?: string
          id?: string
          last_task_id?: string | null
          tenant_id?: string
          time_window?: string
          total_jobs?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_slo_state_last_task_id_fkey"
            columns: ["last_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_slo_state_last_task_id_fkey"
            columns: ["last_task_id"]
            isOneToOne: false
            referencedRelation: "v_active_risk_debt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_slo_state_last_task_id_fkey"
            columns: ["last_task_id"]
            isOneToOne: false
            referencedRelation: "v_critical_unassigned_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_slo_state_last_task_id_fkey"
            columns: ["last_task_id"]
            isOneToOne: false
            referencedRelation: "v_risk_debt_active"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_slo_state_last_task_id_fkey"
            columns: ["last_task_id"]
            isOneToOne: false
            referencedRelation: "v_tasks_requiring_closure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_slo_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_slo_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "job_slo_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "job_slo_state_tenant_id_fkey"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "network_anomalies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_anomalies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "network_anomalies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      notification_deliveries: {
        Row: {
          alert_id: string | null
          channel: string
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          message: string
          recipient: string
          status: string
          subject: string | null
          tenant_id: string | null
        }
        Insert: {
          alert_id?: string | null
          channel: string
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message: string
          recipient: string
          status?: string
          subject?: string | null
          tenant_id?: string | null
        }
        Update: {
          alert_id?: string | null
          channel?: string
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message?: string
          recipient?: string
          status?: string
          subject?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "system_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "notification_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "notification_deliveries_tenant_id_fkey"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      persistent_failure_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          agent_id: string | null
          alert_type: string
          created_at: string | null
          failure_count: number
          first_failure_at: string
          id: string
          is_acknowledged: boolean | null
          last_alert_sent_at: string | null
          last_failure_at: string
          metadata: Json | null
          resolution_notes: string | null
          tenant_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          agent_id?: string | null
          alert_type: string
          created_at?: string | null
          failure_count?: number
          first_failure_at?: string
          id?: string
          is_acknowledged?: boolean | null
          last_alert_sent_at?: string | null
          last_failure_at?: string
          metadata?: Json | null
          resolution_notes?: string | null
          tenant_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          agent_id?: string | null
          alert_type?: string
          created_at?: string | null
          failure_count?: number
          first_failure_at?: string
          id?: string
          is_acknowledged?: boolean | null
          last_alert_sent_at?: string | null
          last_failure_at?: string
          metadata?: Json | null
          resolution_notes?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "persistent_failure_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persistent_failure_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "persistent_failure_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persistent_failure_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persistent_failure_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persistent_failure_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "persistent_failure_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "persistent_failure_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "persistent_failure_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persistent_failure_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "persistent_failure_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persistent_failure_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persistent_failure_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persistent_failure_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "persistent_failure_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "persistent_failure_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      platform_configs: {
        Row: {
          agent_binary_url: string | null
          config_overrides: Json | null
          created_at: string
          default_install_path: string | null
          id: string
          install_command_template: string | null
          is_enabled: boolean
          platform: string
          service_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agent_binary_url?: string | null
          config_overrides?: Json | null
          created_at?: string
          default_install_path?: string | null
          id?: string
          install_command_template?: string | null
          is_enabled?: boolean
          platform: string
          service_name?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agent_binary_url?: string | null
          config_overrides?: Json | null
          created_at?: string
          default_install_path?: string | null
          id?: string
          install_command_template?: string | null
          is_enabled?: boolean
          platform?: string
          service_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "platform_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "platform_configs_tenant_id_fkey"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "playbook_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "playbook_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "poe_chain_breaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poe_chain_breaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "poe_chain_breaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          {
            foreignKeyName: "policy_assignments_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "v_enforcement_compliance"
            referencedColumns: ["policy_id"]
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "policy_enforcement_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            foreignKeyName: "policy_enforcement_logs_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "v_enforcement_compliance"
            referencedColumns: ["policy_id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          {
            foreignKeyName: "policy_rules_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "v_enforcement_compliance"
            referencedColumns: ["policy_id"]
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
          username: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
          username?: string | null
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
          binary_criteria: Json | null
          created_at: string
          criteria_count_true: number | null
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
          binary_criteria?: Json | null
          created_at?: string
          criteria_count_true?: number | null
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
          binary_criteria?: Json | null
          created_at?: string
          criteria_count_true?: number | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "risk_decision_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_decision_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "risk_decision_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      rollback_test_results: {
        Row: {
          agent_id: string | null
          completed_at: string | null
          created_at: string
          dry_run: boolean
          duration_ms: number | null
          error_message: string | null
          from_version: string | null
          id: string
          initiated_by: string | null
          steps_executed: Json | null
          steps_total: number | null
          tenant_id: string
          test_status: string
          test_type: string
          to_version: string | null
        }
        Insert: {
          agent_id?: string | null
          completed_at?: string | null
          created_at?: string
          dry_run?: boolean
          duration_ms?: number | null
          error_message?: string | null
          from_version?: string | null
          id?: string
          initiated_by?: string | null
          steps_executed?: Json | null
          steps_total?: number | null
          tenant_id: string
          test_status?: string
          test_type?: string
          to_version?: string | null
        }
        Update: {
          agent_id?: string | null
          completed_at?: string | null
          created_at?: string
          dry_run?: boolean
          duration_ms?: number | null
          error_message?: string | null
          from_version?: string | null
          id?: string
          initiated_by?: string | null
          steps_executed?: Json | null
          steps_total?: number | null
          tenant_id?: string
          test_status?: string
          test_type?: string
          to_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rollback_test_results_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rollback_test_results_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "rollback_test_results_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rollback_test_results_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rollback_test_results_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rollback_test_results_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "rollback_test_results_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "rollback_test_results_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "rollback_test_results_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rollback_test_results_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "rollback_test_results_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rollback_test_results_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rollback_test_results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rollback_test_results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "rollback_test_results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "rollback_test_results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      runbooks: {
        Row: {
          anomaly_type: string
          created_at: string | null
          id: string
          owner: string | null
          severity: string | null
          sla_minutes: number | null
          steps: Json
          title: string
          updated_at: string | null
        }
        Insert: {
          anomaly_type: string
          created_at?: string | null
          id?: string
          owner?: string | null
          severity?: string | null
          sla_minutes?: number | null
          steps?: Json
          title: string
          updated_at?: string | null
        }
        Update: {
          anomaly_type?: string
          created_at?: string | null
          id?: string
          owner?: string | null
          severity?: string | null
          sla_minutes?: number | null
          steps?: Json
          title?: string
          updated_at?: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      scheduled_job_heartbeat: {
        Row: {
          created_at: string
          expected_interval: unknown
          job_key: string
          last_error: string | null
          last_seen_at: string
          missed_count: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_interval?: unknown
          job_key: string
          last_error?: string | null
          last_seen_at?: string
          missed_count?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_interval?: unknown
          job_key?: string
          last_error?: string | null
          last_seen_at?: string
          missed_count?: number | null
          updated_at?: string
        }
        Relationships: []
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          job_key: string | null
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
          job_key?: string | null
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
          job_key?: string | null
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "scheduled_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "scheduled_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      score_governance_log: {
        Row: {
          audit_id: string | null
          created_at: string | null
          delta: number | null
          event_type: string
          id: string
          justification: string | null
          metadata: Json | null
          new_value: number | null
          previous_value: number | null
          rule_applied: string
          tenant_id: string
        }
        Insert: {
          audit_id?: string | null
          created_at?: string | null
          delta?: number | null
          event_type: string
          id?: string
          justification?: string | null
          metadata?: Json | null
          new_value?: number | null
          previous_value?: number | null
          rule_applied: string
          tenant_id: string
        }
        Update: {
          audit_id?: string | null
          created_at?: string | null
          delta?: number | null
          event_type?: string
          id?: string
          justification?: string | null
          metadata?: Json | null
          new_value?: number | null
          previous_value?: number | null
          rule_applied?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_governance_log_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "system_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_governance_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_governance_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "score_governance_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "score_governance_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      security_definer_allowlist: {
        Row: {
          adr_reference: string | null
          approved_at: string | null
          approved_by: string | null
          rationale: string
          view_name: string
        }
        Insert: {
          adr_reference?: string | null
          approved_at?: string | null
          approved_by?: string | null
          rationale: string
          view_name: string
        }
        Update: {
          adr_reference?: string | null
          approved_at?: string | null
          approved_by?: string | null
          rationale?: string
          view_name?: string
        }
        Relationships: []
      }
      security_events: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          agent_id: string | null
          agent_name: string | null
          created_at: string
          data: Json | null
          description: string | null
          event_type: string | null
          id: string
          policy_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          severity: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string
          data?: Json | null
          description?: string | null
          event_type?: string | null
          id?: string
          policy_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          severity: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string
          data?: Json | null
          description?: string | null
          event_type?: string | null
          id?: string
          policy_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "security_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "security_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            foreignKeyName: "security_events_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "v_enforcement_compliance"
            referencedColumns: ["policy_id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          approved_at: string | null
          approved_by: string | null
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
          approved_at?: string | null
          approved_by?: string | null
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
          approved_at?: string | null
          approved_by?: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          {
            foreignKeyName: "security_policy_rules_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "v_enforcement_compliance"
            referencedColumns: ["policy_id"]
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "security_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "security_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      segregation_rules: {
        Row: {
          action_type: string
          created_at: string | null
          created_by: string | null
          exclude_requester: boolean
          id: string
          is_active: boolean | null
          min_approvers: number
          require_different_departments: boolean | null
          required_roles: string[]
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          created_by?: string | null
          exclude_requester?: boolean
          id?: string
          is_active?: boolean | null
          min_approvers?: number
          require_different_departments?: boolean | null
          required_roles?: string[]
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          created_by?: string | null
          exclude_requester?: boolean
          id?: string
          is_active?: boolean | null
          min_approvers?: number
          require_different_departments?: boolean | null
          required_roles?: string[]
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "segregation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segregation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "segregation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "segregation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      siem_export_configs: {
        Row: {
          api_key_hash: string | null
          batch_size: number | null
          created_at: string | null
          export_interval_minutes: number | null
          format: string
          id: string
          include_event_types: string[] | null
          is_active: boolean | null
          last_export_at: string | null
          tenant_id: string
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          api_key_hash?: string | null
          batch_size?: number | null
          created_at?: string | null
          export_interval_minutes?: number | null
          format?: string
          id?: string
          include_event_types?: string[] | null
          is_active?: boolean | null
          last_export_at?: string | null
          tenant_id: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_key_hash?: string | null
          batch_size?: number | null
          created_at?: string | null
          export_interval_minutes?: number | null
          format?: string
          id?: string
          include_event_types?: string[] | null
          is_active?: boolean | null
          last_export_at?: string | null
          tenant_id?: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "siem_export_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siem_export_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "siem_export_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "siem_export_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      siem_export_history: {
        Row: {
          config_id: string
          error_message: string | null
          events_exported: number | null
          exported_at: string | null
          format: string
          id: string
          status: string | null
          tenant_id: string
        }
        Insert: {
          config_id: string
          error_message?: string | null
          events_exported?: number | null
          exported_at?: string | null
          format: string
          id?: string
          status?: string | null
          tenant_id: string
        }
        Update: {
          config_id?: string
          error_message?: string | null
          events_exported?: number | null
          exported_at?: string | null
          format?: string
          id?: string
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "siem_export_history_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "siem_export_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siem_export_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siem_export_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "siem_export_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "siem_export_history_tenant_id_fkey"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      soar_executions: {
        Row: {
          actions_taken: Json | null
          agent_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          playbook_execution_id: string | null
          playbook_id: string | null
          result: Json | null
          started_at: string | null
          status: string
          tenant_id: string
          trigger_type: string
        }
        Insert: {
          actions_taken?: Json | null
          agent_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          playbook_execution_id?: string | null
          playbook_id?: string | null
          result?: Json | null
          started_at?: string | null
          status?: string
          tenant_id: string
          trigger_type: string
        }
        Update: {
          actions_taken?: Json | null
          agent_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          playbook_execution_id?: string | null
          playbook_id?: string | null
          result?: Json | null
          started_at?: string | null
          status?: string
          tenant_id?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "soar_executions_playbook_execution_id_fkey"
            columns: ["playbook_execution_id"]
            isOneToOne: false
            referencedRelation: "playbook_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soar_executions_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "soar_playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soar_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soar_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "soar_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "soar_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      soar_playbooks: {
        Row: {
          actions: Json
          auto_approve_critical: boolean
          auto_execute: boolean
          cooldown_minutes: number | null
          created_at: string
          created_by: string | null
          description: string | null
          execution_count: number | null
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          requires_approval: boolean
          tenant_id: string
          trigger_conditions: Json | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          auto_approve_critical?: boolean
          auto_execute?: boolean
          cooldown_minutes?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          execution_count?: number | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          requires_approval?: boolean
          tenant_id: string
          trigger_conditions?: Json | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          auto_approve_critical?: boolean
          auto_execute?: boolean
          cooldown_minutes?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          execution_count?: number | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          requires_approval?: boolean
          tenant_id?: string
          trigger_conditions?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "soar_playbooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soar_playbooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "soar_playbooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "soar_playbooks_tenant_id_fkey"
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
          verification_notes: string | null
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
          verification_notes?: string | null
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
          verification_notes?: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "software_inventory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "software_inventory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "software_inventory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          decision_event_id: string | null
          details: Json | null
          email_sent: boolean | null
          email_sent_at: string | null
          human_reviewed: boolean | null
          id: string
          message: string
          requires_human_decision: boolean | null
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
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
          decision_event_id?: string | null
          details?: Json | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          human_reviewed?: boolean | null
          id?: string
          message: string
          requires_human_decision?: boolean | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
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
          decision_event_id?: string | null
          details?: Json | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          human_reviewed?: boolean | null
          id?: string
          message?: string
          requires_human_decision?: boolean | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "system_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "system_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_decision_event_id_fkey"
            columns: ["decision_event_id"]
            isOneToOne: false
            referencedRelation: "decision_events"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          deterministic_base_score: number | null
          evidence_basis: Json | null
          executive_summary: string | null
          falsification_criteria: Json | null
          final_sentence: string | null
          guardrail_applied: boolean | null
          guardrail_reason: string | null
          id: string
          market_score: number | null
          metrics_snapshot: Json | null
          official_score: number | null
          overall_score: number
          prompt_hash: string | null
          raw_score: number | null
          recommendation: string | null
          red_risk_factor: number | null
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
          deterministic_base_score?: number | null
          evidence_basis?: Json | null
          executive_summary?: string | null
          falsification_criteria?: Json | null
          final_sentence?: string | null
          guardrail_applied?: boolean | null
          guardrail_reason?: string | null
          id?: string
          market_score?: number | null
          metrics_snapshot?: Json | null
          official_score?: number | null
          overall_score: number
          prompt_hash?: string | null
          raw_score?: number | null
          recommendation?: string | null
          red_risk_factor?: number | null
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
          deterministic_base_score?: number | null
          evidence_basis?: Json | null
          executive_summary?: string | null
          falsification_criteria?: Json | null
          final_sentence?: string | null
          guardrail_applied?: boolean | null
          guardrail_reason?: string | null
          id?: string
          market_score?: number | null
          metrics_snapshot?: Json | null
          official_score?: number | null
          overall_score?: number
          prompt_hash?: string | null
          raw_score?: number | null
          recommendation?: string | null
          red_risk_factor?: number | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      system_global_state: {
        Row: {
          acknowledged_by: string[] | null
          expires_at: string | null
          id: string
          mode: string
          reason: string
          triggered_at: string
          triggered_by: string
        }
        Insert: {
          acknowledged_by?: string[] | null
          expires_at?: string | null
          id?: string
          mode: string
          reason: string
          triggered_at?: string
          triggered_by: string
        }
        Update: {
          acknowledged_by?: string[] | null
          expires_at?: string | null
          id?: string
          mode?: string
          reason?: string
          triggered_at?: string
          triggered_by?: string
        }
        Relationships: []
      }
      system_health_checks: {
        Row: {
          check_name: string
          check_query: string
          created_at: string | null
          expected_result: boolean | null
          id: string
          is_critical: boolean | null
          last_error: string | null
          last_result: boolean | null
          last_run_at: string | null
        }
        Insert: {
          check_name: string
          check_query: string
          created_at?: string | null
          expected_result?: boolean | null
          id?: string
          is_critical?: boolean | null
          last_error?: string | null
          last_result?: boolean | null
          last_run_at?: string | null
        }
        Update: {
          check_name?: string
          check_query?: string
          created_at?: string | null
          expected_result?: boolean | null
          id?: string
          is_critical?: boolean | null
          last_error?: string | null
          last_result?: boolean | null
          last_run_at?: string | null
        }
        Relationships: []
      }
      system_kill_switch: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          created_at: string | null
          enabled: boolean
          mode: string | null
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
          mode?: string | null
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
          mode?: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      system_state: {
        Row: {
          changed_by: string | null
          id: number
          mode: Database["public"]["Enums"]["system_operational_mode"]
          reason: string | null
          updated_at: string | null
        }
        Insert: {
          changed_by?: string | null
          id?: number
          mode?: Database["public"]["Enums"]["system_operational_mode"]
          reason?: string | null
          updated_at?: string | null
        }
        Update: {
          changed_by?: string | null
          id?: number
          mode?: Database["public"]["Enums"]["system_operational_mode"]
          reason?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      task_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          id: string
          metadata: Json | null
          task_id: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          created_at?: string
          id?: string
          metadata?: Json | null
          task_id: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          task_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_active_risk_debt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_critical_unassigned_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_risk_debt_active"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_tasks_requiring_closure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "task_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "task_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      task_evidence: {
        Row: {
          content: Json
          content_hash: string
          created_at: string
          created_by: string | null
          evidence_type: string
          id: string
          storage_ref: string | null
          task_id: string
          tenant_id: string
          title: string
        }
        Insert: {
          content: Json
          content_hash: string
          created_at?: string
          created_by?: string | null
          evidence_type: string
          id?: string
          storage_ref?: string | null
          task_id: string
          tenant_id: string
          title: string
        }
        Update: {
          content?: Json
          content_hash?: string
          created_at?: string
          created_by?: string | null
          evidence_type?: string
          id?: string
          storage_ref?: string | null
          task_id?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_evidence_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_evidence_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_active_risk_debt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_evidence_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_critical_unassigned_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_evidence_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_risk_debt_active"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_evidence_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_tasks_requiring_closure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_evidence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_evidence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "task_evidence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "task_evidence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          auto_generated: boolean
          closed_at: string | null
          closed_by: string | null
          closure_evidence: Json | null
          closure_reason: string | null
          created_at: string
          description: string | null
          due_at: string | null
          fingerprint_id: string | null
          id: string
          metadata: Json | null
          playbook_id: string | null
          requires_human_review: boolean
          risk_accepted_at: string | null
          risk_accepted_by: string | null
          risk_expiry_at: string | null
          risk_justification: string | null
          semantic_fingerprint: string | null
          severity: string
          sla_breached_at: string | null
          source_id: string | null
          source_type: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          auto_generated?: boolean
          closed_at?: string | null
          closed_by?: string | null
          closure_evidence?: Json | null
          closure_reason?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          fingerprint_id?: string | null
          id?: string
          metadata?: Json | null
          playbook_id?: string | null
          requires_human_review?: boolean
          risk_accepted_at?: string | null
          risk_accepted_by?: string | null
          risk_expiry_at?: string | null
          risk_justification?: string | null
          semantic_fingerprint?: string | null
          severity: string
          sla_breached_at?: string | null
          source_id?: string | null
          source_type: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          auto_generated?: boolean
          closed_at?: string | null
          closed_by?: string | null
          closure_evidence?: Json | null
          closure_reason?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          fingerprint_id?: string | null
          id?: string
          metadata?: Json | null
          playbook_id?: string | null
          requires_human_review?: boolean
          risk_accepted_at?: string | null
          risk_accepted_by?: string | null
          risk_expiry_at?: string | null
          risk_justification?: string | null
          semantic_fingerprint?: string | null
          severity?: string
          sla_breached_at?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_fingerprint_id_fkey"
            columns: ["fingerprint_id"]
            isOneToOne: false
            referencedRelation: "failure_fingerprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_fingerprint_id_fkey"
            columns: ["fingerprint_id"]
            isOneToOne: false
            referencedRelation: "v_incident_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_fingerprint_id_fkey"
            columns: ["fingerprint_id"]
            isOneToOne: false
            referencedRelation: "v_incident_groups_with_slo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      tenant_branding: {
        Row: {
          accent_color: string | null
          company_address: string | null
          company_cnpj: string | null
          company_email: string | null
          company_name: string | null
          company_phone: string | null
          company_website: string | null
          created_at: string | null
          custom_sections: Json | null
          id: string
          logo_url: string | null
          primary_color: string | null
          report_footer_text: string | null
          report_header_text: string | null
          secondary_color: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          accent_color?: string | null
          company_address?: string | null
          company_cnpj?: string | null
          company_email?: string | null
          company_name?: string | null
          company_phone?: string | null
          company_website?: string | null
          created_at?: string | null
          custom_sections?: Json | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          report_footer_text?: string | null
          report_header_text?: string | null
          secondary_color?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          accent_color?: string | null
          company_address?: string | null
          company_cnpj?: string | null
          company_email?: string | null
          company_name?: string | null
          company_phone?: string | null
          company_website?: string | null
          created_at?: string | null
          custom_sections?: Json | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          report_footer_text?: string | null
          report_header_text?: string | null
          secondary_color?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "tenant_risk_scores_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_risk_scores_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "tenant_risk_scores_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          force_human_review_critical: boolean
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
          force_human_review_critical?: boolean
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
          force_human_review_critical?: boolean
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      tenant_suspension_config: {
        Row: {
          cleanup_batch_size: number
          deletion_days: number
          exempt_tenant_ids: string[] | null
          id: string
          is_enabled: boolean
          suspension_days: number
          updated_at: string
          updated_by: string | null
          warning_days: number
        }
        Insert: {
          cleanup_batch_size?: number
          deletion_days?: number
          exempt_tenant_ids?: string[] | null
          id?: string
          is_enabled?: boolean
          suspension_days?: number
          updated_at?: string
          updated_by?: string | null
          warning_days?: number
        }
        Update: {
          cleanup_batch_size?: number
          deletion_days?: number
          exempt_tenant_ids?: string[] | null
          id?: string
          is_enabled?: boolean
          suspension_days?: number
          updated_at?: string
          updated_by?: string | null
          warning_days?: number
        }
        Relationships: []
      }
      tenant_suspension_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          new_status: string | null
          performed_by: string | null
          previous_status: string | null
          reason: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          performed_by?: string | null
          previous_status?: string | null
          reason?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          performed_by?: string | null
          previous_status?: string | null
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_suspension_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_suspension_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_suspension_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_suspension_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          auto_action_mode: string | null
          break_glass_enabled: boolean | null
          break_glass_last_used_at: string | null
          break_glass_last_used_by: string | null
          break_glass_user_id: string | null
          city: string | null
          cnpj: string | null
          company_name: string | null
          contact_email: string | null
          created_at: string
          deletion_scheduled_at: string | null
          id: string
          last_activity_at: string | null
          mfa_policy: Json | null
          name: string
          owner_user_id: string
          phone: string | null
          session_timeout_minutes: Json | null
          setup_completed: boolean | null
          slug: string
          state: string | null
          suspended_at: string | null
          suspension_reason: string | null
          suspension_status: string
          suspension_warning_sent_at: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          auto_action_mode?: string | null
          break_glass_enabled?: boolean | null
          break_glass_last_used_at?: string | null
          break_glass_last_used_by?: string | null
          break_glass_user_id?: string | null
          city?: string | null
          cnpj?: string | null
          company_name?: string | null
          contact_email?: string | null
          created_at?: string
          deletion_scheduled_at?: string | null
          id?: string
          last_activity_at?: string | null
          mfa_policy?: Json | null
          name: string
          owner_user_id: string
          phone?: string | null
          session_timeout_minutes?: Json | null
          setup_completed?: boolean | null
          slug: string
          state?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          suspension_status?: string
          suspension_warning_sent_at?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          auto_action_mode?: string | null
          break_glass_enabled?: boolean | null
          break_glass_last_used_at?: string | null
          break_glass_last_used_by?: string | null
          break_glass_user_id?: string | null
          city?: string | null
          cnpj?: string | null
          company_name?: string | null
          contact_email?: string | null
          created_at?: string
          deletion_scheduled_at?: string | null
          id?: string
          last_activity_at?: string | null
          mfa_policy?: Json | null
          name?: string
          owner_user_id?: string
          phone?: string | null
          session_timeout_minutes?: Json | null
          setup_completed?: boolean | null
          slug?: string
          state?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          suspension_status?: string
          suspension_warning_sent_at?: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      token_validation_failures: {
        Row: {
          client_ip: string | null
          created_at: string | null
          failure_reason: string
          id: string
          token_hash_prefix: string
          user_agent: string | null
        }
        Insert: {
          client_ip?: string | null
          created_at?: string | null
          failure_reason: string
          id?: string
          token_hash_prefix: string
          user_agent?: string | null
        }
        Update: {
          client_ip?: string | null
          created_at?: string | null
          failure_reason?: string
          id?: string
          token_hash_prefix?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      update_packages: {
        Row: {
          channel: string
          checksum: string
          created_at: string
          id: string
          is_active: boolean
          max_version: string | null
          min_version: string | null
          platform: string
          release_notes: string
          script_content: string
          signature_base64: string | null
          signed_at: string | null
          signed_by: string | null
          size: number
          version: string
        }
        Insert: {
          channel?: string
          checksum: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_version?: string | null
          min_version?: string | null
          platform?: string
          release_notes?: string
          script_content: string
          signature_base64?: string | null
          signed_at?: string | null
          signed_by?: string | null
          size: number
          version: string
        }
        Update: {
          channel?: string
          checksum?: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_version?: string | null
          min_version?: string | null
          platform?: string
          release_notes?: string
          script_content?: string
          signature_base64?: string | null
          signed_at?: string | null
          signed_by?: string | null
          size?: number
          version?: string
        }
        Relationships: []
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "vuln_findings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vuln_findings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "vuln_findings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          requires_revalidation: boolean | null
          result_key_fingerprint: string | null
          result_key_registered_at: string | null
          result_public_key: string | null
          revalidation_reason: string | null
          revalidation_required_at: string | null
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
          requires_revalidation?: boolean | null
          result_key_fingerprint?: string | null
          result_key_registered_at?: string | null
          result_public_key?: string | null
          revalidation_reason?: string | null
          revalidation_required_at?: string | null
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
          requires_revalidation?: boolean | null
          result_key_fingerprint?: string | null
          result_key_registered_at?: string | null
          result_public_key?: string | null
          revalidation_reason?: string | null
          revalidation_required_at?: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          version: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          platform?: string | null
          release_notes?: string | null
          version?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          platform?: string | null
          release_notes?: string | null
          version?: string | null
        }
        Relationships: []
      }
      agent_snapshots: {
        Row: {
          agent_id: string | null
          agent_mode: string | null
          agent_name: string | null
          agent_version: string | null
          created_at: string | null
          display_name: string | null
          hostname: string | null
          last_heartbeat: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_mode?: string | null
          agent_name?: string | null
          agent_version?: string | null
          created_at?: string | null
          display_name?: string | null
          hostname?: string | null
          last_heartbeat?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_mode?: string | null
          agent_name?: string | null
          agent_version?: string | null
          created_at?: string | null
          display_name?: string | null
          hostname?: string | null
          last_heartbeat?: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      agents_public: {
        Row: {
          agent_mode: string | null
          agent_name: string | null
          agent_state: string | null
          agent_state_changed_at: string | null
          agent_state_reason: string | null
          agent_version: string | null
          display_name: string | null
          enrolled_at: string | null
          hostname: string | null
          id: string | null
          last_heartbeat: string | null
          os_type: string | null
          os_version: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_mode?: string | null
          agent_name?: string | null
          agent_state?: string | null
          agent_state_changed_at?: string | null
          agent_state_reason?: string | null
          agent_version?: string | null
          display_name?: string | null
          enrolled_at?: string | null
          hostname?: string | null
          id?: string | null
          last_heartbeat?: string | null
          os_type?: string | null
          os_version?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          agent_mode?: string | null
          agent_name?: string | null
          agent_state?: string | null
          agent_state_changed_at?: string | null
          agent_state_reason?: string | null
          agent_version?: string | null
          display_name?: string | null
          enrolled_at?: string | null
          hostname?: string | null
          id?: string | null
          last_heartbeat?: string | null
          os_type?: string | null
          os_version?: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          poll_interval_seconds: number | null
          requires_revalidation: boolean | null
          result_key_fingerprint: string | null
          result_key_registered_at: string | null
          result_public_key: string | null
          revalidation_reason: string | null
          revalidation_required_at: string | null
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
          poll_interval_seconds?: number | null
          requires_revalidation?: boolean | null
          result_key_fingerprint?: string | null
          result_key_registered_at?: string | null
          result_public_key?: string | null
          revalidation_reason?: string | null
          revalidation_required_at?: string | null
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
          poll_interval_seconds?: number | null
          requires_revalidation?: boolean | null
          result_key_fingerprint?: string | null
          result_key_registered_at?: string | null
          result_public_key?: string | null
          revalidation_reason?: string | null
          revalidation_required_at?: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          id: string | null
          resource_id: string | null
          resource_type: string | null
          success: boolean | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          success?: boolean | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          success?: boolean | null
          tenant_id?: string | null
          user_id?: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "failed_jobs_dlq_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "enrollment_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      hmac_agent_secrets: {
        Row: {
          agent_id: string | null
          hmac_secret: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_id?: string | null
          hmac_secret?: string | null
          tenant_id?: string | null
        }
        Update: {
          agent_id?: string | null
          hmac_secret?: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          active_agents: number | null
          critical_agents: number | null
          inactive_agents: number | null
          tenant_id: string | null
          total_agents: number | null
          warning_agents: number | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          avg_install_time: number | null
          failed: number | null
          platform: string | null
          successful: number | null
          tenant_id: string | null
          total_installations: number | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      invites_safe: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string | null
          expires_at: string | null
          id: string | null
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          status?: string | null
          tenant_id?: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      job_failure_health: {
        Row: {
          failed_jobs: number | null
          failure_rate_pct: number | null
          hour: string | null
          tenant_id: string | null
          total_jobs: number | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      job_integrity_violations: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          created_at: string | null
          id: string | null
          payload_hash: string | null
          status: string | null
          tenant_id: string | null
          type: string | null
          violation_type: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string | null
          id?: string | null
          payload_hash?: string | null
          status?: string | null
          tenant_id?: string | null
          type?: string | null
          violation_type?: never
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string | null
          id?: string | null
          payload_hash?: string | null
          status?: string | null
          tenant_id?: string | null
          type?: string | null
          violation_type?: never
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      jobs_normalized: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          completed_at: string | null
          created_at: string | null
          delivered_at: string | null
          duration_seconds: number | null
          error_message: string | null
          execution_time_seconds: number | null
          id: string | null
          is_v3: boolean | null
          normalized_status: string | null
          output: Json | null
          payload_hash: string | null
          priority: number | null
          queue_time_seconds: number | null
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
          duration_seconds?: never
          error_message?: string | null
          execution_time_seconds?: number | null
          id?: string | null
          is_v3?: never
          normalized_status?: string | null
          output?: Json | null
          payload_hash?: string | null
          priority?: number | null
          queue_time_seconds?: never
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
          duration_seconds?: never
          error_message?: string | null
          execution_time_seconds?: number | null
          id?: string | null
          is_v3?: never
          normalized_status?: string | null
          output?: Json | null
          payload_hash?: string | null
          priority?: number | null
          queue_time_seconds?: never
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      profiles_public: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string | null
          updated_at: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
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
          created_at: string | null
          description: string | null
          id: string | null
          item_status: string | null
          item_type: string | null
          priority: string | null
          source: string | null
          tenant_id: string | null
        }
        Relationships: []
      }
      v_active_risk_debt: {
        Row: {
          days_until_expiry: number | null
          description: string | null
          id: string | null
          risk_accepted_at: string | null
          risk_accepted_by: string | null
          risk_expiry_at: string | null
          risk_justification: string | null
          risk_status: string | null
          severity: string | null
          tenant_id: string | null
          title: string | null
        }
        Insert: {
          days_until_expiry?: never
          description?: string | null
          id?: string | null
          risk_accepted_at?: string | null
          risk_accepted_by?: string | null
          risk_expiry_at?: string | null
          risk_justification?: string | null
          risk_status?: never
          severity?: string | null
          tenant_id?: string | null
          title?: string | null
        }
        Update: {
          days_until_expiry?: never
          description?: string | null
          id?: string | null
          risk_accepted_at?: string | null
          risk_accepted_by?: string | null
          risk_expiry_at?: string | null
          risk_justification?: string | null
          risk_status?: never
          severity?: string | null
          tenant_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_agent_archive_reason_tree: {
        Row: {
          actor_id: string | null
          actor_type: string | null
          agent_id: string | null
          agent_name: string | null
          archived_at: string | null
          archived_reason: string | null
          created_at: string | null
          event_id: string | null
          notes: string | null
          reason: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "hmac_agent_secrets"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_execution_health"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_archive_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_agent_execution_health: {
        Row: {
          agent_id: string | null
          agent_mode: string | null
          agent_name: string | null
          agent_version: string | null
          checked_at: string | null
          enrolled_at: string | null
          health_description: string | null
          health_status: string | null
          last_execution_at: string | null
          last_heartbeat: string | null
          minutes_since_execution: number | null
          minutes_since_heartbeat: number | null
          pending_jobs: number | null
          seconds_since_heartbeat: number | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_agent_health_by_node: {
        Row: {
          healthy: number | null
          hostname: string | null
          isolated: number | null
          tenant_id: string | null
          total_agents: number | null
          unhealthy: number | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          degraded: number | null
          isolated: number | null
          offline: number | null
          online: number | null
          safe_mode: number | null
          tenant_id: string | null
          total_agents: number | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          agent_installed_at: string | null
          agent_name: string | null
          agent_state: string | null
          archived_at: string | null
          archived_reason: string | null
          command_copied_at: string | null
          display_name: string | null
          enrolled_at: string | null
          id: string | null
          is_stuck: boolean | null
          last_heartbeat: string | null
          lifecycle_status: string | null
          minutes_between_copy_and_install: number | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_installed_at?: string | null
          agent_name?: string | null
          agent_state?: string | null
          archived_at?: string | null
          archived_reason?: string | null
          command_copied_at?: string | null
          display_name?: string | null
          enrolled_at?: string | null
          id?: string | null
          is_stuck?: never
          last_heartbeat?: string | null
          lifecycle_status?: never
          minutes_between_copy_and_install?: never
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_installed_at?: string | null
          agent_name?: string | null
          agent_state?: string | null
          archived_at?: string | null
          archived_reason?: string | null
          command_copied_at?: string | null
          display_name?: string | null
          enrolled_at?: string | null
          id?: string | null
          is_stuck?: never
          last_heartbeat?: string | null
          lifecycle_status?: never
          minutes_between_copy_and_install?: never
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_agent_state: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          agent_state: string | null
          agent_state_reason: string | null
          agent_version: string | null
          canonical_state: string | null
          display_name: string | null
          heartbeat_lag_minutes: number | null
          heartbeat_lag_seconds: number | null
          hostname: string | null
          id: string | null
          is_isolated: boolean | null
          is_throttled: boolean | null
          last_heartbeat: string | null
          safe_mode_entered_at: string | null
          safe_mode_reason: string | null
          snapshot_at: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          agent_state?: string | null
          agent_state_reason?: string | null
          agent_version?: string | null
          canonical_state?: never
          display_name?: string | null
          heartbeat_lag_minutes?: never
          heartbeat_lag_seconds?: never
          hostname?: string | null
          id?: string | null
          is_isolated?: boolean | null
          is_throttled?: boolean | null
          last_heartbeat?: string | null
          safe_mode_entered_at?: string | null
          safe_mode_reason?: string | null
          snapshot_at?: never
          tenant_id?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          agent_state?: string | null
          agent_state_reason?: string | null
          agent_version?: string | null
          canonical_state?: never
          display_name?: string | null
          heartbeat_lag_minutes?: never
          heartbeat_lag_seconds?: never
          hostname?: string | null
          id?: string | null
          is_isolated?: boolean | null
          is_throttled?: boolean | null
          last_heartbeat?: string | null
          safe_mode_entered_at?: string | null
          safe_mode_reason?: string | null
          snapshot_at?: never
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          anomaly_type: string | null
          context: Json | null
          created_at: string | null
          detected_at: string | null
          function_name: string | null
          id: string | null
          resolution: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string | null
          tenant_id: string | null
        }
        Insert: {
          anomaly_type?: string | null
          context?: Json | null
          created_at?: string | null
          detected_at?: string | null
          function_name?: string | null
          id?: string | null
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string | null
          tenant_id?: string | null
        }
        Update: {
          anomaly_type?: string | null
          context?: Json | null
          created_at?: string | null
          detected_at?: string | null
          function_name?: string | null
          id?: string | null
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_anomalies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_anomalies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_anomalies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_anomalies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_ai_function_performance: {
        Row: {
          avg_latency_ms: number | null
          avg_tokens: number | null
          cost_cents_24h: number | null
          function_name: string | null
          last_request: string | null
          requests_24h: number | null
          success_rate_pct: number | null
        }
        Relationships: []
      }
      v_ai_hourly_trends: {
        Row: {
          avg_latency_ms: number | null
          cost_cents: number | null
          hour: string | null
          requests: number | null
          success_rate_pct: number | null
          total_tokens: number | null
        }
        Relationships: []
      }
      v_ai_provider_performance: {
        Row: {
          avg_latency_ms: number | null
          cost_cents_24h: number | null
          fallback_rate_pct: number | null
          p95_latency_ms: number | null
          provider: string | null
          requests_24h: number | null
          success_rate_pct: number | null
          total_tokens: number | null
        }
        Relationships: []
      }
      v_anomalies_without_runbook: {
        Row: {
          anomaly_type: string | null
        }
        Relationships: []
      }
      v_audit_integrity_status: {
        Row: {
          last_audit_at: string | null
          tenant_id: string | null
          total_records: number | null
          with_hash: number | null
          without_hash: number | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_audit_moving_average: {
        Row: {
          event_count: number | null
          hour: string | null
          tenant_id: string | null
          unique_actions: number | null
          unique_users: number | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_confidence_gap_trend: {
        Row: {
          alert_reason: string | null
          alert_triggered: boolean | null
          ana_score: number | null
          audit_id: string | null
          avg_gap_30d: number | null
          avg_gap_90d: number | null
          confidence_gap: number | null
          created_at: string | null
          dimension_gaps: Json | null
          gap_delta: number | null
          health_status: string | null
          id: string | null
          is_improving: boolean | null
          prev_gap: number | null
          previous_gap: number | null
          red_score: number | null
          red_team_id: string | null
          tenant_id: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_critical_unassigned_tasks: {
        Row: {
          age_hours: number | null
          created_at: string | null
          due_at: string | null
          id: string | null
          severity: string | null
          sla_breached: boolean | null
          source_type: string | null
          status: string | null
          tenant_id: string | null
          title: string | null
        }
        Insert: {
          age_hours?: never
          created_at?: string | null
          due_at?: string | null
          id?: string | null
          severity?: string | null
          sla_breached?: never
          source_type?: string | null
          status?: string | null
          tenant_id?: string | null
          title?: string | null
        }
        Update: {
          age_hours?: never
          created_at?: string | null
          due_at?: string | null
          id?: string | null
          severity?: string | null
          sla_breached?: never
          source_type?: string | null
          status?: string | null
          tenant_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_cron_health: {
        Row: {
          consecutive_failures: number | null
          cron_name: string | null
          last_success_at: string | null
          status: string | null
        }
        Insert: {
          consecutive_failures?: number | null
          cron_name?: string | null
          last_success_at?: string | null
          status?: never
        }
        Update: {
          consecutive_failures?: number | null
          cron_name?: string | null
          last_success_at?: string | null
          status?: never
        }
        Relationships: []
      }
      v_cron_silence: {
        Row: {
          expected_interval: unknown
          job_key: string | null
          last_error: string | null
          last_seen_at: string | null
          missed_count: number | null
          silence_duration: unknown
          status: string | null
        }
        Insert: {
          expected_interval?: unknown
          job_key?: string | null
          last_error?: string | null
          last_seen_at?: string | null
          missed_count?: number | null
          silence_duration?: never
          status?: never
        }
        Update: {
          expected_interval?: unknown
          job_key?: string | null
          last_error?: string | null
          last_seen_at?: string | null
          missed_count?: number | null
          silence_duration?: never
          status?: never
        }
        Relationships: []
      }
      v_cron_silent_failures: {
        Row: {
          cron_expression: string | null
          enabled: boolean | null
          id: string | null
          job_name: string | null
          last_run_at: string | null
          next_run_at: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          cron_expression?: string | null
          enabled?: boolean | null
          id?: string | null
          job_name?: string | null
          last_run_at?: string | null
          next_run_at?: string | null
          status?: never
          tenant_id?: string | null
        }
        Update: {
          cron_expression?: string | null
          enabled?: boolean | null
          id?: string | null
          job_name?: string | null
          last_run_at?: string | null
          next_run_at?: string | null
          status?: never
          tenant_id?: string | null
        }
        Relationships: [
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_database_size_report: {
        Row: {
          index_size: string | null
          last_autovacuum: string | null
          rows_deleted: number | null
          rows_inserted: number | null
          schemaname: unknown
          table_name: unknown
          table_size: string | null
          total_size: string | null
        }
        Relationships: []
      }
      v_dlq_pending_attention: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string | null
          job_type: string | null
          original_job_id: string | null
          retry_count: number | null
          status: string | null
          tenant_id: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          avg_execution_ms: number | null
          avg_latency_ms: number | null
          failed: number | null
          failed_calls: number | null
          first_call: string | null
          function_name: string | null
          last_call: string | null
          max_latency_ms: number | null
          min_latency_ms: number | null
          p50_latency_ms: number | null
          p95_latency_ms: number | null
          p99_latency_ms: number | null
          successful: number | null
          successful_calls: number | null
          tenant_id: string | null
          total_calls: number | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_enforcement_compliance: {
        Row: {
          assigned_targets: number | null
          enabled: boolean | null
          is_active: boolean | null
          policy_id: string | null
          policy_name: string | null
          priority: number | null
          tenant_id: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_execution_chain_health: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          last_execution_hash: string | null
          last_execution_index: number | null
          status: string | null
          tenant_id: string | null
          time_since_last_execution: unknown
          updated_at: string | null
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_chain_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "v_problematic_agents"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_governance_stats: {
        Row: {
          approved: number | null
          last_report_at: string | null
          pending: number | null
          tenant_id: string | null
          total_reports: number | null
        }
        Relationships: [
          {
            foreignKeyName: "governance_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "governance_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "governance_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_incident_groups: {
        Row: {
          distinct_agents: number | null
          distinct_tenants: number | null
          failure_class: string | null
          fingerprint_hash: string | null
          first_seen_at: string | null
          id: string | null
          is_active: boolean | null
          is_ongoing: boolean | null
          is_trending: boolean | null
          last_seen_at: string | null
          normalized_signature: Json | null
          occurrences_24h: number | null
          severity_hint: string | null
          source_type: string | null
          total_occurrences: number | null
        }
        Insert: {
          distinct_agents?: number | null
          distinct_tenants?: number | null
          failure_class?: string | null
          fingerprint_hash?: string | null
          first_seen_at?: string | null
          id?: string | null
          is_active?: boolean | null
          is_ongoing?: never
          is_trending?: boolean | null
          last_seen_at?: string | null
          normalized_signature?: Json | null
          occurrences_24h?: never
          severity_hint?: string | null
          source_type?: string | null
          total_occurrences?: number | null
        }
        Update: {
          distinct_agents?: number | null
          distinct_tenants?: number | null
          failure_class?: string | null
          fingerprint_hash?: string | null
          first_seen_at?: string | null
          id?: string | null
          is_active?: boolean | null
          is_ongoing?: never
          is_trending?: boolean | null
          last_seen_at?: string | null
          normalized_signature?: Json | null
          occurrences_24h?: never
          severity_hint?: string | null
          source_type?: string | null
          total_occurrences?: number | null
        }
        Relationships: []
      }
      v_incident_groups_with_slo: {
        Row: {
          budget_consumed: number | null
          budget_remaining: number | null
          burn_rate_1h: number | null
          burn_rate_24h: number | null
          burn_rate_6h: number | null
          distinct_agents: number | null
          distinct_tenants: number | null
          error_budget: number | null
          failure_class: string | null
          fingerprint_hash: string | null
          first_seen_at: string | null
          id: string | null
          is_active: boolean | null
          is_ongoing: boolean | null
          last_evaluated_at: string | null
          last_seen_at: string | null
          normalized_signature: Json | null
          occurrences_1h: number | null
          occurrences_6h: number | null
          severity_hint: string | null
          slo_status: string | null
          slo_target: number | null
          source_type: string | null
          total_occurrences: number | null
        }
        Relationships: []
      }
      v_integrity_score: {
        Row: {
          active_releases: number | null
          calculated_at: string | null
          completed_jobs: number | null
          failed_jobs: number | null
          failed_jobs_score: number | null
          failed_with_error: number | null
          global_integrity_score: number | null
          job_integrity_score: number | null
          signed_releases: number | null
          supply_chain_score: number | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          failed_runs: number | null
          job_key: string | null
          job_source: string | null
          last_run_at: string | null
          successful_runs: number | null
          total_runs: number | null
        }
        Relationships: []
      }
      v_job_health_anomalies: {
        Row: {
          anomaly_type: string | null
          count: number | null
          oldest: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          avg_duration_seconds: number | null
          completed_count: number | null
          failed_count: number | null
          tenant_id: string | null
          total_count: number | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
          completed_at: string | null
          corrected_status: string | null
          created_at: string | null
          error_message: string | null
          id: string | null
          original_status: string | null
          tenant_id: string | null
          type: string | null
        }
        Insert: {
          agent_id?: string | null
          completed_at?: string | null
          corrected_status?: never
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          original_status?: string | null
          tenant_id?: string | null
          type?: string | null
        }
        Update: {
          agent_id?: string | null
          completed_at?: string | null
          corrected_status?: never
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          original_status?: string | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_pending_critical_approvals: {
        Row: {
          action_payload: Json | null
          action_type: string | null
          agent_name: string | null
          created_at: string | null
          current_approvers: number | null
          dry_run: boolean | null
          expires_at: string | null
          hostname: string | null
          id: string | null
          playbook_execution_id: string | null
          playbook_name: string | null
          required_approvers: number | null
          risk_score: number | null
          severity: string | null
          status: string | null
          tenant_id: string | null
          trigger_source: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_playbook_execution_id_fkey"
            columns: ["playbook_execution_id"]
            isOneToOne: false
            referencedRelation: "playbook_executions"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_problematic_agents: {
        Row: {
          agent_name: string | null
          agent_state: string | null
          agent_version: string | null
          display_name: string | null
          enrolled_at: string | null
          hostname: string | null
          id: string | null
          is_isolated: boolean | null
          isolation_reason: string | null
          last_heartbeat: string | null
          problem_since: string | null
          problem_type: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_name?: string | null
          agent_state?: string | null
          agent_version?: string | null
          display_name?: string | null
          enrolled_at?: string | null
          hostname?: string | null
          id?: string | null
          is_isolated?: boolean | null
          isolation_reason?: string | null
          last_heartbeat?: string | null
          problem_since?: never
          problem_type?: never
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          agent_name?: string | null
          agent_state?: string | null
          agent_version?: string | null
          display_name?: string | null
          enrolled_at?: string | null
          hostname?: string | null
          id?: string | null
          is_isolated?: boolean | null
          isolation_reason?: string | null
          last_heartbeat?: string | null
          problem_since?: never
          problem_type?: never
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "agent_snapshots"
            referencedColumns: ["agent_id"]
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
            referencedRelation: "agents_public"
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
            referencedRelation: "hmac_agent_secrets"
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
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_lifecycle_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_state"
            referencedColumns: ["id"]
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_rbac_metrics: {
        Row: {
          admin_count: number | null
          analyst_count: number | null
          distinct_roles: number | null
          operator_count: number | null
          rbac_status: string | null
          super_admin_count: number | null
          tenant_id: string | null
          total_users: number | null
          viewer_count: number | null
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_risk_debt_active: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          approved_by: string | null
          expires_at: string | null
          id: string | null
          justification: string | null
          severity: string | null
          tenant_id: string | null
          title: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          approved_by?: never
          expires_at?: never
          id?: string | null
          justification?: string | null
          severity?: string | null
          tenant_id?: string | null
          title?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          approved_by?: never
          expires_at?: never
          id?: string | null
          justification?: string | null
          severity?: string | null
          tenant_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_risk_debt_summary: {
        Row: {
          critical_count: number | null
          expiring_soon: number | null
          high_count: number | null
          tenant_id: string | null
          total_active: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_rls_continuous_check: {
        Row: {
          policy_count: number | null
          rls_enabled: boolean | null
          status: string | null
          table_name: unknown
        }
        Relationships: []
      }
      v_rls_security_status: {
        Row: {
          details: Json | null
          failure_reason: string | null
          id: string | null
          passed: boolean | null
          table_name: string | null
          test_name: string | null
          test_run_id: string | null
          tested_at: string | null
        }
        Insert: {
          details?: Json | null
          failure_reason?: string | null
          id?: string | null
          passed?: boolean | null
          table_name?: string | null
          test_name?: string | null
          test_run_id?: string | null
          tested_at?: string | null
        }
        Update: {
          details?: Json | null
          failure_reason?: string | null
          id?: string | null
          passed?: boolean | null
          table_name?: string | null
          test_name?: string | null
          test_run_id?: string | null
          tested_at?: string | null
        }
        Relationships: []
      }
      v_security_dashboard: {
        Row: {
          active_agents: number | null
          critical_events_24h: number | null
          events_24h: number | null
          generated_at: string | null
          metric_type: string | null
        }
        Relationships: []
      }
      v_security_invariants: {
        Row: {
          health_active_agents: number | null
          health_completed_actions: number | null
          health_pending_actions: number | null
          inv001_tables_with_policies: number | null
          inv001_tables_with_rls: number | null
          inv001_total_tables: number | null
          inv002_last_verification: string | null
          inv002_signatures_1h: number | null
          inv002_signatures_24h: number | null
          inv002_unique_agents_24h: number | null
          inv003_active_tenants: number | null
          inv003_rls_tests_failed_7d: number | null
          inv003_rls_tests_passed_7d: number | null
          inv004_no_secrets_in_views: boolean | null
          inv004_safe_agent_views: number | null
          inv005_audit_entries_1h: number | null
          inv005_audit_entries_24h: number | null
          inv005_evidence_logs_24h: number | null
          inv005_unique_actions_24h: number | null
          inv006_no_anon_write: boolean | null
          inv006_service_role_policies: number | null
          snapshot_at: string | null
        }
        Relationships: []
      }
      v_security_scan_compliance: {
        Row: {
          hardening_standard: string | null
          has_rls_policies: boolean | null
          object_name: string | null
          object_type: string | null
          rls_enabled: boolean | null
        }
        Relationships: []
      }
      v_service_role_policies: {
        Row: {
          granted_to: string | null
          justification: string | null
          operation: string | null
          policyname: unknown
          risk_level: string | null
          tablename: unknown
        }
        Relationships: []
      }
      v_soar_execution_summary: {
        Row: {
          completed_count: number | null
          execution_count: number | null
          failed_count: number | null
          last_execution: string | null
          playbook_name: string | null
          status: string | null
          tenant_id: string | null
          trigger_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "soar_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soar_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "soar_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "soar_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_soc2_readiness: {
        Row: {
          control_code: string | null
          control_name: string | null
          description: string | null
          due_date: string | null
          evidence_ref: string | null
          evidence_type: string | null
          gap_notes: string | null
          owner: string | null
          remediation_plan: string | null
          status: string | null
          tenant_id: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          control_code?: string | null
          control_name?: string | null
          description?: string | null
          due_date?: string | null
          evidence_ref?: string | null
          evidence_type?: string | null
          gap_notes?: string | null
          owner?: string | null
          remediation_plan?: string | null
          status?: string | null
          tenant_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          control_code?: string | null
          control_name?: string | null
          description?: string | null
          due_date?: string | null
          evidence_ref?: string | null
          evidence_type?: string | null
          gap_notes?: string | null
          owner?: string | null
          remediation_plan?: string | null
          status?: string | null
          tenant_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_stuck_jobs_report: {
        Row: {
          agent_name: string | null
          created_at: string | null
          delivered_at: string | null
          id: string | null
          minutes_stuck: number | null
          status: string | null
          stuck_reason: string | null
          tenant_id: string | null
          type: string | null
        }
        Insert: {
          agent_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string | null
          minutes_stuck?: never
          status?: string | null
          stuck_reason?: never
          tenant_id?: string | null
          type?: string | null
        }
        Update: {
          agent_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string | null
          minutes_stuck?: never
          status?: string | null
          stuck_reason?: never
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
            referencedRelation: "v_tenant_isolation_metrics"
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
            referencedRelation: "v_tenant_isolation_metrics"
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
      v_system_contracts: {
        Row: {
          contract: string | null
          value: string | null
        }
        Relationships: []
      }
      v_system_cycle_health: {
        Row: {
          cycle: string | null
          oldest_pending: string | null
          pending_count: number | null
        }
        Relationships: []
      }
      v_system_operations_summary: {
        Row: {
          active_agents: number | null
          jobs_24h: number | null
          pending_dlq: number | null
          tenant_id: string | null
          tenant_name: string | null
          total_agents: number | null
        }
        Insert: {
          active_agents?: never
          jobs_24h?: never
          pending_dlq?: never
          tenant_id?: string | null
          tenant_name?: string | null
          total_agents?: never
        }
        Update: {
          active_agents?: never
          jobs_24h?: never
          pending_dlq?: never
          tenant_id?: string | null
          tenant_name?: string | null
          total_agents?: never
        }
        Relationships: []
      }
      v_task_automation_metrics: {
        Row: {
          auto_closed: number | null
          automation_rate_percent: number | null
          closure_day: string | null
          manual_closed: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_task_stats: {
        Row: {
          completed: number | null
          failed: number | null
          in_progress: number | null
          pending: number | null
          tenant_id: string | null
          total_tasks: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_tasks_requiring_closure: {
        Row: {
          assigned_to: string | null
          auto_generated: boolean | null
          closed_at: string | null
          closed_by: string | null
          closure_evidence: Json | null
          closure_reason: string | null
          created_at: string | null
          description: string | null
          due_at: string | null
          fingerprint_id: string | null
          id: string | null
          metadata: Json | null
          playbook_id: string | null
          requires_human_review: boolean | null
          risk_accepted_at: string | null
          risk_accepted_by: string | null
          risk_expiry_at: string | null
          risk_justification: string | null
          semantic_fingerprint: string | null
          severity: string | null
          sla_breached_at: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
          tenant_id: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          auto_generated?: boolean | null
          closed_at?: string | null
          closed_by?: string | null
          closure_evidence?: Json | null
          closure_reason?: string | null
          created_at?: string | null
          description?: string | null
          due_at?: string | null
          fingerprint_id?: string | null
          id?: string | null
          metadata?: Json | null
          playbook_id?: string | null
          requires_human_review?: boolean | null
          risk_accepted_at?: string | null
          risk_accepted_by?: string | null
          risk_expiry_at?: string | null
          risk_justification?: string | null
          semantic_fingerprint?: string | null
          severity?: string | null
          sla_breached_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          tenant_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          auto_generated?: boolean | null
          closed_at?: string | null
          closed_by?: string | null
          closure_evidence?: Json | null
          closure_reason?: string | null
          created_at?: string | null
          description?: string | null
          due_at?: string | null
          fingerprint_id?: string | null
          id?: string | null
          metadata?: Json | null
          playbook_id?: string | null
          requires_human_review?: boolean | null
          risk_accepted_at?: string | null
          risk_accepted_by?: string | null
          risk_expiry_at?: string | null
          risk_justification?: string | null
          semantic_fingerprint?: string | null
          severity?: string | null
          sla_breached_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          tenant_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_fingerprint_id_fkey"
            columns: ["fingerprint_id"]
            isOneToOne: false
            referencedRelation: "failure_fingerprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_fingerprint_id_fkey"
            columns: ["fingerprint_id"]
            isOneToOne: false
            referencedRelation: "v_incident_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_fingerprint_id_fkey"
            columns: ["fingerprint_id"]
            isOneToOne: false
            referencedRelation: "v_incident_groups_with_slo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_system_operations_summary"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_isolation_metrics"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_plan_status"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_tenant_claim_health: {
        Row: {
          cross_tenant_attempts: number | null
          missing_claims: number | null
          period: string | null
          tenant_switches: number | null
          valid_claims: number | null
        }
        Relationships: []
      }
      v_tenant_isolation_metrics: {
        Row: {
          agent_count: number | null
          job_count: number | null
          tenant_id: string | null
          tenant_name: string | null
          user_count: number | null
        }
        Insert: {
          agent_count?: never
          job_count?: never
          tenant_id?: string | null
          tenant_name?: string | null
          user_count?: never
        }
        Update: {
          agent_count?: never
          job_count?: never
          tenant_id?: string | null
          tenant_name?: string | null
          user_count?: never
        }
        Relationships: []
      }
      v_tenant_plan_status: {
        Row: {
          addon_devices: number | null
          created_at: string | null
          current_agents: number | null
          current_period_end: string | null
          current_users: number | null
          device_quantity: number | null
          plan_id: string | null
          subscription_status: string | null
          tenant_id: string | null
          tenant_name: string | null
          trial_end: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      v_zero_gap_health: {
        Row: {
          active_jobs: number | null
          completed_24h: number | null
          dlq_exhausted: number | null
          dlq_pending: number | null
          domain_events_total: number | null
          expired_jobs_stuck: number | null
          failed_24h: number | null
          failing_crons: number | null
          stale_tasks: number | null
          zombie_delivered: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _assert_service_role_or_super_admin: { Args: never; Returns: undefined }
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
      archive_agent:
        | { Args: { p_agent_id: string }; Returns: Json }
        | {
            Args: {
              p_actor_id?: string
              p_actor_type: string
              p_agent_id: string
              p_notes?: string
              p_reason: string
            }
            Returns: undefined
          }
      archive_old_evidence_logs: {
        Args: { retention_days?: number }
        Returns: number
      }
      archive_old_executions: {
        Args: { p_batch_size?: number; p_older_than_days?: number }
        Returns: Json
      }
      assert_system_allows_jobs: { Args: never; Returns: undefined }
      assert_system_not_stopped: { Args: never; Returns: undefined }
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
      auto_approve_safe_actions: {
        Args: { p_tenant_id?: string }
        Returns: Json
      }
      auto_cancel_archived_agent_jobs: { Args: never; Returns: number }
      auto_cancel_zombie_jobs: {
        Args: never
        Returns: {
          cancelled_count: number
          job_ids: string[]
        }[]
      }
      auto_mark_agents_inactive: { Args: never; Returns: Json }
      auto_resolve_stale_tasks: { Args: never; Returns: Json }
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
      calculate_fingerprint_hash: { Args: { signature: Json }; Returns: string }
      calculate_incident_burn_rate: {
        Args: { p_fingerprint_id: string }
        Returns: undefined
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
      check_expired_risks: { Args: never; Returns: undefined }
      check_incident_slo_task: { Args: never; Returns: number }
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
      check_job_health_anomalies_and_alert: { Args: never; Returns: undefined }
      check_offline_agents_for_playbook:
        | {
            Args: never
            Returns: {
              agent_id: string
              agent_name: string
              last_heartbeat: string
              minutes_offline: number
              playbook_triggered: boolean
              tenant_id: string
            }[]
          }
        | {
            Args: { p_tenant_id: string }
            Returns: {
              agent_id: string
              agent_name: string
              last_heartbeat: string
              minutes_offline: number
            }[]
          }
      check_rate_limit_atomic: {
        Args: {
          p_block_minutes?: number
          p_endpoint: string
          p_identifier: string
          p_max_requests?: number
          p_window_minutes?: number
        }
        Returns: Json
      }
      check_security_thresholds: {
        Args: never
        Returns: {
          alert_severity: string
          alert_type: string
          current_value: number
          message: string
          should_alert: boolean
          threshold: number
        }[]
      }
      check_segregation_rule: {
        Args: {
          _action_type: string
          _requester_id: string
          _tenant_id: string
        }
        Returns: Json
      }
      check_super_admin_ip_access: {
        Args: { _ip_address: string; _user_id: string }
        Returns: boolean
      }
      check_task_sla_breach: { Args: never; Returns: number }
      claim_jobs_for_agent: {
        Args: { p_agent_id: string; p_limit?: number }
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
      cleanup_expired_keys: { Args: never; Returns: number }
      cleanup_expired_sessions: { Args: never; Returns: number }
      cleanup_jobs_for_offline_agents: { Args: never; Returns: Json }
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
      cleanup_stale_playbook_executions: { Args: never; Returns: number }
      cleanup_stale_queued_jobs: {
        Args: { p_hours_threshold?: number }
        Returns: {
          cleaned_count: number
          job_ids: string[]
        }[]
      }
      cleanup_stale_tasks: {
        Args: {
          p_batch_size?: number
          p_days_old?: number
          p_tenant_id: string
        }
        Returns: Json
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
      cleanup_stuck_pending_jobs: { Args: never; Returns: number }
      cleanup_suspended_tenant_data: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      cleanup_zombie_executions: { Args: never; Returns: Json }
      collect_task_evidence: {
        Args: { p_agent_id: string; p_task_type: string }
        Returns: Json
      }
      collect_weekly_governance_metrics: {
        Args: { tenant_uuid: string; week_start?: string }
        Returns: Json
      }
      count_policies_for_table: {
        Args: { p_table_name: string }
        Returns: number
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
      create_job_if_not_exists: {
        Args: {
          p_agent_id: string
          p_payload?: Json
          p_priority?: number
          p_tenant_id: string
          p_ttl_hours?: number
          p_type: string
        }
        Returns: string
      }
      create_jobs_for_all_agents: {
        Args: { p_job_type: string; p_payload?: Json; p_tenant_id: string }
        Returns: number
      }
      create_metrics_partition_if_needed: { Args: never; Returns: undefined }
      create_retroactive_execution: {
        Args: { p_job_id: string }
        Returns: string
      }
      current_user_tenant_id: { Args: never; Returns: string }
      describe_table: {
        Args: { p_table_name: string }
        Returns: {
          column_name: string
          data_type: string
          is_nullable: string
        }[]
      }
      detect_blocked_access_attempts: {
        Args: never
        Returns: {
          inserted_count: number
        }[]
      }
      detect_blocked_attempts: { Args: never; Returns: Json }
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
          first_seen: string
          last_seen: string
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
      detect_silent_job_failures: {
        Args: never
        Returns: {
          agent_id: string
          hours_since_execution: number
          job_id: string
          job_name: string
          job_type: string
          last_execution_at: string
          last_status: string
          tenant_id: string
          violation_type: string
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
      diagnose_chain_health: { Args: { p_tenant_id?: string }; Returns: Json }
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
      escalate_breached_sla_tasks: { Args: never; Returns: undefined }
      evaluate_decision_rules: { Args: never; Returns: Json }
      evaluate_job_slo: {
        Args: never
        Returns: {
          out_burn_rate: number
          out_error_rate: number
          out_severity: string
          out_task_created: boolean
          out_tenant_id: string
          out_time_window: string
        }[]
      }
      evaluate_playbook_trigger: {
        Args: {
          p_agent_id?: string
          p_tenant_id: string
          p_trigger_context?: Json
          p_trigger_type: string
        }
        Returns: string
      }
      evaluate_software_risk: {
        Args: { p_agent_id: string }
        Returns: undefined
      }
      evaluate_software_risk_all_agents: { Args: never; Returns: Json }
      evaluate_software_risk_with_reporting: { Args: never; Returns: Json }
      execute_ai_action_rollback: {
        Args: { p_ai_action_id: string; p_notes?: string; p_success: boolean }
        Returns: Json
      }
      execute_playbook_actions: {
        Args: { p_execution_id: string }
        Returns: Json
      }
      execute_rollback_test: {
        Args: { p_agent_id?: string; p_dry_run?: boolean; p_tenant_id: string }
        Returns: Json
      }
      execute_with_timeout: {
        Args: { p_sql: string; p_timeout_ms?: number }
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
      find_unsafe_definer_functions: {
        Args: never
        Returns: {
          proname: string
        }[]
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
      get_active_tenant_id: { Args: never; Returns: string }
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
      get_agent_snapshot: { Args: { p_agent_id: string }; Returns: Json }
      get_agents_list: {
        Args: { p_include_archived?: boolean; p_tenant_id: string }
        Returns: Json[]
      }
      get_agents_snapshots_list: {
        Args: { p_tenant_id?: string }
        Returns: Json[]
      }
      get_ai_provider_scores: {
        Args: never
        Returns: {
          avg_latency_ms: number
          provider: string
          requests_count: number
          score: number
          success_rate: number
        }[]
      }
      get_alert_decision_chain: { Args: { p_alert_id: string }; Returns: Json }
      get_audit_raw_metrics: { Args: { p_tenant_id: string }; Returns: Json }
      get_autonomy_metrics: {
        Args: { p_days?: number; p_tenant_id: string }
        Returns: Json
      }
      get_balanced_pending_actions: {
        Args: { p_limit?: number }
        Returns: {
          action_payload: Json
          action_type: string
          ai_insights: Json
          id: string
          insight_id: string
          tenant_id: string
        }[]
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
      get_governance_snapshot:
        | { Args: never; Returns: Json }
        | { Args: { p_tenant_id?: string }; Returns: Json }
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
          agent_version: string
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
      get_mfa_user_count: { Args: { p_tenant_id: string }; Returns: Json }
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
      get_previous_audit_score: {
        Args: { p_tenant_id: string }
        Returns: {
          avg_last_3: number
          avg_last_7: number
          previous_official_score: number
          previous_score: number
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
      get_session_timeout_minutes: { Args: { _role: string }; Returns: number }
      get_slo_target_for_severity: {
        Args: { p_severity: string }
        Returns: number
      }
      get_smart_notifications: { Args: { p_tenant_id?: string }; Returns: Json }
      get_software_risk_summary: {
        Args: { p_tenant_id: string }
        Returns: {
          category_breakdown: Json
          count: number
          risk_level: string
        }[]
      }
      get_stale_agents: {
        Args: { p_tenant_id: string; p_threshold_minutes?: number }
        Returns: {
          agent_id: string
          agent_name: string
          agent_version: string
          display_name: string
          hostname: string
          last_heartbeat: string
          minutes_since_heartbeat: number
          status: string
        }[]
      }
      get_system_mode: {
        Args: never
        Returns: Database["public"]["Enums"]["system_operational_mode"]
      }
      get_system_mode_safe: { Args: never; Returns: string }
      get_tenant_mfa_policy: { Args: { _tenant_id: string }; Returns: Json }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: {
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
        }[]
      }
      get_user_tenant_id_safe: { Args: { p_user_id?: string }; Returns: string }
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
      get_zombie_threshold_minutes: {
        Args: { p_job_type: string }
        Returns: number
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
      increment_ai_cache_hit: { Args: { cache_id: string }; Returns: undefined }
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
      is_active_tenant: { Args: { _tenant_id: string }; Returns: boolean }
      is_break_glass_user: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_current_super_admin: { Args: never; Returns: boolean }
      is_emergency_mode: { Args: never; Returns: boolean }
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
      log_session_start: {
        Args: { _ip_address: string; _user_agent: string }
        Returns: string
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
      mark_cron_failure: {
        Args: { p_cron_name: string; p_error: string }
        Returns: undefined
      }
      must_change_password: { Args: never; Returns: boolean }
      normalize_job_failure: {
        Args: { job_record: Database["public"]["Tables"]["jobs"]["Row"] }
        Returns: Json
      }
      parse_version_code: { Args: { version_text: string }; Returns: number }
      persist_chain_breaks: { Args: never; Returns: number }
      poll_jobs_v2: {
        Args: { p_max_jobs?: number; p_token_hash: string }
        Returns: Json
      }
      process_autonomous_safe_mode: { Args: never; Returns: Json }
      process_dlq_batch: {
        Args: { p_action?: string; p_batch_size?: number; p_tenant_id: string }
        Returns: Json
      }
      process_heartbeat_v2: {
        Args: {
          p_agent_version?: string
          p_cpu_usage?: number
          p_disk_usage?: number
          p_hostname?: string
          p_memory_usage?: number
          p_os_type?: string
          p_os_version?: string
          p_token_hash: string
          p_uptime_seconds?: number
        }
        Returns: Json
      }
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
      process_tenant_suspensions: { Args: never; Returns: Json }
      reactivate_tenant: { Args: { p_tenant_id: string }; Returns: Json }
      reanchor_audit_log_chain: { Args: { p_tenant_id: string }; Returns: Json }
      reanchor_execution_chains: {
        Args: { p_agent_id?: string }
        Returns: Json
      }
      reconstruct_incident_timeline: {
        Args: { p_agent_id: string; p_end_time: string; p_start_time: string }
        Returns: Json
      }
      refresh_all_incident_slos: { Args: never; Returns: number }
      refresh_incident_slos: { Args: never; Returns: Json }
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
      register_failure_occurrence: {
        Args: {
          p_agent_id?: string
          p_error_excerpt?: string
          p_signature: Json
          p_source_id: string
          p_source_type: string
          p_tenant_id: string
        }
        Returns: string
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
      requires_human_review: {
        Args: {
          p_action_type?: string
          p_severity: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      reset_monthly_scan_quota: { Args: never; Returns: undefined }
      resolve_stale_dlq_entries: { Args: never; Returns: Json }
      review_dlq_item: {
        Args: {
          p_dlq_id: string
          p_review_notes: string
          p_risk_category?: string
        }
        Returns: Json
      }
      revive_agent_on_reenroll: {
        Args: {
          p_agent_id: string
          p_expected_tenant_id?: string
          p_new_hmac_secret: string
        }
        Returns: Json
      }
      revoke_agent_signing_key: {
        Args: { p_agent_id: string; p_reason?: string }
        Returns: Json
      }
      run_all_health_checks: {
        Args: never
        Returns: {
          check_name: string
          error_msg: string
          passed: boolean
        }[]
      }
      run_maintenance_v2: {
        Args: { p_archive_limit?: number; p_expire_limit?: number }
        Returns: Json
      }
      run_system_maintenance: { Args: never; Returns: Json }
      severity_floor_rate: { Args: { p_severity: string }; Returns: number }
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
      switch_tenant_atomic: {
        Args: { p_new_tenant_id: string; p_user_id: string }
        Returns: Json
      }
      sync_agent_state_from_heartbeat: {
        Args: never
        Returns: {
          updated_count: number
          updated_ids: string[]
        }[]
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
      sync_pgcron_health_from_run_details: { Args: never; Returns: undefined }
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
      update_agent_web_consent: {
        Args: { p_agent_id: string; p_enabled: boolean; p_user_id: string }
        Returns: undefined
      }
      update_cron_health:
        | {
            Args: { p_cron_name: string; p_details?: Json; p_success: boolean }
            Returns: undefined
          }
        | {
            Args: { p_cron_name: string; p_error?: string; p_success: boolean }
            Returns: undefined
          }
      update_job_heartbeat: {
        Args: { p_error?: string; p_job_key: string }
        Returns: undefined
      }
      update_offline_agent_status: { Args: never; Returns: Json }
      update_quota_usage: {
        Args: { p_delta: number; p_feature_key: string; p_tenant_id: string }
        Returns: undefined
      }
      update_session_activity: {
        Args: { _session_id: string }
        Returns: undefined
      }
      update_user_role: {
        Args: {
          _new_role: Database["public"]["Enums"]["app_role"]
          _requester_id?: string
          _target_user_id: string
        }
        Returns: Json
      }
      update_user_role_rpc: {
        Args: { p_new_role: string; p_user_id: string }
        Returns: undefined
      }
      user_belongs_to_tenant:
        | { Args: { _tenant_id: string }; Returns: boolean }
        | { Args: { _tenant_id: string; _user_id: string }; Returns: boolean }
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
      validate_governance_coverage: {
        Args: { tenant_uuid?: string }
        Returns: Json
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
      verify_audit_log_integrity: { Args: never; Returns: Json }
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
      app_role:
        | "admin"
        | "operator"
        | "viewer"
        | "super_admin"
        | "member"
        | "analyst"
      system_operational_mode: "normal" | "degraded" | "read_only" | "halt_jobs"
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
      app_role: [
        "admin",
        "operator",
        "viewer",
        "super_admin",
        "member",
        "analyst",
      ],
      system_operational_mode: ["normal", "degraded", "read_only", "halt_jobs"],
    },
  },
} as const
