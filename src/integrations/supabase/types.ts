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
      agent_tokens: {
        Row: {
          agent_id: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          token: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          token: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          token?: string
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
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          agent_name: string
          enrolled_at: string
          hmac_secret: string | null
          id: string
          last_heartbeat: string | null
          payload_hash: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          agent_name: string
          enrolled_at?: string
          hmac_secret?: string | null
          id?: string
          last_heartbeat?: string | null
          payload_hash?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          agent_name?: string
          enrolled_at?: string
          hmac_secret?: string | null
          id?: string
          last_heartbeat?: string | null
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
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
        ]
      }
      audit_logs: {
        Row: {
          action: string
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
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_audit_logs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_keys: {
        Row: {
          created_at: string
          created_by: string | null
          current_uses: number
          description: string | null
          expires_at: string
          id: string
          is_active: boolean
          key: string
          max_uses: number
          tenant_id: string
          used_at: string | null
          used_by_agent: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_uses?: number
          description?: string | null
          expires_at: string
          id?: string
          is_active?: boolean
          key: string
          max_uses?: number
          tenant_id: string
          used_at?: string | null
          used_by_agent?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_uses?: number
          description?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean
          key?: string
          max_uses?: number
          tenant_id?: string
          used_at?: string | null
          used_by_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollment_keys_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
            foreignKeyName: "invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          agent_name: string
          approved: boolean
          completed_at: string | null
          created_at: string
          delivered_at: string | null
          id: string
          is_recurring: boolean | null
          last_run_at: string | null
          next_run_at: string | null
          parent_job_id: string | null
          payload: Json | null
          recurrence_pattern: string | null
          scheduled_at: string | null
          status: string
          tenant_id: string
          type: string
        }
        Insert: {
          agent_name: string
          approved?: boolean
          completed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_recurring?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          parent_job_id?: string | null
          payload?: Json | null
          recurrence_pattern?: string | null
          scheduled_at?: string | null
          status?: string
          tenant_id: string
          type: string
        }
        Update: {
          agent_name?: string
          approved?: boolean
          completed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_recurring?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          parent_job_id?: string | null
          payload?: Json | null
          recurrence_pattern?: string | null
          scheduled_at?: string | null
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
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
            foreignKeyName: "reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_contacts: {
        Row: {
          company: string | null
          created_at: string
          email: string
          endpoints: number | null
          id: string
          message: string | null
          name: string
          phone: string | null
          status: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          endpoints?: number | null
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          status?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          endpoints?: number | null
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          status?: string | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string
          id: string
          max_agents: number | null
          max_scans_per_month: number | null
          max_users: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_agents?: number | null
          max_scans_per_month?: number | null
          max_users: number
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_agents?: number | null
          max_scans_per_month?: number | null
          max_users?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
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
        ]
      }
      tenant_settings: {
        Row: {
          alert_email: string | null
          alert_threshold_failed_jobs: number | null
          alert_threshold_offline_agents: number | null
          alert_threshold_virus_positive: number | null
          alert_webhook_url: string | null
          created_at: string
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
          created_at?: string
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
          created_at?: string
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
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          created_at: string
          id: string
          plan_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_id?: string
          tenant_id?: string
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
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
            foreignKeyName: "virus_scans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      agents_safe: {
        Row: {
          agent_name: string | null
          enrolled_at: string | null
          id: string | null
          last_heartbeat: string | null
          payload_hash: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_name?: string | null
          enrolled_at?: string | null
          id?: string | null
          last_heartbeat?: string | null
          payload_hash?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          agent_name?: string | null
          enrolled_at?: string | null
          id?: string | null
          last_heartbeat?: string | null
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
            foreignKeyName: "fk_agents_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
          details?: never
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
          details?: never
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
            foreignKeyName: "fk_audit_logs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_keys_safe: {
        Row: {
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
            foreignKeyName: "enrollment_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollment_keys_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calculate_next_run: {
        Args: { from_time?: string; pattern: string }
        Returns: string
      }
      cleanup_expired_keys: { Args: never; Returns: undefined }
      cleanup_old_hmac_signatures: { Args: never; Returns: undefined }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      current_user_tenant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_operator_or_viewer: { Args: { _user_id: string }; Returns: boolean }
      reset_monthly_scan_quota: { Args: never; Returns: undefined }
      update_quota_usage: {
        Args: { p_delta: number; p_feature_key: string; p_tenant_id: string }
        Returns: undefined
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
