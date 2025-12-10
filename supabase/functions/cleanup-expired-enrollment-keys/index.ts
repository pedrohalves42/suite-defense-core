import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger, loggerWithContext } from '../_shared/logger.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const log = loggerWithContext(requestId);

  try {
    // Extrair token de autorizacao
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      log.warn('Authorization header missing');
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verificar se usuario e admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      log.warn('Invalid token provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: hasRole, error: roleError } = await supabaseClient.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (roleError || !hasRole) {
      log.warn('User lacks admin role', { userId: user.id });
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deletar enrollment keys expiradas ha mais de 48 horas e inativas
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    log.info('Starting cleanup of expired enrollment keys', { threshold: fortyEightHoursAgo.toISOString() });

    const { data, error } = await supabaseClient
      .from('enrollment_keys')
      .delete()
      .lt('expires_at', fortyEightHoursAgo.toISOString())
      .eq('is_active', false)
      .select('id');

    if (error) {
      log.error('Error deleting expired keys', error);
      throw error;
    }

    const deletedCount = data?.length || 0;

    log.success('Cleanup completed', { deletedCount, timestamp: new Date().toISOString() });

    return new Response(
      JSON.stringify({
        success: true,
        deleted_count: deletedCount,
        message: `Limpeza concluida: ${deletedCount} chaves expiradas removidas`,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }, 
        status: 200 
      }
    );
  } catch (error) {
    log.error('Cleanup error', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }, 
        status: 500 
      }
    );
  }
});
