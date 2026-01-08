import { useTenant } from './useTenant';

/**
 * Hook that ensures a tenant is always defined.
 * Throws an error if used without a valid tenant context.
 * 
 * Use this in components/hooks that MUST have a tenant to function correctly.
 * This helps catch multi-tenant isolation bugs at development time.
 * 
 * @example
 * const { tenant } = useRequiredTenant();
 * // tenant.id is guaranteed to be defined
 * 
 * @throws Error if no tenant is selected
 */
export function useRequiredTenant() {
  const { tenant, loading } = useTenant();

  if (!loading && !tenant?.id) {
    throw new Error(
      '[useRequiredTenant] Tenant obrigatório não definido. ' +
      'Verifique se o componente está dentro do ActiveTenantProvider e se um tenant foi selecionado.'
    );
  }

  return { 
    tenant: tenant!, 
    loading,
    tenantId: tenant?.id ?? '' 
  };
}
