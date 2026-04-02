/**
 * Honeypot response profiles.
 * Simulates realistic backend responses to maintain attacker engagement.
 */

export type ResponseProfileType = 'low-noise' | 'default' | 'engagement';

interface RouteResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Build a plausible response for a honeypot route.
 */
export function buildHoneypotResponse(
  path: string,
  method: string,
  _profile: ResponseProfileType = 'default',
): RouteResponse {
  const route = normalizeRoute(path);

  // POST routes
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

      case '/submit-system-metrics':
        return {
          status: 200,
          body: { accepted: true },
        };

      case '/submit-processes':
        return {
          status: 200,
          body: { accepted: true, count: 0 },
        };

      default:
        // Unknown POST — still respond plausibly
        return {
          status: 200,
          body: { status: 'ok' },
        };
    }
  }

  // GET routes
  if (method === 'GET') {
    switch (route) {
      case '/get-agent-config':
        return {
          status: 200,
          body: {
            config: {
              heartbeat_interval: 300,
              log_level: 'info',
            },
          },
        };

      case '/check-agent-updates':
        return {
          status: 200,
          body: {
            update_available: false,
            current_version: '5.0.0',
          },
        };

      default:
        return {
          status: 200,
          body: { status: 'ok' },
        };
    }
  }

  // Fallback for other methods
  return {
    status: 200,
    body: { status: 'ok' },
  };
}

/**
 * Normalize path to match against known routes.
 * Strips function prefix if present.
 */
function normalizeRoute(path: string): string {
  // Extract the last meaningful segment
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return '/';

  // Try to match known route names
  const last = segments[segments.length - 1];
  return '/' + last;
}
