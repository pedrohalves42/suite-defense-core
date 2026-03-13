import { describe, it, expect } from 'vitest';
import { Job, JobType, JobStatus, JobPriority } from '../entities/Job';
import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';

const makeTenantId = () => TenantId.create(crypto.randomUUID()).value;

const makeJob = (overrides?: Partial<Parameters<typeof Job.create>[0]>) => {
  return Job.create({
    agentId: AgentId.generate(),
    tenantId: makeTenantId(),
    type: JobType.HEALTH_CHECK,
    ...overrides,
  });
};

describe('Job Entity', () => {
  describe('create', () => {
    it('creates with valid props', () => {
      const result = makeJob();
      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe(JobStatus.PENDING);
      expect(result.value.retryCount).toBe(0);
      expect(result.value.maxRetries).toBe(3);
    });

    it('fails without agentId', () => {
      const result = Job.create({
        agentId: null as any,
        tenantId: makeTenantId(),
        type: JobType.HEALTH_CHECK,
      });
      expect(result.isSuccess).toBe(false);
    });

    it('fails with invalid job type', () => {
      const result = Job.create({
        agentId: AgentId.generate(),
        tenantId: makeTenantId(),
        type: 'invalid' as any,
      });
      expect(result.isSuccess).toBe(false);
    });

    it('accepts custom priority and timeout', () => {
      const result = makeJob({ priority: JobPriority.CRITICAL, timeoutSeconds: 600 });
      expect(result.value.priority).toBe(JobPriority.CRITICAL);
      expect(result.value.timeoutSeconds).toBe(600);
    });
  });

  describe('FSM transitions', () => {
    it('follows happy path: pending → queued → delivered → running → completed', () => {
      const job = makeJob().value;

      expect(job.queue().isSuccess).toBe(true);
      expect(job.status).toBe(JobStatus.QUEUED);

      expect(job.deliver().isSuccess).toBe(true);
      expect(job.status).toBe(JobStatus.DELIVERED);

      expect(job.start().isSuccess).toBe(true);
      expect(job.status).toBe(JobStatus.RUNNING);

      expect(job.complete({ ok: true }).isSuccess).toBe(true);
      expect(job.status).toBe(JobStatus.COMPLETED);
      expect(job.result).toEqual({ ok: true });
    });

    it('cannot deliver from pending (must queue first)', () => {
      const job = makeJob().value;
      expect(job.deliver().isSuccess).toBe(false);
    });

    it('cannot start from pending', () => {
      const job = makeJob().value;
      expect(job.start().isSuccess).toBe(false);
    });

    it('cannot complete from delivered (must start first)', () => {
      const job = makeJob().value;
      job.queue();
      job.deliver();
      expect(job.complete({}).isSuccess).toBe(false);
    });
  });

  describe('fail and retry', () => {
    it('retries up to maxRetries then fails permanently', () => {
      const job = makeJob({ maxRetries: 2 }).value;
      job.queue();
      job.deliver();
      job.start();

      // Retry 1
      job.fail('error 1');
      expect(job.status).toBe(JobStatus.PENDING);
      expect(job.retryCount).toBe(1);

      // Retry 2 — still under maxRetries
      job.queue();
      job.deliver();
      job.start();
      job.fail('error 2');
      expect(job.status).toBe(JobStatus.PENDING);
      expect(job.retryCount).toBe(2);

      // Retry 3 — now at maxRetries, should fail permanently
      job.queue();
      job.deliver();
      job.start();
      job.fail('error 3');
      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.retryCount).toBe(2); // didn't increment past max
      expect(job.isTerminal()).toBe(true);
    });
  });

  describe('timeout', () => {
    it('can timeout from running', () => {
      const job = makeJob().value;
      job.queue();
      job.deliver();
      job.start();
      expect(job.timeout().isSuccess).toBe(true);
      expect(job.status).toBe(JobStatus.TIMEOUT);
      expect(job.isTerminal()).toBe(true);
    });

    it('cannot timeout from pending', () => {
      const job = makeJob().value;
      expect(job.timeout().isSuccess).toBe(false);
    });
  });

  describe('cancel', () => {
    it('can cancel from non-terminal state', () => {
      const job = makeJob().value;
      expect(job.cancel().isSuccess).toBe(true);
      expect(job.status).toBe(JobStatus.CANCELLED);
    });

    it('cannot cancel from completed', () => {
      const job = makeJob().value;
      job.queue();
      job.deliver();
      job.start();
      job.complete({});
      expect(job.cancel().isSuccess).toBe(false);
    });
  });

  describe('expire', () => {
    it('can expire from non-terminal state', () => {
      const job = makeJob().value;
      expect(job.expire().isSuccess).toBe(true);
      expect(job.status).toBe(JobStatus.EXPIRED);
    });

    it('cannot expire from failed', () => {
      const job = makeJob({ maxRetries: 0 }).value;
      job.queue();
      job.deliver();
      job.start();
      job.fail('error');
      expect(job.expire().isSuccess).toBe(false);
    });
  });

  describe('isTerminal', () => {
    it('returns true for completed, failed, timeout, cancelled, expired', () => {
      const statuses = [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.TIMEOUT, JobStatus.CANCELLED, JobStatus.EXPIRED];
      for (const s of statuses) {
        const job = Job.reconstitute({
          id: crypto.randomUUID(),
          agentId: crypto.randomUUID(),
          tenantId: crypto.randomUUID(),
          type: JobType.HEALTH_CHECK,
          payload: {},
          priority: 1,
          timeoutSeconds: 300,
          status: s,
          retryCount: 0,
          maxRetries: 3,
          deliveredAt: null,
          startedAt: null,
          completedAt: null,
          result: null,
          error: null,
        });
        expect(job.isTerminal()).toBe(true);
      }
    });
  });
});
