import { describe, it, expect, vi } from 'vitest';
import { AgentUpdate } from '../entities/AgentUpdate';
import { AgentId } from '../value-objects/AgentId';
import { AgentVersion } from '../value-objects/AgentVersion';
import { UpdatePackageId } from '../value-objects/UpdatePackageId';

describe('AgentUpdate Entity', () => {
  it('can be created from properties', () => {
    const agentId = AgentId.create('agent-1').value;
    const version = AgentVersion.create('1.0.0').value;
    const packageId = UpdatePackageId.create('pkg-1').value;

    const update = AgentUpdate.create({
      agentId,
      targetVersion: version,
      packageId,
    });

    expect(update.agentId.equals(agentId)).toBe(true);
    expect(update.targetVersion.equals(version)).toBe(true);
  });
});
