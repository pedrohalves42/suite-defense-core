import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Database } from '../../database.types.ts';

export type Job = Database['public']['Tables']['jobs']['Row'];
export type JobInsert = Database['public']['Tables']['jobs']['Insert'];
export type JobUpdate = Database['public']['Tables']['jobs']['Update'];

export interface IJobRepository {
  findFailedJobs(limit: number): Promise<Job[]>;
  updateJob(id: string, update: JobUpdate): Promise<void>;
  createJob(job: JobInsert): Promise<Job>;
  upsertDlq(dlqEntry: Database['public']['Tables']['failed_jobs_dlq']['Insert']): Promise<void>;
}

export class SupabaseJobRepository implements IJobRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async findFailedJobs(limit: number): Promise<Job[]> {
    const { data, error } = await this.supabase
      .from('jobs')
      .select('*')
      .eq('status', 'failed')
      .order('completed_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  async updateJob(id: string, update: JobUpdate): Promise<void> {
    const { error } = await this.supabase
      .from('jobs')
      .update(update)
      .eq('id', id);

    if (error) throw error;
  }

  async createJob(job: JobInsert): Promise<Job> {
    const { data, error } = await this.supabase
      .from('jobs')
      .insert(job)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async upsertDlq(dlqEntry: Database['public']['Tables']['failed_jobs_dlq']['Insert']): Promise<void> {
    const { error } = await this.supabase
      .from('failed_jobs_dlq')
      .upsert(dlqEntry, { onConflict: 'original_job_id' });

    if (error) throw error;
  }
}
