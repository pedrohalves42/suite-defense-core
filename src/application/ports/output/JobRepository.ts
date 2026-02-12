import type { Job } from '@/domain/entities/Job';
import type { JobExecution } from '@/domain/entities/JobExecution';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { TenantId } from '@/domain/value-objects/TenantId';
import type { JobStatus } from '@/domain/entities/Job';

/**
 * Output port: Persistence abstraction for Job and JobExecution entities.
 */
export interface JobRepository {
  findById(id: string): Promise<Job | null>;

  findPendingByAgent(agentId: AgentId): Promise<Job[]>;

  findByTenantAndStatus(tenantId: TenantId, status: JobStatus): Promise<Job[]>;

  findExpiredJobs(now: Date): Promise<Job[]>;

  save(job: Job): Promise<void>;

  saveExecution(execution: JobExecution): Promise<void>;

  findExecutionsByJobId(jobId: string): Promise<JobExecution[]>;
}
