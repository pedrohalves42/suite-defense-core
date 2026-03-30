import type { JobRepository } from '@/application/ports/output/JobRepository';
import type { Job, JobStatus } from '@/domain/entities/Job';
import type { JobExecution } from '@/domain/entities/JobExecution';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { TenantId } from '@/domain/value-objects/TenantId';
import { JobMapper } from '@/infrastructure/mappers/JobMapper';
import { supabase } from '@/integrations/supabase/client';

/**
 * Supabase adapter for JobRepository port.
 */
export class SupabaseJobRepository implements JobRepository {
  async findById(id: string): Promise<Job | null> {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, tenant_id, agent_name, agent_id, type, status, priority, payload, payload_hash, output, error_message, created_at, started_at, completed_at, expires_at, retry_count, delivery_attempts')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return JobMapper.toDomain(data);
  }

  async findPendingByAgent(agentId: AgentId): Promise<Job[]> {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, tenant_id, agent_name, agent_id, type, status, priority, payload, payload_hash, created_at, expires_at, retry_count, delivery_attempts')
      .eq('agent_id', agentId.value)
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(50);

    if (error || !data) return [];
    return data.map(row => JobMapper.toDomain(row));
  }

  async findByTenantAndStatus(tenantId: TenantId, status: JobStatus): Promise<Job[]> {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, tenant_id, agent_name, agent_id, type, status, priority, payload, payload_hash, created_at, expires_at')
      .eq('tenant_id', tenantId.value)
      .eq('status', status)
      .limit(500);

    if (error || !data) return [];
    return data.map(row => JobMapper.toDomain(row));
  }

  async findExpiredJobs(now: Date): Promise<Job[]> {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, tenant_id, agent_name, agent_id, type, status, priority, created_at, expires_at, retry_count, delivery_attempts')
      .in('status', ['pending', 'queued', 'delivered', 'running'])
      .lt('expires_at', now.toISOString())
      .limit(500);

    if (error || !data) return [];
    return data.map(row => JobMapper.toDomain(row));
  }

  async save(job: Job): Promise<void> {
    const persistence = JobMapper.toPersistence(job);
    const { error } = await supabase
      .from('jobs')
      .upsert(persistence, { onConflict: 'id' });

    if (error) {
      throw new Error(`Failed to save job: ${error.message}`);
    }
  }

  async saveExecution(execution: JobExecution): Promise<void> {
    const persistence = JobMapper.executionToPersistence(execution);
    const { error } = await supabase
      .from('job_executions')
      .upsert(persistence, { onConflict: 'id' });

    if (error) {
      throw new Error(`Failed to save job execution: ${error.message}`);
    }
  }

  async findExecutionsByJobId(jobId: string): Promise<JobExecution[]> {
    const { data, error } = await supabase
      .from('job_executions')
      .select('id, job_id, execution_index, execution_hash, previous_execution_hash, status, started_at, completed_at, error_message')
      .eq('job_id', jobId)
      .order('execution_index', { ascending: true });

    if (error || !data) return [];
    return data.map(row => JobMapper.executionToDomain(row));
  }
}
