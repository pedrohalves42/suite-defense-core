import { describe, it, expect } from 'vitest';
import { Job, JobType, JobStatus } from '../Job';
import { AgentId } from '../../value-objects/AgentId';
import { TenantId } from '../../value-objects/TenantId';

function makeJob(overrides?: Partial<Parameters<typeof Job.create>[0]>) {
  return Job.create({
    agentId: AgentId.generate(),
    tenantId: TenantId.create(crypto.randomUUID()).value,
    type: JobType.HEALTH_CHECK,
    ...overrides,
  });
}

describe('Job Entity', () => {
  describe('create', () => {
    it('creates with PENDING status', () => {
      const result = makeJob();
      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe(JobStatus.PENDING);
    });

    it('defaults to 3 max retries', () => {
      const job = makeJob().value;
      expect(job.maxRetries).toBe(3);
    });

    it('defaults to 300s timeout', () => {
      const job = makeJob().value;
      expect(job.timeoutSeconds).toBe(300);
    });

    it('rejects missing agentId', () => {
      const result = Job.create({
        agentId: null as any,
        tenantId: TenantId.create(crypto.randomUUID()).value,
        type: JobType.HEALTH_CHECK,
      });
      expect(result.isFailure).toBe(true);
    });
  });

  describe('FSM: happy path', () => {
    it('follows pending → queued → delivered → running → completed', () => {
      const job = makeJob().value;

      expect(job.queue().isSuccess).toBe(true);
      expect(job.status).toBe(JobStatus.QUEUED);

      expect(job.deliver().isSuccess).toBe(true);
      expect(job.status).toBe(JobStatus.DELIVERED);

      expect(job.start().isSuccess).toBe(true);
      expect(job.status).toBe(JobStatus.RUNNING);

      expect(job.complete({ exitCode: 0 }).isSuccess).toBe(true);
      expect(job.status).toBe(JobStatus.COMPLETED);
      expect(job.isTerminal()).toBe(true);
    });
  });

  describe('FSM: invalid transitions', () => {
    it('cannot deliver from PENDING (must queue first)', () => {
      const job = makeJob().value;
      expect(job.deliver().isFailure).toBe(true);
    });

    it('cannot start from QUEUED (must deliver first)', () => {
      const job = makeJob().value;
      job.queue();
      expect(job.start().isFailure).toBe(true);
    });

    it('cannot complete from DELIVERED (must start first)', () => {
      const job = makeJob().value;
      job.queue();
      job.deliver();
      expect(job.complete({}).isFailure).toBe(true);
    });

    it('cannot queue from COMPLETED', () => {
      const job = makeJob().value;
      job.queue();
      job.deliver();
      job.start();
      job.complete({});
      expect(job.queue().isFailure).toBe(true);
    });
  });

  describe('retry logic', () => {
    it('retries by resetting to PENDING', () => {
      const job = makeJob({ maxRetries: 2 }).value;
      job.queue();
      job.deliver();
      job.start();

      const result = job.fail('network error');
      expect(result.isSuccess).toBe(true);
      expect(job.status).toBe(JobStatus.PENDING); // re-queued
      expect(job.retryCount).toBe(1);
    });

    it('fails permanently after max retries', () => {
      const job = makeJob({ maxRetries: 1 }).value;

      // First attempt
      job.queue();
      job.deliver();
      job.start();
      job.fail('error 1');
      expect(job.status).toBe(JobStatus.PENDING);
      expect(job.retryCount).toBe(1);

      // Second attempt (reaches max)
      job.queue();
      job.deliver();
      job.start();
      job.fail('error 2');
      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.isTerminal()).toBe(true);
    });

    it('emits JobRetryScheduledEvent on retry', () => {
      const job = makeJob({ maxRetries: 2 }).value;
      job.queue();
      job.deliver();
      job.start();
      job.fail('error');

      const retryEvents = job.domainEvents.filter(e => e.eventType === 'job.retry_scheduled');
      expect(retryEvents.length).toBe(1);
    });
  });

  describe('timeout', () => {
    it('times out from RUNNING', () => {
      const job = makeJob().value;
      job.queue();
      job.deliver();
      job.start();

      const result = job.timeout();
      expect(result.isSuccess).toBe(true);
      expect(job.status).toBe(JobStatus.TIMEOUT);
      expect(job.isTerminal()).toBe(true);
    });

    it('cannot timeout from PENDING', () => {
      const job = makeJob().value;
      expect(job.timeout().isFailure).toBe(true);
    });
  });

  describe('cancel', () => {
    it('can cancel from any non-terminal state', () => {
      const job = makeJob().value;
      expect(job.cancel().isSuccess).toBe(true);
      expect(job.status).toBe(JobStatus.CANCELLED);
    });

    it('cannot cancel already completed job', () => {
      const job = makeJob().value;
      job.queue();
      job.deliver();
      job.start();
      job.complete({});
      expect(job.cancel().isFailure).toBe(true);
    });
  });

  describe('expiration check', () => {
    it('not expired if not running', () => {
      const job = makeJob().value;
      expect(job.isExpired()).toBe(false);
    });

    it('not expired immediately after start', () => {
      const job = makeJob({ timeoutSeconds: 300 }).value;
      job.queue();
      job.deliver();
      job.start();
      expect(job.isExpired()).toBe(false);
    });
  });

  describe('reconstitute', () => {
    it('reconstitutes from DB props', () => {
      const job = Job.reconstitute({
        id: crypto.randomUUID(),
        agentId: crypto.randomUUID(),
        tenantId: crypto.randomUUID(),
        type: 'health_check',
        payload: { foo: 'bar' },
        priority: 2,
        timeoutSeconds: 600,
        status: 'running',
        retryCount: 1,
        maxRetries: 3,
        deliveredAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: null,
        result: null,
        error: null,
      });

      expect(job.status).toBe(JobStatus.RUNNING);
      expect(job.retryCount).toBe(1);
      expect((job.payload as Record<string, unknown>).foo).toBe('bar');
    });
  });
});
