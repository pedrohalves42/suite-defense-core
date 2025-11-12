import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Deletar enrollment keys expiradas há mais de 48 horas e inativas
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const { data, error } = await supabaseClient
      .from('enrollment_keys')
      .delete()
      .lt('expires_at', fortyEightHoursAgo.toISOString())
      .eq('is_active', false)
      .select('id');

    if (error) {
      console.error('Error deleting expired keys:', error);
      throw error;
    }

    const deletedCount = data?.length || 0;

    console.log(`Cleanup completed: ${deletedCount} expired keys deleted at ${new Date().toISOString()}`);

    return new Response(
      JSON.stringify({
        success: true,
        deleted_count: deletedCount,
        message: `Limpeza concluída: ${deletedCount} chaves expiradas removidas`,
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
    console.error('Cleanup error:', error);
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
