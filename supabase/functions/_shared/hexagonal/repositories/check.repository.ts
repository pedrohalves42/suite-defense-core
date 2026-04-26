// check.repository.ts - Strongly typed repository for ops-checks
// Note: ops_checks table is not yet in generated database.types.ts,
// so we cast `from('ops_checks')` to any until the schema is regenerated.
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Database } from '../../database.types.ts';

export interface Check {
  id: string;
  name: string;
  is_active: boolean;
  [key: string]: unknown;
}

export interface CheckUpdate {
  is_active?: boolean;
  last_run_at?: string;
  last_result?: unknown;
  [key: string]: unknown;
}

export interface ICheckRepository {
  listActiveChecks(): Promise<Check[]>;
  getCheckById(id: string): Promise<Check | null>;
  updateCheckStatus(id: string, update: CheckUpdate): Promise<void>;
  logScheduledJobRun(payload: any): Promise<void>;
  createSystemAlert(alert: any): Promise<void>;
  createTask(task: any): Promise<{ id: string }>;
  logAudit(audit: any): Promise<void>;
  saveCheckResult(checkId: string, result: any): Promise<void>;
  getTenants(): Promise<any[]>;
  getAgents(filters?: any): Promise<any[]>;
  getInstallationAnalytics(filters?: any): Promise<any[]>;
  getJobs(filters?: any): Promise<any[]>;
  rpc(name: string, params?: any): Promise<any>;
  getTenantsWithSettings(): Promise<any[]>;
  getCount(table: string, filters: any): Promise<number>;
  updateCronHealth(cronName: string, success: boolean, details: any): Promise<void>;
  findExistingAlert(filters: any): Promise<any | null>;
  findExistingInsight(filters: any): Promise<any | null>;
  createInsight(insight: any): Promise<void>;
  getSilentFailures(): Promise<any[]>;
  getUnhealthyAgents(): Promise<any[]>;
  getStuckAgentLifecycle(): Promise<any[]>;
  getBatchCounts(table: string, tenantIds: string[], filters: any): Promise<Record<string, number>>;
}

