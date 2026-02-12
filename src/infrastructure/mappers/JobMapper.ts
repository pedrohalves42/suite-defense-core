import { Job, JobType, JobStatus, JobPriority } from '@/domain/entities/Job';
import { JobExecution, type JobExecutionProps } from '@/domain/entities/JobExecution';

/**
 * Maps between Supabase DB rows and Job/JobExecution domain entities.
 */
export class JobMapper {
  static toDomain(row: Record<string, any>): Job {
    return Job.reconstitute({
      id: row.id,
      agentId: row.agent_id,
      tenantId: row.tenant_id,
      type: row.type ?? 'run_script',
      payload: row.payload ?? {},
      priority: row.priority ?? JobPriority.NORMAL,
      timeoutSeconds: row.timeout_seconds ?? 300,
      status: row.status ?? 'pending',
      retryCount: row.retry_count ?? 0,
      maxRetries: row.max_retries ?? 3,
      deliveredAt: row.delivered_at ?? null,
      startedAt: row.started_at ?? null,
      completedAt: row.completed_at ?? null,
      result: row.result ?? null,
      error: row.error ?? null,
    });
  }

  static toPersistence(entity: Job): Record<string, any> {
    return {
      id: entity.id.value,
      agent_id: entity.agentId.value,
      tenant_id: entity.tenantId.value,
      type: entity.type,
      status: entity.status,
      priority: entity.priority,
      payload: entity.payload,
      timeout_seconds: entity.timeoutSeconds,
      retry_count: entity.retryCount,
      max_retries: entity.maxRetries,
      delivered_at: entity.deliveredAt?.toISOString() ?? null,
      started_at: entity.startedAt?.toISOString() ?? null,
      completed_at: entity.completedAt?.toISOString() ?? null,
      result: entity.result,
      error: entity.error,
    };
  }

  static executionToDomain(row: Record<string, any>): JobExecution {
    const props: JobExecutionProps = {
      id: row.id,
      jobId: row.job_id,
      agentId: row.agent_id,
      tenantId: row.tenant_id,
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
      id: entity.id.value,
      job_id: entity.jobId.value,
      agent_id: entity.agentId.value,
      tenant_id: entity.tenantId.value,
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
