import { z } from 'https://esm.sh/zod@3.23.8';
import { servePublic } from '../_shared/serve-tenant.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';

const ContactFormSchema = z.object({
  name: z.string().min(2).max(100).regex(/^[a-zA-Z\s\-']+$/),
  email: z.string().email().max(255),
  company: z.string().max(200).optional().nullable(),
  phone: z.string().regex(/^[\d\s()+-]*$/).max(20).optional().nullable(),
  endpoints: z.number().int().min(1).max(100000).optional().nullable(),
  message: z.string().max(2000).optional().nullable()
});

servePublic(async (req, ctx) => {
  const { supabase, requestId, body } = ctx;
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST.' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';
  const rl = await checkRateLimit(supabase, { key: `contact:${clientIp}`, maxRequests: 5, windowMinutes: 60 });
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Muitas tentativas.', retry_after_minutes: rl.retryAfterMinutes }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }
  const parsed = ContactFormSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { name, email, company, phone, endpoints, message } = parsed.data;
  const { data: contact, error: insertError } = await supabase.from('contact_submissions').insert({ name, email, company: company || null, phone: phone || null, endpoints: endpoints || null, message: message || null, ip_address: clientIp, user_agent: userAgent, source: 'website' }).select('id').single();
  if (insertError) { logger.error(`[submit-contact][${requestId}] Insert error:`, insertError); throw new Error('Erro ao salvar contato'); }
  logger.info(`[submit-contact][${requestId}] Contact saved`, { contactId: contact?.id, email });
  try { await supabase.functions.invoke('notification-router', { body: { action: 'dispatch', payload: { type: 'new_contact', data: { name, email, company, endpoints } } }, headers: { 'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '' } }); } catch (_) { /* non-critical */ }
  return { success: true, message: 'Contato recebido com sucesso!', id: contact?.id };
});
