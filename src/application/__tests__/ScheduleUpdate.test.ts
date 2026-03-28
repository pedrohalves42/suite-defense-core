import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScheduleUpdate } from '../use-cases/ScheduleUpdate';
import { AgentId } from '@/domain/value-objects/AgentId';
import { UpdatePackageId } from '@/domain/value-objects/UpdatePackageId';
import type { UpdatePackageRepository } from '../ports/output/UpdatePackageRepository';
import type { AgentUpdateRepository } from '../ports/output/AgentUpdateRepository';
import type { DomainEventDispatcher } from '../ports/output/DomainEventDispatcher';

describe('ScheduleUpdate Use Case', () => {
  let packageRepo: UpdatePackageRepository;
  let updateRepo: AgentUpdateRepository;
  let eventDispatcher: DomainEventDispatcher;
  let useCase: ScheduleUpdate;

  beforeEach(() => {
    packageRepo = { findLatestActive: vi.fn(), findById: vi.fn(), save: vi.fn() };
    updateRepo = { findById: vi.fn(), findActiveByAgentId: vi.fn(), save: vi.fn() };
    eventDispatcher = { dispatch: vi.fn(), dispatchAll: vi.fn() };
    useCase = new ScheduleUpdate(packageRepo, updateRepo, eventDispatcher);
  });

  it('throws when agent already has active update', async () => {
    vi.mocked(updateRepo.findActiveByAgentId).mockResolvedValue({ id: 'existing' } as unknown);

    await expect(useCase.execute({
      agentId: AgentId.generate(),
      packageId: UpdatePackageId.generate(),
    })).rejects.toThrow('already has an active update');
  });

  it('throws when package not found', async () => {
    vi.mocked(updateRepo.findActiveByAgentId).mockResolvedValue(null);
    vi.mocked(packageRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute({
      agentId: AgentId.generate(),
      packageId: UpdatePackageId.generate(),
    })).rejects.toThrow('not found');
  });

  it('throws when package is inactive', async () => {
    vi.mocked(updateRepo.findActiveByAgentId).mockResolvedValue(null);
    vi.mocked(packageRepo.findById).mockResolvedValue({ isActive: false } as unknown);

    await expect(useCase.execute({
      agentId: AgentId.generate(),
      packageId: UpdatePackageId.generate(),
    })).rejects.toThrow('not active');
  });

  it('creates update and dispatches event', async () => {
    vi.mocked(updateRepo.findActiveByAgentId).mockResolvedValue(null);
    vi.mocked(packageRepo.findById).mockResolvedValue({ isActive: true } as unknown);
    vi.mocked(updateRepo.save).mockResolvedValue();

    const result = await useCase.execute({
      agentId: AgentId.generate(),
      packageId: UpdatePackageId.generate(),
    });

    expect(result.updateId).toBeDefined();
    expect(result.status).toBe('pending');
    expect(updateRepo.save).toHaveBeenCalledOnce();
    expect(eventDispatcher.dispatch).toHaveBeenCalledOnce();
  });
});
