import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

const ContactFormSchema = z.object({
  name: z.string()
    .min(2, 'Nome muito curto')
    .max(100, 'Nome muito longo')
    .regex(/^[a-zA-Z\s\-']+$/, 'Nome contem caracteres invalidos'),
  email: z.string()
    .email('Email invalido')
    .max(255, 'Email muito longo'),
  company: z.string()
    .max(200, 'Nome da empresa muito longo')
    .optional()
    .nullable(),
  phone: z.string()
    .regex(/^[\d\s()+-]*$/, 'Telefone invalido')
    .max(20, 'Telefone muito longo')
    .optional()
    .nullable(),
  endpoints: z.number()
    .int('Deve ser numero inteiro')
    .min(1, 'Minimo 1 endpoint')
    .max(100000, 'Valor muito alto')
    .optional()
    .nullable(),
  message: z.string()
    .max(2000, 'Mensagem muito longa')
    .optional()
    .nullable()
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get client IP and user agent for audit
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    const userAgent = req.headers.get('user-agent') || 'unknown';

    console.log(`[${requestId}] Contact form submission from IP: ${clientIp}`);

    // Rate limiting: 3 submissions per hour
    const rateLimitResult = await checkRateLimit(
      supabase,
      clientIp,
      'submit-contact',
      {
        maxRequests: 3,
        windowMinutes: 60,
        blockMinutes: 60
      }
    );

    if (!rateLimitResult.allowed) {
      console.warn(`[${requestId}] Rate limit exceeded for IP: ${clientIp}`);
      return new Response(
        JSON.stringify({
          error: 'Muitas submissoes. Tente novamente mais tarde.',
          resetAt: rateLimitResult.resetAt
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = ContactFormSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }));

      console.warn(`[${requestId}] Validation failed:`, errors);
      
      return new Response(
        JSON.stringify({
          error: 'Dados invalidos',
          details: errors
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = validation.data;

    // Insert into database with audit fields
    const { error: insertError } = await supabase
      .from('sales_contacts')
      .insert({
        name: data.name,
        email: data.email,
        company: data.company || null,
        phone: data.phone || null,
        endpoints: data.endpoints || null,
        message: data.message || null,
        status: 'new',
        client_ip: clientIp,
        user_agent: userAgent
      });

    if (insertError) {
      console.error(`[${requestId}] Database error:`, insertError);
      throw insertError;
    }

    console.log(`[${requestId}] Contact form submitted successfully for: ${data.email}`);

    // TODO: Optional - Send notification to sales team
    // await supabase.functions.invoke('send-alert-email', {
    //   headers: { 'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') },
    //   body: { alertType: 'new_contact', message: `Nova solicitacao: ${data.name}`, details: data }
    // });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Mensagem enviada com sucesso!'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({
        error: 'Erro ao processar solicitacao',
        message: error instanceof Error ? error.message : 'Erro desconhecido'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
