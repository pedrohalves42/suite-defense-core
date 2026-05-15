import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { validateDispatch } from '../../supabase/functions/_shared/schemas/registry'; // Correção F-002: Pre-flight validation

type GatewayNamespace =
  | 'admin' | 'billing' | 'security' | 'build' | 'agent'
  | 'check' | 'sync' | 'playbook' | 'report' | 'cleanup' | 'notify'
  | 'public';

const API_GATEWAY_NAMESPACES: GatewayNamespace[] = ['admin', 'billing', 'security', 'build', 'agent'];
const PUBLIC_GATEWAY_NAMESPACES: GatewayNamespace[] = ['public'];

/**
 * Centralized gateway caller.
 * Routes to api-gateway, public-gateway, or ops-gateway based on namespace.
 *
 * @example
 * const data = await callGateway('notify', 'dispatch', { tenant_id, severity: 'info' });
 * const data = await callGateway('admin', 'create-user', { email, role });
 * const data = await callGateway('public', 'get-diagnostic-script', {});
 * const data = await callGateway('public', 'serve-installer', { enrollmentKey, mode: 'args' });
 */
export async function callGateway<T = Record<string, unknown>>(
  namespace: GatewayNamespace,
  action: string,
  payload?: Record<string, unknown>,
  options?: { signal?: AbortSignal; headers?: Record<string, string> }
): Promise<T> {
  const gateway = API_GATEWAY_NAMESPACES.includes(namespace)
    ? 'api-gateway'
    : PUBLIC_GATEWAY_NAMESPACES.includes(namespace)
    ? 'public-gateway'
    : 'ops-gateway';

  try {
    const { data, error } = await supabase.functions.invoke(gateway, {
      body: {
        action: `${namespace}:${action}`,
        payload: payload ?? {},
      },
      headers: options?.headers,
      // Note: supabase-js doesn't natively support signal in invoke yet, 
      // but we prepare the interface for future compatibility or manual fetch if needed.
    });

    if (error) {
      // V-FIX: Log more context for debugging
      logger.error(`[Gateway Error] ${gateway} -> ${namespace}:${action}`, error);
      throw error;
    }

    // Se o retorno do gateway indicar erro na execução interna (ex: 400 ou 500 encapsulado)
    if (data && typeof data === 'object' && 'error' in data && data.error) {
      const errorMsg = typeof data.error === 'string' 
        ? data.error 
        : (data.error as any).message || 'Gateway Internal Error';
      
      const internalError = new Error(errorMsg);
      (internalError as any).details = data.details;
      throw internalError;
    }

    return (data ?? {}) as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      logger.debug(`[Gateway] Request aborted: ${namespace}:${action}`);
    }
    throw err;
  }
}
