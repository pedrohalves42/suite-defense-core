import { describe, it, expect } from 'vitest';
import { JobExecution } from '../entities/JobExecution';

function makeExecution() {
  return JobExecution.start({
    jobId: crypto.randomUUID(),
    agentId: crypto.randomUUID(),
    tenantId: crypto.randomUUID(),
    executionIndex: 0,
    nonce: crypto.randomUUID(),
    payloadHash: 'a'.repeat(64),
  });
}

describe('JobExecution Entity', () => {
  it('starts uncompleted', () => {
    const exec = makeExecution();
    expect(exec.isCompleted()).toBe(false);
    expect(exec.exitCode).toBeNull();
  });

  it('records result once', () => {
    const exec = makeExecution();
    exec.recordResult({
      exitCode: 0,
      stdout: 'ok',
      outputHash: 'b'.repeat(64),
    });
    expect(exec.isCompleted()).toBe(true);
    expect(exec.isSuccess()).toBe(true);
    expect(exec.exitCode).toBe(0);
    expect(exec.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects double result recording (immutability)', () => {
    const exec = makeExecution();
    exec.recordResult({ exitCode: 0, outputHash: 'c'.repeat(64) });
    expect(() =>
      exec.recordResult({ exitCode: 1, outputHash: 'd'.repeat(64) })
    ).toThrow('immutable');
  });

  it('validates payload integrity', () => {
    const exec = makeExecution();
    expect(exec.validatePayloadIntegrity('a'.repeat(64))).toBe(true);
    expect(exec.validatePayloadIntegrity('b'.repeat(64))).toBe(false);
  });

  it('marks signature verified', () => {
    const exec = makeExecution();
    exec.recordResult({
      exitCode: 0,
      outputHash: 'e'.repeat(64),
      resultSignature: 'sig123',
    });
    exec.markSignatureVerified();
    expect(exec.signatureVerified).toBe(true);
  });

  it('rejects signature verification without signature', () => {
    const exec = makeExecution();
    exec.recordResult({ exitCode: 0, outputHash: 'f'.repeat(64) });
    expect(() => exec.markSignatureVerified()).toThrow('no signature');
  });

  it('non-zero exit code is not success', () => {
    const exec = makeExecution();
    exec.recordResult({ exitCode: 1, stderr: 'fail', outputHash: 'g'.repeat(64) });
    expect(exec.isSuccess()).toBe(false);
  });

  it('reconstitutes from props', () => {
    const now = new Date();
    const exec = JobExecution.reconstitute({
      id: crypto.randomUUID(),
      jobId: crypto.randomUUID(),
      agentId: crypto.randomUUID(),
      tenantId: crypto.randomUUID(),
      executionIndex: 2,
      nonce: 'nonce-123',
      payloadHash: 'a'.repeat(64),
      startedAt: now,
      completedAt: now,
      exitCode: 0,
      stdout: 'output',
      stderr: null,
      outputHash: 'b'.repeat(64),
      resultSignature: null,
      signatureVerified: false,
      durationMs: 150,
      createdAt: now,
    });

    expect(exec.executionIndex).toBe(2);
    expect(exec.isCompleted()).toBe(true);
  });
});
