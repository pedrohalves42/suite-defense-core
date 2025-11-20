/**
 * CORRECAO: Utility functions para badges (status e roles)
 * Centraliza logica duplicada de UI
 */

import { AppRole } from '@/types/roles';

/**
 * Retorna a variante do Badge para um role especifico
 */
export function getRoleBadgeVariant(
  role: AppRole
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (role) {
    case 'super_admin':
      return 'destructive';
    case 'admin':
      return 'default';
    case 'operator':
      return 'secondary';
    case 'viewer':
      return 'outline';
    default:
      return 'outline';
  }
}

/**
 * Retorna a variante do Badge para status de usuario
 */
export function getUserStatusVariant(
  isActive: boolean
): 'default' | 'secondary' {
  return isActive ? 'default' : 'secondary';
}

/**
 * Retorna o texto formatado para status de usuario
 */
export function getUserStatusText(isActive: boolean): string {
  return isActive ? 'Ativo' : 'Inativo';
}

/**
 * Calcula tempo decorrido desde uma data (para heartbeats)
 */
export function getTimeSince(date: string | null): string {
  if (!date) return 'Nunca';
  
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return 'Agora mesmo';
  if (diffMins < 60) return `${diffMins}min atras`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h atras`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d atras`;
}
