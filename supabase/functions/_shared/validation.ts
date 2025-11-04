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
