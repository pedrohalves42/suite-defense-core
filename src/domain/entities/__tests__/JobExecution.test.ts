import { describe, it, expect } from 'vitest';
import { JobExecution } from '../JobExecution';
import { BusinessRuleViolationError } from '../../shared/DomainError';

describe('JobExecution Entity', () => {
  function makeExecution() {
    return JobExecution.start({
      jobId: crypto.randomUUID(),
      agentId: crypto.randomUUID(),
      tenantId: crypto.randomUUID(),
      executionIndex: 1,
      nonce: crypto.randomUUID(),
      payloadHash: 'abc123def456',
    });
  }

  describe('start', () => {
    it('creates with timestamps set', () => {
      const exec = makeExecution();
      expect(exec.startedAt).toBeInstanceOf(Date);
      expect(exec.createdAt).toBeInstanceOf(Date);
      expect(exec.completedAt).toBeNull();
      expect(exec.signatureVerified).toBe(false);
    });

    it('is not completed initially', () => {
      const exec = makeExecution();
      expect(exec.isCompleted()).toBe(false);
    });
  });

  describe('recordResult', () => {
    it('records result with exit code', () => {
      const exec = makeExecution();
      exec.recordResult({
        exitCode: 0,
        stdout: 'ok',
        outputHash: 'hash123',
      });

      expect(exec.isCompleted()).toBe(true);
      expect(exec.exitCode).toBe(0);
      expect(exec.stdout).toBe('ok');
      expect(exec.outputHash).toBe('hash123');
      expect(exec.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('is immutable after result recorded', () => {
      const exec = makeExecution();
      exec.recordResult({ exitCode: 0, outputHash: 'h1' });

      expect(() => {
        exec.recordResult({ exitCode: 1, outputHash: 'h2' });
      }).toThrow(BusinessRuleViolationError);
    });

    it('detects success (exit code 0)', () => {
      const exec = makeExecution();
      exec.recordResult({ exitCode: 0, outputHash: 'h' });
      expect(exec.isSuccess()).toBe(true);
    });

    it('detects failure (exit code != 0)', () => {
      const exec = makeExecution();
      exec.recordResult({ exitCode: 1, outputHash: 'h' });
      expect(exec.isSuccess()).toBe(false);
    });
  });

  describe('signature verification', () => {
    it('marks signature as verified', () => {
      const exec = makeExecution();
      exec.recordResult({
        exitCode: 0,
        outputHash: 'h',
        resultSignature: 'sig123',
      });
      exec.markSignatureVerified();
      expect(exec.signatureVerified).toBe(true);
    });

    it('rejects verification without signature', () => {
      const exec = makeExecution();
      exec.recordResult({ exitCode: 0, outputHash: 'h' });
      expect(() => exec.markSignatureVerified()).toThrow(BusinessRuleViolationError);
    });
  });

  describe('payload integrity', () => {
    it('validates matching hash', () => {
      const exec = makeExecution();
      expect(exec.validatePayloadIntegrity('abc123def456')).toBe(true);
    });

    it('rejects mismatched hash', () => {
      const exec = makeExecution();
      expect(exec.validatePayloadIntegrity('wrong')).toBe(false);
    });
  });

  describe('reconstitute', () => {
    it('reconstitutes from DB props', () => {
      const exec = JobExecution.reconstitute({
        id: crypto.randomUUID(),
        jobId: crypto.randomUUID(),
        agentId: crypto.randomUUID(),
        tenantId: crypto.randomUUID(),
        executionIndex: 5,
        nonce: 'nonce-abc',
        payloadHash: 'ph-123',
        startedAt: new Date(),
        completedAt: new Date(),
        exitCode: 0,
        stdout: 'output',
        stderr: null,
        outputHash: 'oh-456',
        resultSignature: 'sig',
        signatureVerified: true,
        durationMs: 1500,
        createdAt: new Date(),
      });

      expect(exec.executionIndex).toBe(5);
      expect(exec.signatureVerified).toBe(true);
      expect(exec.durationMs).toBe(1500);
    });
  });
});
