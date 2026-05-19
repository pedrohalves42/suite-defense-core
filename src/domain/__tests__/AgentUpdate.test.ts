import { describe, it, expect } from 'vitest';
import { AgentUpdate } from '../entities/AgentUpdate';
import { AgentId } from '../value-objects/AgentId';
import { UpdatePackageId } from '../value-objects/UpdatePackageId';

describe('AgentUpdate Entity', () => {
  it('can be created from properties', () => {
    const agentId = AgentId.create('00000000-0000-0000-0000-000000000001').value;
    const packageId = UpdatePackageId.create('00000000-0000-0000-0000-000000000002').value;

    const update = AgentUpdate.create(agentId, packageId);

    expect(update.agentId.equals(agentId)).toBe(true);
    expect(update.packageId.equals(packageId)).toBe(true);
  });
});
