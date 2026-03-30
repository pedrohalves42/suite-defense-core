import { Job, JobType, JobStatus, JobPriority } from '@/domain/entities/Job';
import { JobExecution, type JobExecutionProps } from '@/domain/entities/JobExecution';
import type { Database } from '@/integrations/supabase/types';

type JobInsert = Database['public']['Tables']['jobs']['Insert'];
type JobExecutionInsert = Database['public']['Tables']['job_executions']['Insert'];

/**
 * Maps between Supabase DB rows and Job/JobExecution domain entities.
 */
export class JobMapper {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static toDomain(row: any): Job {
    return Job.reconstitute({
      id: row.id,
      agentId: row.agent_id,
      tenantId: row.tenant_id,
      type: row.type ?? 'run_script',
      payload: row.payload ?? {},
      priority: row.priority ?? JobPriority.NORMAL,
      timeoutSeconds: row.execution_time_seconds ?? 300,
      status: row.status ?? 'pending',
      retryCount: row.retry_count ?? 0,
      maxRetries: row.delivery_attempts ?? 3,
      deliveredAt: row.delivered_at ?? null,
      startedAt: row.started_at ?? null,
      completedAt: row.completed_at ?? null,
      result: row.output ?? null,
      error: row.error_message ?? null,
    });
  }

  static toPersistence(entity: Job): JobInsert {
    return {
      id: entity.id.value,
      agent_id: entity.agentId.value,
      agent_name: '',
      tenant_id: entity.tenantId.value,
      type: entity.type,
      status: entity.status,
      priority: entity.priority,
      payload: entity.payload,
      payload_hash: '',
      retry_count: entity.retryCount,
      delivered_at: entity.deliveredAt?.toISOString() ?? null,
      started_at: entity.startedAt?.toISOString() ?? null,
      completed_at: entity.completedAt?.toISOString() ?? null,
      output: entity.result,
      error_message: entity.error,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static executionToDomain(row: any): JobExecution {
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
      stdout: null,
      stderr: null,
      outputHash: row.output_hash ?? null,
      resultSignature: row.result_signature ?? null,
      signatureVerified: row.signature_verified ?? false,
      durationMs: row.execution_time_seconds ? row.execution_time_seconds * 1000 : null,
      createdAt: new Date(row.created_at),
    };

    return JobExecution.reconstitute(props);
  }

  static executionToPersistence(entity: JobExecution): JobExecutionInsert {
    return {
      id: entity.id.value,
      job_id: entity.jobId.value,
      agent_id: entity.agentId.value,
      agent_name: '',
      agent_version: '',
      tenant_id: entity.tenantId.value,
      execution_index: entity.executionIndex,
      nonce: entity.nonce,
      payload_hash: entity.payloadHash,
      started_at: entity.startedAt.toISOString(),
      completed_at: entity.completedAt?.toISOString() ?? null,
      exit_code: entity.exitCode,
      output_hash: entity.outputHash,
      result_signature: entity.resultSignature,
      signature_verified: entity.signatureVerified,
      execution_time_seconds: entity.durationMs ? Math.round(entity.durationMs / 1000) : null,
      previous_execution_hash: null,
    };
  }
}
