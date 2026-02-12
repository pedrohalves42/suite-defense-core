import { AgentUpdate, type AgentUpdateProps } from '@/domain/entities/AgentUpdate';
import { AgentId } from '@/domain/value-objects/AgentId';
import { UpdatePackageId } from '@/domain/value-objects/UpdatePackageId';
import { UpdateStatus } from '@/domain/constants';

/**
 * Maps between Supabase DB rows and AgentUpdate domain entities.
 */
export class AgentUpdateMapper {
  static toDomain(row: Record<string, any>): AgentUpdate {
    const props: AgentUpdateProps = {
      id: row.id,
      agentId: AgentId.create(row.agent_id).value,
      packageId: UpdatePackageId.create(row.package_id).value,
      status: row.status as UpdateStatus,
      downloadStartedAt: row.download_started_at ? new Date(row.download_started_at) : null,
      downloadCompletedAt: row.download_completed_at ? new Date(row.download_completed_at) : null,
      applyStartedAt: row.apply_started_at ? new Date(row.apply_started_at) : null,
      applyCompletedAt: row.apply_completed_at ? new Date(row.apply_completed_at) : null,
      errorMessage: row.error_message ?? null,
      rollbackReason: row.rollback_reason ?? null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
    return AgentUpdate.reconstitute(props);
  }

  static toPersistence(entity: AgentUpdate): Record<string, any> {
    return {
      id: entity.id,
      agent_id: entity.agentId.value,
      package_id: entity.packageId.value,
      status: entity.status,
      error_message: entity.errorMessage ?? null,
      rollback_reason: entity.rollbackReason ?? null,
    };
  }
}
