import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID().slice(0, 8)
  console.log(`[${requestId}] detect-blocked-attempts: Starting correlation...`)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Execute the correlation function
    const { data, error } = await supabase.rpc('detect_blocked_access_attempts')

    if (error) {
      console.error(`[${requestId}] Detection failed:`, error)
      return new Response(
        JSON.stringify({ 
          status: 'error', 
          error: error.message,
          requestId 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const insertedCount = data?.[0]?.inserted_count ?? 0
    console.log(`[${requestId}] Detected ${insertedCount} new blocked attempts`)

    return new Response(
      JSON.stringify({ 
        status: 'ok',
        inserted_count: insertedCount,
        requestId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error(`[${requestId}] Exception:`, err)
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        error: String(err),
        requestId 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
