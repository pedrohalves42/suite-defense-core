/**
 * CORREÇÃO: Definições consolidadas de tipos de usuário
 * Substitui múltiplas definições espalhadas pelo código
 */

import { AppRole } from './roles';

/**
 * Perfil básico do usuário
 */
export interface UserProfile {
  user_id: string;
  full_name: string | null;
  email?: string;
}

/**
 * Membro de um tenant com role associado
 * CORREÇÃO: tenant_id opcional para compatibilidade com queries
 */
export interface Member {
  id: string;
  user_id: string;
  role: AppRole;
  tenant_id?: string;
  created_at: string;
  profiles: {
    full_name: string | null;
  } | null;
  email?: string;
}

/**
 * Usuário completo com detalhes administrativos
 */
export interface UserWithDetails {
  user_id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  tenant_id: string;
  tenant_name: string;
  is_active: boolean;
  created_at: string;
}

/**
 * Informações de assinatura do tenant
 */
export interface TenantSubscription {
  subscription_plans: {
    name: string;
    max_users: number;
  };
}
