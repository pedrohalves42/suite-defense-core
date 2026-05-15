/**
 * CORRECAO: Definicao centralizada de tipos de roles do sistema
 * Evita duplicacao e garante consistencia em todo o codebase
 */

export const APP_ROLES = ['viewer', 'operator', 'analyst', 'admin', 'super_admin', 'member'] as const;
export type AppRole = typeof APP_ROLES[number];

/**
 * Type guard para validar se um valor e um AppRole valido
 * CORRECAO: Previne valores invalidos em runtime
 */
export function isValidRole(value: unknown): value is AppRole {
  return typeof value === 'string' && APP_ROLES.includes(value as AppRole);
}

/**
 * Prioridade dos roles (do menor ao maior privilegio)
 */
export const ROLE_PRIORITY: Record<AppRole, number> = {
  viewer: 1,
  member: 1, // Same as viewer for now
  operator: 2,
  analyst: 3,
  admin: 4,
  super_admin: 5,
};

/**
 * Labels em portugues para os roles
 */
export const ROLE_LABELS: Record<AppRole, string> = {
  viewer: 'Visualizador',
  member: 'Membro',
  operator: 'Operador',
  analyst: 'Analista',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

/**
 * Valida e retorna um AppRole ou lanca erro
 * Util para validacao de inputs de usuario
 */
export function assertValidRole(value: unknown, fieldName: string = 'role'): AppRole {
  if (!isValidRole(value)) {
    throw new Error(
      `Invalid ${fieldName}: "${value}". Must be one of: ${APP_ROLES.join(', ')}`
    );
  }
  return value;
}
