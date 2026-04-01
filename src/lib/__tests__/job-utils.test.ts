import { describe, it, expect } from 'vitest';
import { calculatePayloadHash, prepareJobForInsert, prepareJobsForInsert } from '../job-utils';

describe('job-utils', () => {
  describe('calculatePayloadHash()', () => {
    it('returns a hex string', async () => {
      const hash = await calculatePayloadHash({ test: true });
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns consistent hash for same payload', async () => {
      const h1 = await calculatePayloadHash({ a: 1, b: 2 });
      const h2 = await calculatePayloadHash({ a: 1, b: 2 });
      expect(h1).toBe(h2);
    });

    it('returns different hash for different payloads', async () => {
      const h1 = await calculatePayloadHash({ a: 1 });
      const h2 = await calculatePayloadHash({ a: 2 });
      expect(h1).not.toBe(h2);
    });

    it('handles null/undefined payload', async () => {
      const h1 = await calculatePayloadHash(null);
      const h2 = await calculatePayloadHash(undefined);
      // Both should hash "{}" since ?? {} is used
      expect(h1).toBe(h2);
    });
  });

  describe('prepareJobForInsert()', () => {
    it('adds payload_hash to job', async () => {
      const job = { type: 'scan', payload: { target: 'all' } };
      const result = await prepareJobForInsert(job);
      expect(result.payload_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.type).toBe('scan');
    });

    it('handles job without payload', async () => {
      const job = { payload: undefined };
      const result = await prepareJobForInsert(job);
      expect(result.payload_hash).toBeTruthy();
    });
  });

  describe('prepareJobsForInsert()', () => {
    it('processes multiple jobs', async () => {
      const jobs = [
        { type: 'a', payload: { x: 1 } },
        { type: 'b', payload: { x: 2 } },
      ];
      const results = await prepareJobsForInsert(jobs);
      expect(results).toHaveLength(2);
      expect(results[0].payload_hash).toBeTruthy();
      expect(results[1].payload_hash).toBeTruthy();
      expect(results[0].payload_hash).not.toBe(results[1].payload_hash);
    });
  });
});
