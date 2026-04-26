// @ts-nocheck
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
}
