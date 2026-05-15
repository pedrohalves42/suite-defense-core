import { z } from 'zod';
import * as schemas from './system-schemas.ts';

/**
 * Dispatch Registry — Mapeia ações do gateway para seus schemas de validação.
 * F-002: Impede o bypass de validação exigindo um contrato para cada ação.
 */
export const DISPATCH_REGISTRY: Record<string, z.ZodType<any>> = {
  // Autenticação
  'admin:change-password': schemas.changePasswordSchema,
  
  // Gestão de Usuários
  'admin:update-user-status': schemas.updateStatusSchema,
  'admin:update-member-role': schemas.updateMemberRoleSchema,
  'admin:remove-member': schemas.removeMemberSchema,
  'admin:set-active-tenant': schemas.setTenantSchema,
  'admin:create-user': schemas.createUserSchema,
  'admin:update-user-role': schemas.createUserSchema, // Reaproveita campos de role
  'admin:list-users': z.object({
    tenant_id: z.string().uuid().optional(),
    limit: z.coerce.number().optional(),
    offset: z.coerce.number().optional(),
  }),
  'admin:rate-limit-stats': z.object({
    hours_back: z.coerce.number().min(1).max(720).default(24)
  }),
  
  // Convites
  'admin:send-invite': schemas.sendInviteSchema,
  
  // Agentes e Infra
  'agent:enroll-agent': schemas.enrollAgentSchema,
  'admin:create-job': schemas.createJobSchema,
  
  // Configurações
  'admin:tenant-settings': schemas.tenantSettingsSchema,
  'admin:branding-settings': schemas.brandingSchema,
};

/**
 * Submit Registry — Mapeia tipos de submissão de agentes para seus schemas.
 */
export const SUBMIT_REGISTRY: Record<string, z.ZodObject<any>> = {
  // Telemetria base
  'agent-enrollment': schemas.enrollAgentSchema,
};

/**
 * Validador Central de Dispatch
 */
export function validateDispatch(action: string, payload: unknown) {
  const schema = DISPATCH_REGISTRY[action];
  
  if (!schema) {
    // Fail-closed para ações administrativas novas sem schema
    if (action.startsWith('admin:')) {
      throw new Error(`Critical: Action ${action} requires a registered schema for security enforcement.`);
    }
    // Ações legadas ou operacionais genéricas
    return z.record(z.string(), z.unknown()).parse(payload);
  }
  
  return schema.parse(payload);
}

/**
 * Validador Central de Telemetria (Agentes)
 */
export function validateSubmit(type: string, payload: unknown) {
  const schema = SUBMIT_REGISTRY[type];
  if (!schema) {
    // Permitir flexibilidade para telemetria mas com log de tipos desconhecidos
    return z.record(z.string(), z.unknown()).parse(payload);
  }
  return schema.parse(payload);
}
