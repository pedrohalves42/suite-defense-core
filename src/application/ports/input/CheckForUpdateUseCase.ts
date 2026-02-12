import { AgentVersion } from '@/domain/value-objects/AgentVersion';
import { UpdateChecksum } from '@/domain/value-objects/UpdateChecksum';
import { AgentId } from '@/domain/value-objects/AgentId';
import { Platform, UpdateChannel } from '@/domain/constants';

export interface CheckForUpdateCommand {
  agentId: AgentId;
  currentVersion: AgentVersion;
  currentChecksum: UpdateChecksum;
  platform: Platform;
  channel: UpdateChannel;
}

export interface UpdateAvailableResult {
  packageId: string;
  version: string;
  checksum: string;
  size: number;
  releaseNotes: string;
  isHotfix: boolean;
}

/**
 * Input port: Determines if an update is available for a given agent.
 */
export interface CheckForUpdateUseCase {
  execute(command: CheckForUpdateCommand): Promise<UpdateAvailableResult | null>;
}
