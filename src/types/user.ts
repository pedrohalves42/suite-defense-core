/**
 * CORRECAO: Definicoes consolidadas de tipos de usuario
 * Substitui multiplas definicoes espalhadas pelo codigo
 */

import { AppRole } from './roles';

/**
 * Perfil basico do usuario
 */
export interface UserProfile {
  user_id: string;
  full_name: string | null;
  email?: string;
}

/**
 * Membro de um tenant com role associado
 * CORRECAO: tenant_id opcional para compatibilidade com queries
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
 * Usuario completo com detalhes administrativos
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
 * Informacoes de assinatura do tenant
 */
export interface TenantSubscription {
  subscription_plans: {
    name: string;
    max_users: number;
  };
}
