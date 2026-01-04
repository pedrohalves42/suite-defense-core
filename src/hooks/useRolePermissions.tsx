import { useMemo } from 'react';
import { useUserRole } from './useUserRole';
import { APP_ROLES, type AppRole } from '@/types/roles';

/**
 * Matriz de permissões por ação
 * Define quais roles podem executar cada tipo de ação
 */
const PERMISSION_MATRIX: Record<string, AppRole[]> = {
  // Visualização
  view_dashboard: ['viewer', 'operator', 'analyst', 'admin', 'super_admin'],
  view_reports: ['viewer', 'operator', 'analyst', 'admin', 'super_admin'],
  view_agents: ['viewer', 'operator', 'analyst', 'admin', 'super_admin'],
  view_audit_logs: ['analyst', 'admin', 'super_admin'],
  view_ai_decisions: ['analyst', 'admin', 'super_admin'],
  view_all_tenants: ['super_admin'],

  // Operações
  execute_playbooks: ['operator', 'analyst', 'admin', 'super_admin'],
  manage_jobs: ['operator', 'analyst', 'admin', 'super_admin'],
  manage_agents: ['operator', 'admin', 'super_admin'],

  // Administração
  manage_users: ['admin', 'super_admin'],
  manage_roles: ['admin', 'super_admin'],
  manage_policies: ['admin', 'super_admin'],
  manage_tenant_settings: ['admin', 'super_admin'],

  // Ações críticas (requerem segregação)
  approve_role_change: ['admin', 'super_admin'],
  approve_agent_delete: ['admin', 'super_admin'],
  approve_policy_deploy: ['analyst', 'admin', 'super_admin'],
  
  // Super Admin exclusivo
  manage_all_tenants: ['super_admin'],
  impersonate_user: ['super_admin'],
  access_system_settings: ['super_admin'],
};

/**
 * Ações que requerem Two-Man-Rule (segregação de funções)
 */
const SEGREGATED_ACTIONS = [
  'role_change',
  'agent_delete', 
  'policy_deploy',
  'tenant_settings_change',
] as const;

export type SegregatedAction = typeof SEGREGATED_ACTIONS[number];

export interface RolePermissions {
  // Checks de permissão
  can: (action: string) => boolean;
  canAny: (actions: string[]) => boolean;
  canAll: (actions: string[]) => boolean;
  
  // Ações segregadas
  requiresApproval: (action: SegregatedAction) => boolean;
  
  // Estado
  role: AppRole | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isAnalyst: boolean;
  isOperator: boolean;
  isViewer: boolean;
  canWrite: boolean;
  loading: boolean;
}

/**
 * Hook para verificar permissões baseado no role do usuário
 * Implementa matriz RBAC com suporte a segregação de funções
 */
export const useRolePermissions = (): RolePermissions => {
  const { 
    role, 
    isSuperAdmin, 
    isAdmin, 
    isOperator, 
    isViewer, 
    canWrite, 
    loading 
  } = useUserRole();

  const permissions = useMemo(() => {
    const isAnalyst = role === 'analyst';
    const currentRole = role as AppRole | null;
    
    /**
     * Verifica se o usuário pode executar uma ação específica
     */
    const can = (action: string): boolean => {
      if (!currentRole) return false;
      
      // Super admin pode tudo
      if (currentRole === 'super_admin') return true;
      
      const allowedRoles = PERMISSION_MATRIX[action];
      if (!allowedRoles) {
        // Ação não definida = apenas super_admin (já retornou acima)
        return false;
      }
      
      return allowedRoles.includes(currentRole);
    };

    /**
     * Verifica se pode executar pelo menos uma das ações
     */
    const canAny = (actions: string[]): boolean => {
      return actions.some(action => can(action));
    };

    /**
     * Verifica se pode executar todas as ações
     */
    const canAll = (actions: string[]): boolean => {
      return actions.every(action => can(action));
    };

    /**
     * Verifica se uma ação requer aprovação (Two-Man-Rule)
     */
    const requiresApproval = (action: SegregatedAction): boolean => {
      return SEGREGATED_ACTIONS.includes(action);
    };

    return {
      can,
      canAny,
      canAll,
      requiresApproval,
      role: role as AppRole | null,
      isAdmin,
      isSuperAdmin,
      isAnalyst,
      isOperator,
      isViewer,
      canWrite,
      loading,
    };
  }, [role, isSuperAdmin, isAdmin, isOperator, isViewer, canWrite, loading]);

  return permissions;
};

/**
 * Lista de todas as permissões disponíveis (para documentação/UI)
 */
export const ALL_PERMISSIONS = Object.keys(PERMISSION_MATRIX);

/**
 * Retorna as permissões de um role específico
 */
export function getPermissionsForRole(role: AppRole): string[] {
  return Object.entries(PERMISSION_MATRIX)
    .filter(([_, roles]) => roles.includes(role))
    .map(([permission]) => permission);
}
