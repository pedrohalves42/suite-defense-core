import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException, handleValidationError, createErrorResponse, ErrorCode, corsHeaders } from '../_shared/error-handler.ts';
import { CreateJobSchema } from '../_shared/validation.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Não autorizado', 401, requestId);
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Não autorizado', 401, requestId);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: hasAdminRole } = await supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (!hasAdminRole) {
      await createAuditLog({ supabase: supabaseAdmin, userId: user.id, action: 'job_creation_denied', resourceType: 'job', details: { reason: 'not_admin' }, request: req, success: false });
      return new Response(JSON.stringify({ error: 'Acesso negado' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Rate limiting por usuário (prevenir flooding de jobs)
    const rateLimitResult = await checkRateLimit(supabaseAdmin, user.id, 'create-job', {
      maxRequests: 60,
      windowMinutes: 1,
      blockMinutes: 5,
    });

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit excedido',
          resetAt: rateLimitResult.resetAt 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawData = await req.json();
    const validatedData = CreateJobSchema.parse(rawData);
    const { agentName, type, payload, approved } = validatedData;

    // Buscar tenant_id do usuário autenticado
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (!userRole?.tenant_id) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Tenant não encontrado', 400, requestId);
    }

    const { data: job, error: insertError } = await supabaseAdmin.from('jobs').insert({ 
      agent_name: agentName, 
      type, 
      payload, 
      status: 'queued', 
      approved,
      tenant_id: userRole.tenant_id
    }).select().single();
    if (insertError) throw insertError;

    await createAuditLog({ supabase: supabaseAdmin, userId: user.id, action: 'job_created', resourceType: 'job', resourceId: job.id, details: { agent_name: agentName, type, approved }, request: req, success: true });

    return new Response(JSON.stringify({ id: job.id, type: job.type, agentName: job.agent_name }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return handleException(error, requestId, 'create-job');
  }
});
