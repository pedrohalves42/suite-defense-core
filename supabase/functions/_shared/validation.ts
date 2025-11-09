import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

// Auth validation schemas
export const EmailSchema = z.string()
  .trim()
  .min(1, 'Email é obrigatório')
  .email('Email inválido')
  .max(255, 'Email muito longo');

export const PasswordSchema = z.string()
  .min(8, 'Senha deve ter pelo menos 8 caracteres')
  .max(72, 'Senha muito longa')
  .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
  .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
  .regex(/[0-9]/, 'Senha deve conter pelo menos um número');

export const FullNameSchema = z.string()
  .trim()
  .min(2, 'Nome deve ter pelo menos 2 caracteres')
  .max(100, 'Nome muito longo')
  .regex(/^[a-zA-ZÀ-ÿ\s]+$/, 'Nome deve conter apenas letras e espaços');

// Existing schemas
export const EnrollAgentSchema = z.object({
  enrollmentKey: z.string().length(19, 'Chave de enrollment deve ter formato XXXX-XXXX-XXXX-XXXX'),
  agentName: z.string().min(3).max(64).regex(/^[A-Z0-9-]+$/, 'Nome do agente deve conter apenas letras maiúsculas, números e hífens'),
});

export const CreateJobSchema = z.object({
  agentName: z.string().min(3).max(64).regex(/^[A-Z0-9-]+$/, 'Nome do agente inválido'),
  type: z.enum(['scan', 'update', 'report', 'config'], { errorMap: () => ({ message: 'Tipo de job inválido' }) }),
  payload: z.record(z.unknown()).optional(),
  approved: z.boolean().default(true),
  scheduledAt: z.string().datetime().optional(),
  isRecurring: z.boolean().default(false),
  recurrencePattern: z.enum(['*/5 * * * *', '*/15 * * * *', '*/30 * * * *', '0 * * * *', '0 0 * * *', '0 0 * * 0']).optional(),
}).refine(
  (data) => !data.isRecurring || (data.isRecurring && data.recurrencePattern),
  {
    message: 'Padrão de recorrência é obrigatório quando o job é recorrente',
    path: ['recurrencePattern'],
  }
);

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
