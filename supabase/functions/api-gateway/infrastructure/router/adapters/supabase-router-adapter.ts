/**
 * Supabase/Deno Adapter for API Routing
 */

import { RouterPort, ActionMetadata } from '../ports/router-port.ts';
import { fetchWithTimeout } from '../../../../_shared/fetch-with-timeout.ts';
import { requireEnv } from '../../../../_shared/env.ts';

export class SupabaseRouterAdapter implements RouterPort {
  private readonly actionMap: Map<string, ActionMetadata> = new Map();
  private readonly proxyTimeoutMs = 20000;

  constructor(
    proxies: Record<string, string>,
    inlined: Record<string, Function>
  ) {
    // Map proxies
    for (const [action, target] of Object.entries(proxies)) {
      this.actionMap.set(action, {
        namespace: action.split(':')[0],
        actionName: action.split(':')[1],
        isProxy: true,
        target
      });
    }

    // Map inlined (overwrites if collision)
    for (const [action, handler] of Object.entries(inlined)) {
      this.actionMap.set(action, {
        namespace: action.split(':')[0],
        actionName: action.split(':')[1],
        isProxy: false,
        handler
      });
    }
  }

  getAction(action: string): ActionMetadata | null {
    return this.actionMap.get(action) || null;
  }

  async proxyAction(target: string, payload: unknown, headers: Record<string, string>): Promise<Response> {
    const url = `${requireEnv('SUPABASE_URL')}/functions/v1/${target}`;
    
    return await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      timeoutMs: this.proxyTimeoutMs,
    });
  }
}
