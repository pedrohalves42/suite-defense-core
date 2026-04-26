// check.repository.ts - Strongly typed repository for ops-checks
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Database, Json } from '../../database.types.ts';

type Tables = Database['public']['Tables'];
type Views = Database['public']['Views'];

export type Check = Tables['ops_checks']['Row'];
export type CheckUpdate = Tables['ops_checks']['Update'];

export interface ICheckRepository {
  listActiveChecks(): Promise<Check[]>;
  getCheckById(id: string): Promise<Check | null>;
  updateCheckStatus(id: string, update: CheckUpdate): Promise<void>;
  logScheduledJobRun(payload: Database['public']['Functions']['log_scheduled_job_run']['Args']): Promise<void>;
  createSystemAlert(alert: Tables['system_alerts']['Insert'] | Tables['system_alerts']['Insert'][]): Promise<void>;
  createTask(task: Tables['tasks']['Insert']): Promise<{ id: string }>;
  logAudit(audit: Tables['audit_logs']['Insert']): Promise<void>;
  saveCheckResult(checkId: string, result: Json): Promise<void>;
  getTenants(): Promise<Tables['tenants']['Row'][]>;
  getAgents(filters?: { 
    gte?: Record<string, string | number>, 
    neq?: Record<string, string | number>, 
    in?: Record<string, (string | number)[]> 
  }): Promise<Tables['agents']['Row'][]>;
  getInstallationAnalytics(filters?: { 
    gte?: Record<string, string | number>, 
    in?: Record<string, (string | number)[]> 
  }): Promise<Tables['installation_analytics']['Row'][]>;
  getJobs(filters?: { 
    eq?: Record<string, string | number>, 
    lt?: Record<string, string | number>,
    gte?: Record<string, string | number>,
    tenant_id?: string
  }): Promise<Tables['jobs']['Row'][]>;
  rpc<T extends keyof Database['public']['Functions']>(
    name: T,
    params?: Database['public']['Functions'][T]['Args']
  ): Promise<Database['public']['Functions'][T]['Returns']>;
  getTenantsWithSettings(): Promise<any[]>;
  getCount(table: keyof Tables, filters: { 
    eq?: Record<string, string | number>, 
    gte?: Record<string, string | number>, 
    lt?: Record<string, string | number>, 
    notNull?: string 
  }): Promise<number>;
  updateCronHealth(cronName: string, success: boolean, details: any): Promise<void>;
  findExistingAlert(filters: Partial<Tables['system_alerts']['Row']> & { created_at_gte?: string }): Promise<{ id: string } | null>;
  findExistingInsight(filters: Partial<Tables['ai_insights']['Row']> & { created_at_gte?: string }): Promise<{ id: string } | null>;
  createInsight(insight: Tables['ai_insights']['Insert']): Promise<void>;
  getSilentFailures(): Promise<Views['v_cron_silent_failures']['Row'][]>;
  getUnhealthyAgents(): Promise<Views['v_agent_execution_health']['Row'][]>;
  getStuckAgentLifecycle(): Promise<Views['v_agent_lifecycle_state']['Row'][]>;
  getBatchCounts(table: keyof Tables, tenantIds: string[], filters: any): Promise<Record<string, number>>;
  getBusinessHoursBatch(tenantIds: string[]): Promise<Record<string, any>>;
  getInstallationHealthBatch(tenantIds: string[]): Promise<any[]>;
  getTenantsComplianceScores(): Promise<any[]>;
  supabase: SupabaseClient<Database>;
}

export class SupabaseCheckRepository implements ICheckRepository {
  constructor(public readonly supabase: SupabaseClient<Database>) {}

  async listActiveChecks(): Promise<Check[]> {
    const { data, error } = await this.supabase
      .from('ops_checks')
      .select('*')
      .eq('is_active', true);
    if (error) throw error;
    return data || [];
  }

