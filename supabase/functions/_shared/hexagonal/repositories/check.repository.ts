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
}
