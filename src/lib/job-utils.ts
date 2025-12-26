/**
 * Job utilities for creating jobs with payload hash
 * 
 * The payload_hash is automatically calculated by a database trigger,
 * but we also compute it client-side for TypeScript type satisfaction
 * and for cases where the client needs to know the hash before insertion.
 */

/**
 * Calculates SHA-256 hash of a payload (matches database trigger logic)
 */
export async function calculatePayloadHash(payload: unknown): Promise<string> {
  const payloadJson = JSON.stringify(payload ?? {});
  const encoder = new TextEncoder();
  const data = encoder.encode(payloadJson);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Prepares a job object with calculated payload_hash
 * Use this when inserting jobs to satisfy TypeScript and ensure hash consistency
 */
export async function prepareJobForInsert<T extends { payload?: unknown }>(
  job: T
): Promise<T & { payload_hash: string }> {
  const payload_hash = await calculatePayloadHash(job.payload);
  return { ...job, payload_hash };
}

/**
 * Prepares multiple jobs for batch insert
 */
export async function prepareJobsForInsert<T extends { payload?: unknown }>(
  jobs: T[]
): Promise<Array<T & { payload_hash: string }>> {
  return Promise.all(jobs.map(job => prepareJobForInsert(job)));
}
