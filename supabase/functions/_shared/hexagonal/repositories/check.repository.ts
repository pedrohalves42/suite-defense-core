// 100% typed repository for ops checks
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Database } from '../../database.types.ts';

export type Check = Database['public']['Tables']['ops_checks']['Row'];
export type CheckUpdate = Database['public']['Tables']['ops_checks']['Update'];

export interface ICheckRepository {
  listActiveChecks(): Promise<Check[]>;
  getCheckById(id: string): Promise<Check | null>;
  updateCheckStatus(id: string, update: CheckUpdate): Promise<void>;
  logScheduledJobRun(payload: any): Promise<void>;
  createSystemAlert(alert: any): Promise<void>;
  createTask(task: any): Promise<{ id: string }>;
  logAudit(audit: any): Promise<void>;
  // Novos métodos necessários para o refactoring
  saveCheckResult(checkId: string, result: any): Promise<void>;
  getTenants(): Promise<{ id: string; name: string }[]>;
  getAgents(filters?: any): Promise<any[]>;
  getInstallationAnalytics(filters?: any): Promise<any[]>;
  getJobs(filters?: any): Promise<any[]>;
  rpc(name: string, params?: any): Promise<any>;
}

export class SupabaseCheckRepository implements ICheckRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

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

  async createSystemAlert(alert: any): Promise<void> {
    const { error } = await this.supabase.from('system_alerts').insert(alert);
    if (error) throw error;
  }

  async createTask(task: any): Promise<{ id: string }> {
    const { data, error } = await this.supabase.from('tasks').insert(task).select('id').single();
    if (error) throw error;
    return data;
  }

  async logAudit(audit: any): Promise<void> {
    const { error } = await this.supabase.from('audit_logs').insert(audit);
    if (error) throw error;
  }

  async saveCheckResult(checkId: string, result: any): Promise<void> {
    const { error } = await this.supabase
      .from('ops_checks')
      .update({ 
        last_run_at: new Date().toISOString(),
        last_result: result 
      })
      .eq('id', checkId);
    if (error) throw error;
  }

  async getTenants(): Promise<{ id: string; name: string }[]|any> {
    const { data, error } = await this.supabase.from('tenants').select('id, name');
    if (error) throw error;
    return data || [];
  }

  async getAgents(filters?: any): Promise<any[]> {
    let query = this.supabase.from('agents').select('*');
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
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getInstallationAnalytics(filters?: any): Promise<any[]> {
    let query = this.supabase.from('installation_analytics').select('*');
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
    let query = this.supabase.from('jobs').select('*');
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
    const { data, error } = await this.supabase.rpc(name, params);
    if (error) throw error;
    return data;
  }
}
