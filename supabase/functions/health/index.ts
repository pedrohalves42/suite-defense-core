import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { 
  EDGE_VERSION, 
  EDGE_BUILD_TIMESTAMP,
  getSystemMode,
  validateSchema,
  addHealthHeaders
} from '../_shared/health-probe.ts'

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey'
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: addHealthHeaders(corsHeaders) })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Check system mode
    const systemMode = await getSystemMode(supabase);
    
    // Validate critical schema
    const schemaValidation = await validateSchema(supabase);

    // Test DB connection with simple query
    const { error: dbError } = await supabase
      .from('agents')
      .select('id')
      .limit(1)

    if (dbError) {
      return new Response(
        JSON.stringify({ 
          status: 'unhealthy',
          component: 'database',
          error: dbError.message,
          timestamp: new Date().toISOString(),
          edge_version: EDGE_VERSION
        }),
        { 
          status: 503, 
          headers: addHealthHeaders({ ...corsHeaders, 'Content-Type': 'application/json' })
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        status: schemaValidation.valid ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        edge_version: EDGE_VERSION,
        edge_build: EDGE_BUILD_TIMESTAMP,
        system_mode: systemMode,
        schema_valid: schemaValidation.valid,
        missing_tables: schemaValidation.missingTables,
        uptime: 'ok'
      }),
      { 
        status: 200, 
        headers: addHealthHeaders({ ...corsHeaders, 'Content-Type': 'application/json' })
      }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        message: errorMessage,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
