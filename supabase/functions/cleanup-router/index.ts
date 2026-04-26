import { servePublic } from '../_shared/serve-public.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const CleanupSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional(),
});

servePublic(async (req, ctx) => {
  const { body } = ctx;
  
  const parsed = CleanupSchema.safeParse(body);
  if (!parsed.success) {
    return { error: 'Invalid payload', details: parsed.error.flatten().fieldErrors, __status: 400 };
  }

  // Security check: block SQL injection patterns in action
  const sqlPatterns = [/[;'"\\/]/, /(union|select|insert|update|delete|drop)/i, /(--|\*\/|\/\*)/];
  if (sqlPatterns.some(pattern => pattern.test(parsed.data.action))) {
    return { error: 'Malicious content detected', __status: 400 };
  }

  return { message: 'Cleanup router ready', action: parsed.data.action };
});
