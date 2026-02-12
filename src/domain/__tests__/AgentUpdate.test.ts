import { describe, it, expect } from 'vitest';
import { AgentUpdate } from '../entities/AgentUpdate';
import { AgentId } from '../value-objects/AgentId';
import { UpdatePackageId } from '../value-objects/UpdatePackageId';
import { UpdateStatus } from '../constants';

function makeUpdate() {
  return AgentUpdate.create(AgentId.generate(), UpdatePackageId.generate());
}

describe('AgentUpdate Entity', () => {
  describe('create', () => {
    it('starts in PENDING status', () => {
      const update = makeUpdate();
      expect(update.status).toBe(UpdateStatus.PENDING);
      expect(update.isTerminal()).toBe(false);
    });

    it('generates unique id', () => {
      const u1 = makeUpdate();
      const u2 = makeUpdate();
      expect(u1.id).not.toBe(u2.id);
    });
  });

  describe('FSM transitions', () => {
    it('PENDING → DOWNLOADING', () => {
      const update = makeUpdate();
      update.startDownload();
      expect(update.status).toBe(UpdateStatus.DOWNLOADING);
      expect(update.downloadStartedAt).toBeInstanceOf(Date);
    });

    it('DOWNLOADING → APPLYING', () => {
      const update = makeUpdate();
      update.startDownload();
      update.completeDownload();
      update.startApply();
      expect(update.status).toBe(UpdateStatus.APPLYING);
      expect(update.applyStartedAt).toBeInstanceOf(Date);
    });

    it('APPLYING → COMPLETED', () => {
      const update = makeUpdate();
      update.startDownload();
      update.completeDownload();
      update.startApply();
      update.complete();
      expect(update.status).toBe(UpdateStatus.COMPLETED);
      expect(update.isTerminal()).toBe(true);
    });

    it('any non-terminal → FAILED', () => {
      const update = makeUpdate();
      update.fail('network error');
      expect(update.status).toBe(UpdateStatus.FAILED);
      expect(update.errorMessage).toBe('network error');
      expect(update.isTerminal()).toBe(true);
    });

    it('COMPLETED → ROLLED_BACK', () => {
      const update = makeUpdate();
      update.startDownload();
      update.completeDownload();
      update.startApply();
      update.complete();
      update.rollback('critical bug');
      expect(update.status).toBe(UpdateStatus.ROLLED_BACK);
      expect(update.rollbackReason).toBe('critical bug');
      expect(update.isTerminal()).toBe(true);
    });

    it('rejects invalid transition PENDING → APPLYING', () => {
      const update = makeUpdate();
      expect(() => update.startApply()).toThrow();
    });

    it('rejects transition from FAILED', () => {
      const update = makeUpdate();
      update.fail('error');
      expect(() => update.startDownload()).toThrow();
    });

    it('rejects transition from ROLLED_BACK', () => {
      const update = makeUpdate();
      update.startDownload();
      update.completeDownload();
      update.startApply();
      update.complete();
      update.rollback('reason');
      expect(() => update.startDownload()).toThrow();
    });
  });

  describe('reconstitute', () => {
    it('restores from props', () => {
      const agentId = AgentId.generate();
      const packageId = UpdatePackageId.generate();
      const now = new Date();

      const update = AgentUpdate.reconstitute({
        id: crypto.randomUUID(),
        agentId,
        packageId,
        status: UpdateStatus.DOWNLOADING,
        downloadStartedAt: now,
        downloadCompletedAt: null,
        applyStartedAt: null,
        applyCompletedAt: null,
        errorMessage: null,
        rollbackReason: null,
        createdAt: now,
        updatedAt: now,
      });

      expect(update.status).toBe(UpdateStatus.DOWNLOADING);
      expect(update.agentId.equals(agentId)).toBe(true);
    });
  });
});
