import { Job, type JobProps, JobType, JobStatus, JobPriority } from '@/domain/entities/Job';
import { JobExecution, type JobExecutionProps } from '@/domain/entities/JobExecution';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';

/**
 * Maps between Supabase DB rows and Job/JobExecution domain entities.
 */
export class JobMapper {
  static toDomain(row: Record<string, any>): Job {
    const agentIdResult = AgentId.create(row.agent_id);
    if (agentIdResult.isFailure) throw new Error(`Invalid agent_id in job row: ${row.agent_id}`);

    const tenantIdResult = TenantId.create(row.tenant_id);
    if (tenantIdResult.isFailure) throw new Error(`Invalid tenant_id in job row: ${row.tenant_id}`);

    const props: JobProps = {
      id: row.id,
      agentId: agentIdResult.value,
      agentName: row.agent_name ?? '',
      tenantId: tenantIdResult.value,
      type: (row.type ?? 'run_script') as JobType,
      status: (row.status ?? 'pending') as JobStatus,
      priority: (row.priority ?? JobPriority.NORMAL) as JobPriority,
      payload: row.payload ?? {},
      payloadHash: row.payload_hash ?? null,
      approved: row.approved ?? false,
      retryCount: row.retry_count ?? 0,
      maxRetries: row.max_retries ?? 3,
      expiresAt: row.expires_at ? new Date(row.expires_at) : new Date(Date.now() + 4 * 60 * 60 * 1000),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at ?? row.created_at),
    };

    return Job.reconstitute(props);
  }

  static toPersistence(entity: Job): Record<string, any> {
    return {
      id: entity.id,
      agent_id: entity.agentId.value,
      agent_name: entity.agentName,
      tenant_id: entity.tenantId.value,
      type: entity.type,
      status: entity.status,
      priority: entity.priority,
      payload: entity.payload,
      payload_hash: entity.payloadHash,
      approved: entity.approved,
      retry_count: entity.retryCount,
      max_retries: entity.maxRetries,
      expires_at: entity.expiresAt.toISOString(),
    };
  }

  static executionToDomain(row: Record<string, any>): JobExecution {
    const props: JobExecutionProps = {
      id: row.id,
      jobId: row.job_id,
      agentId: row.agent_id,
      executionIndex: row.execution_index ?? 0,
      nonce: row.nonce ?? '',
      payloadHash: row.payload_hash ?? '',
      startedAt: new Date(row.started_at ?? row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      exitCode: row.exit_code ?? null,
      stdout: row.stdout ?? null,
      stderr: row.stderr ?? null,
      outputHash: row.output_hash ?? null,
      resultSignature: row.result_signature ?? null,
      signatureVerified: row.signature_verified ?? false,
      durationMs: row.duration_ms ?? null,
      createdAt: new Date(row.created_at),
    };

    return JobExecution.reconstitute(props);
  }

  static executionToPersistence(entity: JobExecution): Record<string, any> {
    return {
      id: entity.id,
      job_id: entity.jobId,
      agent_id: entity.agentId,
      execution_index: entity.executionIndex,
      nonce: entity.nonce,
      payload_hash: entity.payloadHash,
      started_at: entity.startedAt.toISOString(),
      completed_at: entity.completedAt?.toISOString() ?? null,
      exit_code: entity.exitCode,
      stdout: entity.stdout,
      stderr: entity.stderr,
      output_hash: entity.outputHash,
      result_signature: entity.resultSignature,
      signature_verified: entity.signatureVerified,
      duration_ms: entity.durationMs,
    };
  }
}
