import type { JobRepository } from '@/application/ports/output/JobRepository';
import { Job, type JobStatus } from '@/domain/entities/Job';
import type { JobExecution } from '@/domain/entities/JobExecution';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { TenantId } from '@/domain/value-objects/TenantId';
import { JobMapper } from '../mappers/JobMapper';
import type { SupabaseClient } from '@supabase/supabase-js';

const JOBS_TABLE = 'jobs';
const EXECUTIONS_TABLE = 'job_executions';

/**
 * Supabase adapter implementing the JobRepository output port.
 */
export class SupabaseJobRepository implements JobRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findById(id: string): Promise<Job | null> {
    const { data, error } = await this.client
      .from(JOBS_TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Failed to find job: ${error.message}`);
    if (!data) return null;

    return JobMapper.toDomain(data);
  }

  async findPendingByAgent(agentId: AgentId): Promise<Job[]> {
    const { data, error } = await this.client
      .from(JOBS_TABLE)
      .select('*')
      .eq('agent_id', agentId.value)
      .in('status', ['pending', 'queued', 'delivered'])
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to find pending jobs: ${error.message}`);
    return (data ?? []).map(JobMapper.toDomain);
  }

  async findByTenantAndStatus(tenantId: TenantId, status: JobStatus): Promise<Job[]> {
    const { data, error } = await this.client
      .from(JOBS_TABLE)
      .select('*')
      .eq('tenant_id', tenantId.value)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to find jobs by status: ${error.message}`);
    return (data ?? []).map(JobMapper.toDomain);
  }

  async findExpiredJobs(now: Date): Promise<Job[]> {
    const { data, error } = await this.client
      .from(JOBS_TABLE)
      .select('*')
      .in('status', ['pending', 'queued', 'delivered', 'running'])
      .lt('expires_at', now.toISOString());

    if (error) throw new Error(`Failed to find expired jobs: ${error.message}`);
    return (data ?? []).map(JobMapper.toDomain);
  }

  async save(job: Job): Promise<void> {
    const row = JobMapper.toPersistence(job);
    const { error } = await this.client
      .from(JOBS_TABLE)
      .upsert(row, { onConflict: 'id' });

    if (error) throw new Error(`Failed to save job: ${error.message}`);
  }

  async saveExecution(execution: JobExecution): Promise<void> {
    const row = JobMapper.executionToPersistence(execution);
    const { error } = await this.client
      .from(EXECUTIONS_TABLE)
      .insert(row);

    if (error) throw new Error(`Failed to save execution: ${error.message}`);
  }

  async findExecutionsByJobId(jobId: string): Promise<JobExecution[]> {
    const { data, error } = await this.client
      .from(EXECUTIONS_TABLE)
      .select('*')
      .eq('job_id', jobId)
      .order('execution_index', { ascending: true });

    if (error) throw new Error(`Failed to find executions: ${error.message}`);
    return (data ?? []).map(JobMapper.executionToDomain);
  }
}