export class SupabaseCheckRepository implements ICheckRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  // Helper: untyped client for tables not yet in generated types
  private get db(): any {
    return this.supabase as any;
  }

  async listActiveChecks(): Promise<Check[]> {
    const { data, error } = await this.db
      .from('ops_checks')
      .select('*')
      .eq('is_active', true);
    if (error) throw error;
    return (data as Check[]) || [];
  }

  async getCheckById(id: string): Promise<Check | null> {
    const { data, error } = await this.db
      .from('ops_checks')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as Check | null;
  }

  async updateCheckStatus(id: string, update: CheckUpdate): Promise<void> {
    const { error } = await this.db
      .from('ops_checks')
      .update(update)
      .eq('id', id);
    if (error) throw error;
  }

  async logScheduledJobRun(payload: any): Promise<void> {
    const { error } = await this.db.rpc('log_scheduled_job_run', payload);
    if (error) throw error;
  }

  async createSystemAlert(alert: any): Promise<void> {
    const { error } = await this.supabase.from('system_alerts').insert(alert);
    if (error) throw error;
  }

  async createTask(task: any): Promise<{ id: string }> {
    const { data, error } = await this.supabase.from('tasks').insert(task).select('id').single();
    if (error) throw error;
    if (!data) throw new Error('Failed to create task');
    return data as { id: string };
  }

  async logAudit(audit: any): Promise<void> {
    const { error } = await this.supabase.from('audit_logs').insert(audit);
    if (error) throw error;
  }

  async saveCheckResult(checkId: string, result: any): Promise<void> {
    const { error } = await this.db
      .from('ops_checks')
      .update({
        last_run_at: new Date().toISOString(),
        last_result: result,
      })
      .eq('id', checkId);
    if (error) throw error;
  }

  async getTenants(): Promise<any[]> {
    const { data, error } = await this.supabase.from('tenants').select('id, name');
    if (error) throw error;
    return data || [];
  }

  async getAgents(filters?: any): Promise<any[]> {
    let query: any = this.supabase.from('agents').select('*');
    if (filters?.gte) {
      for (const [key, val] of Object.entries(filters.gte)) {
        query = query.gte(key, val);
      }
    }
    if (filters?.neq) {
      for (const [key, val] of Object.entries(filters.neq)) {
        query = query.neq(key, val);
      }
    }
    if (filters?.in) {
      for (const [key, val] of Object.entries(filters.in)) {
        query = query.in(key, val);
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getInstallationAnalytics(filters?: any): Promise<any[]> {
    let query: any = this.supabase.from('installation_analytics').select('*');
    if (filters?.gte) {
      for (const [key, val] of Object.entries(filters.gte)) {
        query = query.gte(key, val);
      }
    }
    if (filters?.in) {
      for (const [key, val] of Object.entries(filters.in)) {
        query = query.in(key, val);
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getJobs(filters?: any): Promise<any[]> {
    let query: any = this.supabase.from('jobs').select('*');
    if (filters?.eq) {
      for (const [key, val] of Object.entries(filters.eq)) {
        query = query.eq(key, val);
      }
    }
    if (filters?.lt) {
      for (const [key, val] of Object.entries(filters.lt)) {
        query = query.lt(key, val);
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async rpc(name: string, params?: any): Promise<any> {
    const { data, error } = await this.db.rpc(name, params);
    if (error) throw error;
    return data;
  }

  async getTenantsWithSettings(): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('tenants')
      .select(`id, name, tenant_settings!tenant_settings_tenant_id_fkey (
        alert_threshold_virus_positive, alert_threshold_failed_jobs,
        alert_threshold_offline_agents, enable_email_alerts,
        enable_webhook_alerts, alert_email, alert_webhook_url
      )`);
    if (error) throw error;
    return data || [];
  }

  async getCount(table: string, filters: any): Promise<number> {
    let query = (this.supabase.from as any)(table).select('*', { count: 'exact', head: true });
    if (filters.eq) {
      for (const [key, val] of Object.entries(filters.eq)) {
        query = query.eq(key, val as any);
      }
    }
    if (filters.gte) {
      for (const [key, val] of Object.entries(filters.gte)) {
        query = query.gte(key, val as any);
      }
    }
    if (filters.lt) {
      for (const [key, val] of Object.entries(filters.lt)) {
        query = query.lt(key, val as any);
      }
    }
    if (filters.notNull) {
      query = query.not(filters.notNull, 'is', null);
    }
    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  }

  async updateCronHealth(cronName: string, success: boolean, details: any): Promise<void> {
    const { error } = await this.db.rpc('update_cron_health', {
      p_cron_name: cronName,
      p_success: success,
      p_details: details,
    });
    if (error) {
      // Best effort, don't throw
      console.warn(`[SupabaseCheckRepository] Failed to update cron health for ${cronName}:`, error.message);
    }
  }

  async findExistingAlert(filters: any): Promise<any | null> {
    let query = this.supabase.from('system_alerts').select('id');
    for (const [key, val] of Object.entries(filters)) {
      if (val === null) {
        query = query.is(key, null);
      } else if (key === 'created_at_gte') {
        query = query.gte('created_at', val as any);
      } else {
        query = query.eq(key, val as any);
      }
    }
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  async findExistingInsight(filters: any): Promise<any | null> {
    let query = this.supabase.from('ai_insights').select('id');
    for (const [key, val] of Object.entries(filters)) {
      if (key === 'created_at_gte') {
        query = query.gte('created_at', val as any);
      } else {
        query = query.eq(key, val as any);
      }
    }
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  async createInsight(insight: any): Promise<void> {
    const { error } = await this.supabase.from('ai_insights').insert(insight);
    if (error) throw error;
  }

  async getSilentFailures(): Promise<any[]> {
    const { data, error } = await this.supabase.from('v_cron_silent_failures').select('*');
    if (error) throw error;
    return data || [];
  }

  async getUnhealthyAgents(): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('v_agent_execution_health')
      .select('*')
      .neq('health_status', 'healthy')
      .neq('health_status', 'offline')
      .neq('health_status', 'never_connected');
    if (error) throw error;
    return data || [];
  }

  async getStuckAgentLifecycle(): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('v_agent_lifecycle_state')
      .select('agent_id, tenant_id, agent_name')
      .eq('is_stuck', true)
      .limit(100);
    if (error) throw error;
    return data || [];
  }

  async getBatchCounts(table: string, tenantIds: string[], filters: any): Promise<Record<string, number>> {
    if (tenantIds.length === 0) return {};
    
    // Using Supabase client with grouping and count
    // Note: Standard Supabase client doesn't support grouping well in a single call for counts
    // We'll use a RPC or a raw query if needed, but we can try to use a series of filters or 
    // better, implement a dedicated database function for this.
    // For now, let's use a RPC to handle this efficiently on the DB side.
    const { data, error } = await (this.supabase.rpc as any)('get_batch_counts', {
      p_table: table,
      p_tenant_ids: tenantIds,
      p_filters: filters
    });
    
    if (error) {
      // Fallback: If RPC doesn't exist yet, we might need to handle it or use a different approach
      // In a real scenario, I'd create the migration first.
      throw error;
    }
    
    const counts: Record<string, number> = {};
    (data as any[] || []).forEach(row => {
      counts[row.tenant_id] = parseInt(row.count, 10);
    });
    
    return counts;
  }
}

