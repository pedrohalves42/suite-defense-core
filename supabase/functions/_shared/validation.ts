import { z } from 'https://esm.sh/zod@3.23.8';

// Auth validation schemas
export const EmailSchema = z.string()
  .trim()
  .min(1, 'Email e obrigatorio')
  .email('Email invalido')
  .max(255, 'Email muito longo');

export const PasswordSchema = z.string()
  .min(8, 'Senha deve ter pelo menos 8 caracteres')
  .max(72, 'Senha muito longa')
  .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiuscula')
  .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minuscula')
  .regex(/[0-9]/, 'Senha deve conter pelo menos um numero');

export const FullNameSchema = z.string()
  .trim()
  .min(2, 'Nome deve ter pelo menos 2 caracteres')
  .max(100, 'Nome muito longo')
  .regex(/^[a-zA-Z\s]+$/, 'Nome deve conter apenas letras e espacos');

// Agent name schema - reusable and secure
export const AgentNameSchema = z.string()
  .trim()
  .min(3, 'Nome do agente deve ter pelo menos 3 caracteres')
  .max(64, 'Nome do agente deve ter no maximo 64 caracteres')
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9-_]*[a-zA-Z0-9]$/,
    'Nome do agente deve comecar e terminar com letras ou numeros, e pode conter hifens e underscores'
  )
  .refine(name => {
    const sqlPatterns = [/[;'"\\/]/, /(union|select|insert|update|delete|drop)/i, /(--|\*\/|\/\*)/];
    const hasControlChars = [...name].some(char => {
      const code = char.charCodeAt(0);
      return (code >= 0 && code <= 31) || code === 127;
    });
    return !sqlPatterns.some(pattern => pattern.test(name)) && !hasControlChars;
  }, 'Nome contem caracteres perigosos')
  .refine(name => !/(.)\1{5,}/.test(name), 'Nao pode ter mais de 5 caracteres repetidos')
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
  type: z.enum([
    'scan', 
    'update_agent', 
    'report', 
    'config',
    'software_inventory_collect',
    'light_vuln_scan',
    'collect_antivirus_status',
    'collect_web_activity',
    'fix_firewall',
    'restart_service'
  ], { errorMap: () => ({ message: 'Tipo de job invalido' }) }),
  payload: z.record(z.unknown()).optional(),
  approved: z.boolean().default(true),
  scheduledAt: z.string().datetime().optional(),
  isRecurring: z.boolean().default(false),
  recurrencePattern: z.enum(['*/5 * * * *', '*/15 * * * *', '*/30 * * * *', '0 * * * *', '0 0 * * *', '0 0 * * 0']).optional(),
}).refine(
  (data) => !data.isRecurring || (data.isRecurring && data.recurrencePattern),
  {
    message: 'Padrao de recorrencia e obrigatorio quando o job e recorrente',
    path: ['recurrencePattern'],
  }
);

export const UploadReportSchema = z.object({
  kind: z.string()
    .min(1, 'Report kind e obrigatorio')
    .max(50, 'Report kind deve ter no maximo 50 caracteres')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Report kind deve conter apenas letras, numeros, underscore e hifen'),
  filename: z.string()
    .min(1, 'Nome do arquivo e obrigatorio')
    .max(255, 'Nome do arquivo deve ter no maximo 255 caracteres')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Nome do arquivo deve conter apenas caracteres alfanumericos, ponto, underscore e hifen')
    .refine(name => {
      // Block all common path traversal patterns
      const dangerous = ['../', '..\\', '..%2f', '..%5c', '..%252f', '%2e%2e/'];
      const lowerName = name.toLowerCase();
      return !dangerous.some(pattern => lowerName.includes(pattern));
    }, 'Path traversal detectado - caracteres invalidos'),
});

export const JobIdSchema = z.string().uuid('Job ID deve ser um UUID valido');

export const AgentTokenSchema = z.string().uuid('Agent token deve ser um UUID valido');

// Auto-generate enrollment validation
export const AutoGenerateEnrollmentSchema = z.object({
  agentName: AgentNameSchema,
});

// Enhanced CreateJobSchema with additional security validations
export const CreateJobSchemaEnhanced = z.object({
  agentName: AgentNameSchema,
  type: z.enum([
    'scan', 
    'update_agent', 
    'report', 
    'config',
    'software_inventory_collect',
    'light_vuln_scan',
    'collect_antivirus_status',
    'collect_web_activity',
    'fix_firewall',
    'restart_service'
  ], { errorMap: () => ({ message: 'Tipo de job invalido' }) }),
  payload: z.record(z.unknown()).optional().refine(payload => {
    if (!payload) return true;
    const jsonStr = JSON.stringify(payload);
    // Block potential XSS in payload
    const xssPatterns = [/<script/i, /javascript:/i, /onerror=/i, /onload=/i];
    return !xssPatterns.some(pattern => pattern.test(jsonStr));
  }, 'Payload contem conteudo potencialmente perigoso'),
  approved: z.boolean().default(true),
  scheduledAt: z.string().datetime().optional(),
  isRecurring: z.boolean().default(false),
  recurrencePattern: z.enum(['*/5 * * * *', '*/15 * * * *', '*/30 * * * *', '0 * * * *', '0 0 * * *', '0 0 * * 0']).optional(),
}).refine(
  (data) => !data.isRecurring || (data.isRecurring && data.recurrencePattern),
  {
    message: 'Padrao de recorrencia e obrigatorio quando o job e recorrente',
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
    }, 'Tipo de report invalido'),
  filename: z.string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9._-]+$/)
    .refine(name => {
      const dangerous = ['../', '..\\', '..%2f', '..%5c', '..%252f', '%2e%2e/', '<', '>', '|', '&'];
      const lowerName = name.toLowerCase();
      return !dangerous.some(pattern => lowerName.includes(pattern));
    }, 'Nome de arquivo contem caracteres perigosos')
    .refine(name => {
      // Block executable extensions
      const executableExts = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.js', '.vbs'];
      return !executableExts.some(ext => name.toLowerCase().endsWith(ext));
    }, 'Tipo de arquivo nao permitido')
});

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function validateFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}

// ========== AI ACTION PAYLOADS (FASE 2) ==========

export const DiagnosticJobPayloadSchema = z.object({
  agent_name: AgentNameSchema,
  diagnostic_type: z.enum(['full', 'network', 'performance']),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  metadata: z.record(z.any()).optional(),
});

export const SystemAlertPayloadSchema = z.object({
  alert_type: z.enum(['warning', 'error', 'info', 'success']).default('warning'),
  message: z.string().min(1).max(500),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  metadata: z.record(z.any()).optional(),
});

export const SuggestAgentRestartPayloadSchema = z.object({
  agent_name: AgentNameSchema,
  reason: z.string().min(1).max(200),
  urgency: z.enum(['low', 'medium', 'high']).optional().default('medium'),
});

export const SuggestConfigChangePayloadSchema = z.object({
  agent_name: AgentNameSchema,
  config_key: z.string().min(1).max(100),
  suggested_value: z.string().max(500),
  reason: z.string().min(1).max(300),
});

export const SuggestJobCleanupPayloadSchema = z.object({
  agent_name: AgentNameSchema.optional(),
  job_status: z.enum(['stuck', 'failed', 'pending']).optional(),
  older_than_days: z.number().int().min(0).max(365).optional().default(7),
  reason: z.string().min(1).max(300),
});
