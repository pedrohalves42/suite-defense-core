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

// Agent name schema - reusable and secure
export const AgentNameSchema = z.string()
  .trim()
  .min(3, 'Nome do agente deve ter pelo menos 3 caracteres')
  .max(64, 'Nome do agente deve ter no máximo 64 caracteres')
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9-_]*[a-zA-Z0-9]$/,
    'Nome do agente deve começar e terminar com letras ou números, e pode conter hífens e underscores'
  )
  .refine(name => {
    const sqlPatterns = [/[;'"\\/]/, /(union|select|insert|update|delete|drop)/i, /(--|\*\/|\/\*)/, /[\x00-\x1F\x7F]/];
    return !sqlPatterns.some(pattern => pattern.test(name));
  }, 'Nome contém caracteres perigosos')
  .refine(name => !/(.)\1{5,}/.test(name), 'Não pode ter mais de 5 caracteres repetidos')
  .refine(name => {
    const reserved = ['admin', 'root', 'system', 'null', 'undefined'];
    return !reserved.includes(name.toLowerCase());
  }, 'Nome reservado');

// Existing schemas
export const EnrollAgentSchema = z.object({
  enrollmentKey: z.string().length(19, 'Chave de enrollment deve ter formato XXXX-XXXX-XXXX-XXXX'),
  agentName: AgentNameSchema,
});

export const CreateJobSchema = z.object({
  agentName: AgentNameSchema,
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
    .regex(/^[a-zA-Z0-9._-]+$/, 'Nome do arquivo deve conter apenas caracteres alfanuméricos, ponto, underscore e hífen')
    .refine(name => {
      // Block all common path traversal patterns
      const dangerous = ['../', '..\\', '..%2f', '..%5c', '..%252f', '%2e%2e/'];
      const lowerName = name.toLowerCase();
      return !dangerous.some(pattern => lowerName.includes(pattern));
    }, 'Path traversal detectado - caracteres inválidos'),
});

export const JobIdSchema = z.string().uuid('Job ID deve ser um UUID válido');

export const AgentTokenSchema = z.string().uuid('Agent token deve ser um UUID válido');

// Auto-generate enrollment validation
export const AutoGenerateEnrollmentSchema = z.object({
  agentName: AgentNameSchema,
});

// Enhanced CreateJobSchema with additional security validations
export const CreateJobSchemaEnhanced = z.object({
  agentName: AgentNameSchema,
  type: z.enum(['scan', 'update', 'report', 'config'], { errorMap: () => ({ message: 'Tipo de job inválido' }) }),
  payload: z.record(z.unknown()).optional().refine(payload => {
    if (!payload) return true;
    const jsonStr = JSON.stringify(payload);
    // Block potential XSS in payload
    const xssPatterns = [/<script/i, /javascript:/i, /onerror=/i, /onload=/i];
    return !xssPatterns.some(pattern => pattern.test(jsonStr));
  }, 'Payload contém conteúdo potencialmente perigoso'),
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

// Enhanced UploadReportSchema with XSS protection
export const UploadReportSchemaEnhanced = UploadReportSchema.extend({
  kind: z.string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .refine(kind => {
      const dangerous = ['script', 'eval', 'exec', 'system'];
      return !dangerous.includes(kind.toLowerCase());
    }, 'Tipo de report inválido'),
  filename: z.string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9._-]+$/)
    .refine(name => {
      const dangerous = ['../', '..\\', '..%2f', '..%5c', '..%252f', '%2e%2e/', '<', '>', '|', '&'];
      const lowerName = name.toLowerCase();
      return !dangerous.some(pattern => lowerName.includes(pattern));
    }, 'Nome de arquivo contém caracteres perigosos')
    .refine(name => {
      // Block executable extensions
      const executableExts = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.js', '.vbs'];
      return !executableExts.some(ext => name.toLowerCase().endsWith(ext));
    }, 'Tipo de arquivo não permitido')
});

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function validateFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}
