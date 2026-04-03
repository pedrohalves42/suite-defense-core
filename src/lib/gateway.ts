import { supabase } from '@/integrations/supabase/client';

type GatewayNamespace =
  | 'admin' | 'billing' | 'security' | 'build' | 'agent'
  | 'check' | 'sync' | 'playbook' | 'report' | 'cleanup' | 'notify';

const API_GATEWAY_NAMESPACES: GatewayNamespace[] = ['admin', 'billing', 'security', 'build', 'agent'];

/**
 * Centralized gateway caller.
 * Routes to api-gateway or ops-gateway based on namespace.
 *
 * @example
 * const data = await callGateway('notify', 'dispatch', { tenant_id, severity: 'info' });
 * const data = await callGateway('admin', 'create-user', { email, role });
 */
export async function callGateway<T = Record<string, unknown>>(
  namespace: GatewayNamespace,
  action: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const gateway = API_GATEWAY_NAMESPACES.includes(namespace)
    ? 'api-gateway'
    : 'ops-gateway';

  const { data, error } = await supabase.functions.invoke(gateway, {
    body: {
      action: `${namespace}:${action}`,
      payload: payload ?? {},
    },
  });

  if (error) throw error;
  return data as T;
}
