import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

export const EnrollAgentSchema = z.object({
  tenantId: z.string().min(1).max(50).regex(/^[a-zA-Z0-9-_]+$/, 'Tenant ID inválido'),
  enrollmentKey: z.string().length(19, 'Chave de enrollment deve ter formato XXXX-XXXX-XXXX-XXXX'),
  agentName: z.string().min(3).max(64).regex(/^[A-Z0-9-]+$/, 'Nome do agente deve conter apenas letras maiúsculas, números e hífens'),
});

export const CreateJobSchema = z.object({
  agentName: z.string().min(3).max(64).regex(/^[A-Z0-9-]+$/, 'Nome do agente inválido'),
  type: z.enum(['scan', 'update', 'report', 'config'], { errorMap: () => ({ message: 'Tipo de job inválido' }) }),
  payload: z.record(z.unknown()).optional(),
  approved: z.boolean().default(true),
});

export const UploadReportSchema = z.object({
  kind: z.string()
    .min(1, 'Report kind é obrigatório')
    .max(50, 'Report kind deve ter no máximo 50 caracteres')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Report kind deve conter apenas letras, números, underscore e hífen'),
  filename: z.string()
    .min(1, 'Nome do arquivo é obrigatório')
    .max(255, 'Nome do arquivo deve ter no máximo 255 caracteres')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Nome do arquivo inválido')
    .refine(name => !name.includes('..'), 'Path traversal não permitido'),
});

export const JobIdSchema = z.string().uuid('Job ID deve ser um UUID válido');

export const AgentTokenSchema = z.string().uuid('Agent token deve ser um UUID válido');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function validateFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}
