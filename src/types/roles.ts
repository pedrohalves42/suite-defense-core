/**
 * CORREÇÃO: Definição centralizada de tipos de roles do sistema
 * Evita duplicação e garante consistência em todo o codebase
 */

export const APP_ROLES = ['viewer', 'operator', 'admin', 'super_admin'] as const;
export type AppRole = typeof APP_ROLES[number];

/**
 * Type guard para validar se um valor é um AppRole válido
 * CORREÇÃO: Previne valores inválidos em runtime
 */
export function isValidRole(value: unknown): value is AppRole {
  return typeof value === 'string' && APP_ROLES.includes(value as AppRole);
}

/**
 * Prioridade dos roles (do menor ao maior privilégio)
 */
export const ROLE_PRIORITY: Record<AppRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
  super_admin: 4,
};

/**
 * Labels em português para os roles
 */
export const ROLE_LABELS: Record<AppRole, string> = {
  viewer: 'Visualizador',
  operator: 'Operador',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

/**
 * Valida e retorna um AppRole ou lança erro
 * Útil para validação de inputs de usuário
 */
export function assertValidRole(value: unknown, fieldName: string = 'role'): AppRole {
  if (!isValidRole(value)) {
    throw new Error(
      `Invalid ${fieldName}: "${value}". Must be one of: ${APP_ROLES.join(', ')}`
    );
  }
  return value;
}
