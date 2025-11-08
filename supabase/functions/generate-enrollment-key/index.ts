import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateKeyRequest {
  expiresInHours: number;
  maxUses?: number;
  description?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verificar autenticação do usuário
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ error: 'Não autenticado' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Verificar se o usuário é admin e obter tenant_id
    const { data: userRole, error: rolesError } = await supabaseClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .single();

    if (rolesError || !userRole || userRole.role !== 'admin') {
      console.error('User is not admin:', rolesError);
      return new Response(
        JSON.stringify({ error: 'Acesso negado: apenas administradores podem gerar chaves' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const tenantId = userRole.tenant_id;

    const { expiresInHours, maxUses = 1, description }: GenerateKeyRequest = await req.json();

    if (!expiresInHours || expiresInHours <= 0) {
      return new Response(
        JSON.stringify({ error: 'expiresInHours é obrigatório e deve ser positivo' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Gerar chave no formato XXXX-XXXX-XXXX-XXXX
    const generateKey = () => {
      const segments = [];
      for (let i = 0; i < 4; i++) {
        const segment = Math.random().toString(36).substring(2, 6).toUpperCase();
        segments.push(segment);
      }
      return segments.join('-');
    };

    const enrollmentKey = generateKey();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

    // Usar service role para inserir a chave
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: keyData, error: insertError } = await supabaseAdmin
      .from('enrollment_keys')
      .insert({
        key: enrollmentKey,
        created_by: user.id,
        expires_at: expiresAt,
        max_uses: maxUses,
        description: description || `Chave gerada por ${user.email}`,
        tenant_id: tenantId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting key:', insertError);
      return new Response(
        JSON.stringify({ error: 'Erro ao gerar chave de enrollment' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Enrollment key created: ${enrollmentKey} by user ${user.email}`);

    return new Response(
      JSON.stringify({
        enrollmentKey: keyData.key,
        expiresAt: keyData.expires_at,
        maxUses: keyData.max_uses,
        description: keyData.description,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in generate-enrollment-key:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
