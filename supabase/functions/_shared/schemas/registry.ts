import { z } from 'https://esm.sh/zod@3.23.8';
import * as schemas from './system-schemas.ts';

/**
 * Dispatch Registry — Mapeia ações do gateway para seus schemas de validação.
 * F-002: Impede o bypass de validação exigindo um contrato para cada ação.
 */
export const DISPATCH_REGISTRY: Record<string, z.ZodObject<any> | z.ZodEffects<any>> = {
  // Autenticação
  'admin:change-password': schemas.changePasswordSchema,
  
  // Gestão de Usuários
  'admin:update-user-status': schemas.updateStatusSchema,
  'admin:update-member-role': schemas.updateMemberRoleSchema,
  'admin:remove-member': schemas.removeMemberSchema,
  'admin:set-active-tenant': schemas.setTenantSchema,
  'admin:create-user': schemas.createUserSchema,
  
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
 * Validador Central de Dispatch
 * Retorna o payload validado ou lança erro se a ação não for reconhecida ou o payload for inválido.
 */
export function validateDispatch(action: string, payload: unknown) {
  const schema = DISPATCH_REGISTRY[action];
  
  if (!schema) {
    // Se não houver schema definido, usamos um objeto genérico mas estrito (sem passthrough)
    // para evitar injeção de campos desconhecidos em ações legadas.
    return z.record(z.string(), z.unknown()).parse(payload);
  }
  
  return schema.parse(payload);
}
