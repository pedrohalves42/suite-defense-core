/**
 * Honeypot response profiles.
 * Simulates realistic backend responses to maintain attacker engagement.
 * 
 * Profiles:
 * - low-noise: minimal responses
 * - default: mimics real backend closely
 * - engagement: more detail to keep attacker interested
 */

export type ResponseProfileType = 'low-noise' | 'default' | 'engagement';

export interface RouteResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Build a plausible response for a honeypot route.
 * Only supported routes get meaningful responses.
 * Unknown routes get 404.
 */
export function buildHoneypotResponse(
  path: string,
  method: string,
  _profile: ResponseProfileType = 'default',
): RouteResponse {
  const route = normalizeRoute(path);

  if (method === 'POST') {
    switch (route) {
      case '/heartbeat':
        return {
          status: 200,
          body: {
            status: 'ok',
            server_time: new Date().toISOString(),
            interval_seconds: 300,
          },
        };

      case '/poll-jobs':
        return {
          status: 200,
          body: {
            jobs: [],
            poll_interval_seconds: 60,
          },
        };

      case '/submit-job-result':
        return {
          status: 200,
          body: {
            accepted: true,
            job_id: crypto.randomUUID(),
          },
        };

      default:
        return { status: 404, body: { error: 'Not found' } };
    }
  }

  // Non-POST: 404 minimal
  return { status: 404, body: { error: 'Not found' } };
}

function normalizeRoute(path: string): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  return '/' + segments[segments.length - 1];
}