  async getCheckById(id: string): Promise<Check | null> {
    const { data, error } = await this.supabase
      .from('ops_checks')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async updateCheckStatus(id: string, update: CheckUpdate): Promise<void> {
    const { error } = await this.supabase
      .from('ops_checks')
      .update(update)
      .eq('id', id);
    if (error) throw error;
  }

  async logScheduledJobRun(payload: any): Promise<void> {
    const { error } = await this.supabase.rpc('log_scheduled_job_run', payload);
    if (error) throw error;
  }

  async createSystemAlert(alert: Tables['system_alerts']['Insert'] | Tables['system_alerts']['Insert'][]): Promise<void> {
    const rows = Array.isArray(alert) ? alert : [alert];
    if (rows.length === 0) return;
    const { error } = await this.supabase.from('system_alerts').insert(rows);
    if (error) throw error;
  }

  async createTask(task: Tables['tasks']['Insert']): Promise<{ id: string }> {
    const { data, error } = await this.supabase.from('tasks').insert(task).select('id').single();
    if (error) throw error;
    if (!data) throw new Error('Failed to create task');
    return data as { id: string };
  }

  async logAudit(audit: Tables['audit_logs']['Insert']): Promise<void> {
    const { error } = await this.supabase.from('audit_logs').insert(audit);
    if (error) throw error;
  }

  async saveCheckResult(checkId: string, result: Json): Promise<void> {
    const { error } = await this.supabase
      .from('ops_checks')
      .update({
        last_run_at: new Date().toISOString(),
        last_result: result,
      })
      .eq('id', checkId);
    if (error) throw error;
  }

  async getTenants(): Promise<Tables['tenants']['Row'][]> {
    const { data, error } = await this.supabase.from('tenants').select('*');
    if (error) throw error;
    return data || [];
  }

  async getAgents(filters?: { 
    gte?: Record<string, string | number>, 
    neq?: Record<string, string | number>, 
    in?: Record<string, (string | number)[]> 
  }): Promise<Tables['agents']['Row'][]> {
    let query = this.supabase.from('agents').select('*');
    if (filters?.gte) {
      for (const [key, val] of Object.entries(filters.gte)) {
        query = query.gte(key as any, val);
      }
    }
    if (filters?.neq) {
      for (const [key, val] of Object.entries(filters.neq)) {
        query = query.neq(key as any, val);
      }
    }
    if (filters?.in) {
      for (const [key, val] of Object.entries(filters.in)) {
        query = query.in(key as any, val);
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getInstallationAnalytics(filters?: { 
    gte?: Record<string, string | number>, 
    in?: Record<string, (string | number)[]> 
  }): Promise<Tables['installation_analytics']['Row'][]> {
    let query = this.supabase.from('installation_analytics').select('*');
    if (filters?.gte) {
      for (const [key, val] of Object.entries(filters.gte)) {
        query = query.gte(key as any, val);
      }
    }
    if (filters?.in) {
      for (const [key, val] of Object.entries(filters.in)) {
        query = query.in(key as any, val);
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getJobs(filters?: { 
    eq?: Record<string, string | number>, 
    lt?: Record<string, string | number>,
    gte?: Record<string, string | number>,
    tenant_id?: string
  }): Promise<Tables['jobs']['Row'][]> {
    let query = this.supabase.from('jobs').select('*');
    if (filters?.tenant_id) {
      query = query.eq('tenant_id', filters.tenant_id);
    }
    if (filters?.eq) {
      for (const [key, val] of Object.entries(filters.eq)) {
        query = query.eq(key as any, val);
      }
    }
    if (filters?.gte) {
      for (const [key, val] of Object.entries(filters.gte)) {
        query = query.gte(key as any, val);
      }
    }
    if (filters?.lt) {
      for (const [key, val] of Object.entries(filters.lt)) {
        query = query.lt(key as any, val);
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async rpc<T extends keyof Database['public']['Functions']>(
    name: T,
    params?: Database['public']['Functions'][T]['Args']
  ): Promise<Database['public']['Functions'][T]['Returns']> {
    const { data, error } = await this.supabase.rpc(name, params as any);
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

  async getCount(table: keyof Tables, filters: { 
    eq?: Record<string, string | number>, 
    gte?: Record<string, string | number>, 
    lt?: Record<string, string | number>, 
    notNull?: string 
  }): Promise<number> {
    let query = (this.supabase.from(table as any) as any).select('*', { count: 'exact', head: true });
    if (filters.eq) {
      for (const [key, val] of Object.entries(filters.eq)) {
        query = query.eq(key as any, val);
      }
    }
    if (filters.gte) {
      for (const [key, val] of Object.entries(filters.gte)) {
        query = query.gte(key as any, val);
      }
    }
    if (filters.lt) {
      for (const [key, val] of Object.entries(filters.lt)) {
        query = query.lt(key as any, val);
      }
    }
    if (filters.notNull) {
      query = query.not(filters.notNull as any, 'is', null);
    }
    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  }

  async updateCronHealth(cronName: string, success: boolean, details: any): Promise<void> {
    const { error } = await this.supabase.rpc('update_cron_health', {
      p_cron_name: cronName,
      p_success: success,
      p_details: details,
    });
    if (error) {
      console.warn(`[SupabaseCheckRepository] Failed to update cron health for ${cronName}:`, error.message);
    }
  }

  async findExistingAlert(filters: Partial<Tables['system_alerts']['Row']> & { created_at_gte?: string }): Promise<{ id: string } | null> {
    let query = this.supabase.from('system_alerts').select('id');
    for (const [key, val] of Object.entries(filters)) {
      if (val === null) {
        query = (query as any).is(key as any, null);
      } else if (key === 'created_at_gte') {
        query = (query as any).gte('created_at', val as any);
      } else {
        query = (query as any).eq(key as any, val as any);
      }
    }
    const { data, error } = await (query as any).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  async findExistingInsight(filters: Partial<Tables['ai_insights']['Row']> & { created_at_gte?: string }): Promise<{ id: string } | null> {
    let query = this.supabase.from('ai_insights').select('id');
    for (const [key, val] of Object.entries(filters)) {
      if (key === 'created_at_gte') {
        query = (query as any).gte('created_at', val as any);
      } else {
        query = (query as any).eq(key as any, val as any);
      }
    }
    const { data, error } = await (query as any).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  async createInsight(insight: Tables['ai_insights']['Insert']): Promise<void> {
    const { error } = await this.supabase.from('ai_insights').insert(insight);
    if (error) throw error;
  }

  async getSilentFailures(): Promise<Views['v_cron_silent_failures']['Row'][]> {
    const { data, error } = await this.supabase.from('v_cron_silent_failures').select('*');
    if (error) throw error;
    return (data || []) as Views['v_cron_silent_failures']['Row'][];
  }

  async getUnhealthyAgents(): Promise<Views['v_agent_execution_health']['Row'][]> {
    const { data, error } = await this.supabase
      .from('v_agent_execution_health')
      .select('*')
      .neq('health_status', 'healthy')
      .neq('health_status', 'offline')
      .neq('health_status', 'never_connected');
    if (error) throw error;
    return (data || []) as Views['v_agent_execution_health']['Row'][];
  }

  async getStuckAgentLifecycle(): Promise<Views['v_agent_lifecycle_state']['Row'][]> {
    const { data, error } = await this.supabase
      .from('v_agent_lifecycle_state')
      .select('agent_id, tenant_id, agent_name')
      .eq('is_stuck', true)
      .limit(100);
    if (error) throw error;
    return (data || []) as Views['v_agent_lifecycle_state']['Row'][];
  }

  async getBatchCounts(table: keyof Tables, tenantIds: string[], filters: any): Promise<Record<string, number>> {
    if (tenantIds.length === 0) return {};
    
    const { data, error } = await (this.supabase as any).rpc('get_batch_counts', {
      p_table: table as string,
      p_tenant_ids: tenantIds,
      p_filters: filters
    });
    
    if (error) throw error;
    
    const counts: Record<string, number> = {};
    ((data as any[]) || []).forEach(row => {
      counts[row.tenant_id] = parseInt(row.count, 10);
    });
    
    return counts;
  }

  async getBusinessHoursBatch(tenantIds: string[]): Promise<Record<string, any>> {
    const { data, error } = await (this.supabase as any).rpc('get_business_hours_batch', {
      p_tenant_ids: tenantIds
    });
    if (error) throw error;
    const result: Record<string, any> = {};
    ((data as any[]) || []).forEach((row: any) => {
      result[row.tenant_id] = row.business_hours;
    });
    return result;
  }

  async getInstallationHealthBatch(tenantIds: string[]): Promise<any[]> {
    const { data, error } = await (this.supabase as any).rpc('get_installation_health_batch', {
      p_tenant_ids: tenantIds
    });
    if (error) throw error;
    return (data as any[]) || [];
  }

  async getTenantsComplianceScores(): Promise<any[]> {
    const { data, error } = await (this.supabase as any).rpc('get_tenants_compliance_scores');
    if (error) throw error;
    return (data as any[]) || [];
  }
}
