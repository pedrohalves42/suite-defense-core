/**
 * Contact form handler
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { checkRateLimit } from '../../_shared/rate-limit.ts';
import { logger } from '../../_shared/logger.ts';
import { fetchWithTimeout, TIMEOUT_TIERS } from '../../_shared/fetch-with-timeout.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const ContactFormSchema = z.object({
  name: z.string().min(2).max(100).regex(/^[a-zA-Z\s\-']+$/),
  email: z.string().email().max(255),
  company: z.string().max(200).optional().nullable(),
  phone: z.string().regex(/^[\d\s()+-]*$/).max(20).optional().nullable(),
  endpoints: z.number().int().min(1).max(100000).optional().nullable(),
  message: z.string().max(2000).optional().nullable(),
});

export async function handleSubmitContact(
  supabase: any, req: Request, requestId: string, payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  const rl = await checkRateLimit(supabase, { key: `contact:${clientIp}`, maxRequests: 5, windowMinutes: 60 });
  if (!rl.allowed) {
    return { error: 'Muitas tentativas.', retry_after_minutes: rl.retryAfterMinutes, __status: 429 };
  }

  const parsed = ContactFormSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors, __status: 400 };
  }

  const { name, email, company, phone, endpoints, message } = parsed.data;
  const { data: contact, error: insertError } = await supabase.from('contact_submissions').insert({
    name, email, company: company || null, phone: phone || null,
    endpoints: endpoints || null, message: message || null,
    ip_address: clientIp, user_agent: userAgent, source: 'website',
  }).select('id').single();

  if (insertError) {
    logger.error(`[submit-contact][${requestId}] Insert error:`, insertError);
    throw new Error('Erro ao salvar contato');
  }

  logger.info(`[submit-contact][${requestId}] Contact saved`, { contactId: contact?.id, email });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/ops-gateway`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '',
      },
      body: JSON.stringify({ action: 'notify:webhook', payload: { type: 'new_contact', data: { name, email, company, endpoints } } }),
      timeoutMs: TIMEOUT_TIERS.INTERNAL,
    });
  } catch (_) { /* non-critical */ }

  return { success: true, message: 'Contato recebido com sucesso!', id: contact?.id };
}
