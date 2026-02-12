import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessUpdateStatus } from '../use-cases/ProcessUpdateStatus';
import { AgentUpdate } from '@/domain/entities/AgentUpdate';
import { AgentId } from '@/domain/value-objects/AgentId';
import { UpdatePackageId } from '@/domain/value-objects/UpdatePackageId';
import { UpdateStatus } from '@/domain/constants';
import type { AgentUpdateRepository } from '../ports/output/AgentUpdateRepository';
import type { DomainEventDispatcher } from '../ports/output/DomainEventDispatcher';

describe('ProcessUpdateStatus Use Case', () => {
  let updateRepo: AgentUpdateRepository;
  let eventDispatcher: DomainEventDispatcher;
  let useCase: ProcessUpdateStatus;

  beforeEach(() => {
    updateRepo = { findById: vi.fn(), findActiveByAgentId: vi.fn(), save: vi.fn() };
    eventDispatcher = { dispatch: vi.fn(), dispatchAll: vi.fn() };
    useCase = new ProcessUpdateStatus(updateRepo, eventDispatcher);
  });

  it('throws when update not found', async () => {
    vi.mocked(updateRepo.findById).mockResolvedValue(null);
    await expect(useCase.execute({
      updateId: 'nonexistent',
      newStatus: 'downloading',
    })).rejects.toThrow('not found');
  });

  it('transitions to downloading', async () => {
    const update = AgentUpdate.create(AgentId.generate(), UpdatePackageId.generate());
    vi.mocked(updateRepo.findById).mockResolvedValue(update);

    const result = await useCase.execute({
      updateId: update.id,
      newStatus: 'downloading',
    });

    expect(result.previousStatus).toBe(UpdateStatus.PENDING);
    expect(result.currentStatus).toBe(UpdateStatus.DOWNLOADING);
    expect(eventDispatcher.dispatch).toHaveBeenCalledOnce();
    expect(updateRepo.save).toHaveBeenCalledOnce();
  });

  it('transitions to applying (download + apply)', async () => {
    const update = AgentUpdate.create(AgentId.generate(), UpdatePackageId.generate());
    update.startDownload(); // move to downloading first
    vi.mocked(updateRepo.findById).mockResolvedValue(update);

    const result = await useCase.execute({
      updateId: update.id,
      newStatus: 'applying',
    });

    expect(result.currentStatus).toBe(UpdateStatus.APPLYING);
  });

  it('transitions to completed', async () => {
    const update = AgentUpdate.create(AgentId.generate(), UpdatePackageId.generate());
    update.startDownload();
    update.completeDownload();
    update.startApply();
    vi.mocked(updateRepo.findById).mockResolvedValue(update);

    const result = await useCase.execute({
      updateId: update.id,
      newStatus: 'completed',
    });

    expect(result.currentStatus).toBe(UpdateStatus.COMPLETED);
    expect(eventDispatcher.dispatch).toHaveBeenCalledOnce();
  });

  it('transitions to failed with error message', async () => {
    const update = AgentUpdate.create(AgentId.generate(), UpdatePackageId.generate());
    vi.mocked(updateRepo.findById).mockResolvedValue(update);

    const result = await useCase.execute({
      updateId: update.id,
      newStatus: 'failed',
      errorMessage: 'disk full',
    });

    expect(result.currentStatus).toBe(UpdateStatus.FAILED);
    expect(eventDispatcher.dispatch).toHaveBeenCalledOnce();
  });
});
