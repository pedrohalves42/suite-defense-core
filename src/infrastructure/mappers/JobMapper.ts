import { Job, JobType, JobStatus, JobPriority } from '@/domain/entities/Job';
import { JobExecution, type JobExecutionProps } from '@/domain/entities/JobExecution';
import type { JobInsert, JobExecutionInsert } from '@/infrastructure/types/supabase-tables';

/**
 * Maps between Supabase DB rows and Job/JobExecution domain entities.
 */
export class JobMapper {
  static toDomain(row: Record<string, unknown>): Job {
    return Job.reconstitute({
      id: row.id as string,
      agentId: row.agent_id as string,
      tenantId: row.tenant_id as string,
      type: (row.type as string) ?? 'run_script',
      payload: (row.payload as Record<string, unknown>) ?? {},
      priority: (row.priority as number) ?? JobPriority.NORMAL,
      timeoutSeconds: (row.timeout_seconds as number) ?? 300,
      status: (row.status as string) ?? 'pending',
      retryCount: (row.retry_count as number) ?? 0,
      maxRetries: (row.max_retries as number) ?? 3,
      deliveredAt: (row.delivered_at as string) ?? null,
      startedAt: (row.started_at as string) ?? null,
      completedAt: (row.completed_at as string) ?? null,
      result: (row.result as Record<string, unknown>) ?? null,
      error: (row.error as string) ?? null,
    });
  }

  static toPersistence(entity: Job): JobInsert {
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
      error_message: entity.error,
    };
  }

  static executionToDomain(row: Record<string, unknown>): JobExecution {
    const props: JobExecutionProps = {
      id: row.id as string,
      jobId: row.job_id as string,
      agentId: row.agent_id as string,
      tenantId: row.tenant_id as string,
      executionIndex: (row.execution_index as number) ?? 0,
      nonce: (row.nonce as string) ?? '',
      payloadHash: (row.payload_hash as string) ?? '',
      startedAt: new Date((row.started_at as string) ?? (row.created_at as string)),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
      exitCode: (row.exit_code as number) ?? null,
      stdout: (row.stdout as string) ?? null,
      stderr: (row.stderr as string) ?? null,
      outputHash: (row.output_hash as string) ?? null,
      resultSignature: (row.result_signature as string) ?? null,
      signatureVerified: (row.signature_verified as boolean) ?? false,
      durationMs: (row.duration_ms as number) ?? null,
      createdAt: new Date(row.created_at as string),
    };

    return JobExecution.reconstitute(props);
  }

  static executionToPersistence(entity: JobExecution): JobExecutionInsert {
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
