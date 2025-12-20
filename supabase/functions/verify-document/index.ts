import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

/**
 * Verify Document - Public Endpoint (No Auth Required)
 * 
 * Returns signature metadata for external verification.
 * ZERO TRUST: This endpoint does NOT validate signatures.
 * Validation must be performed by the caller using the public key.
 * 
 * GET /verify-document?name=CYBERSHIELD_WHITEPAPER.md
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const documentName = url.searchParams.get('name');

    if (!documentName) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required parameter: name',
          usage: 'GET /verify-document?name=DOCUMENT_NAME'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch document signature from database
    const { data: doc, error } = await supabase
      .from('signed_documents')
      .select(`
        document_name,
        document_hash,
        signature_base64,
        algorithm,
        curve,
        hash_algorithm,
        signed_at,
        signed_by,
        invariants_version,
        audit_level
      `)
      .eq('document_name', documentName)
      .single();

    if (error || !doc) {
      return new Response(
        JSON.stringify({ 
          error: 'Document not found',
          document: documentName,
          hint: 'Verify the document name is correct and has been signed'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ZERO TRUST: Return data for external verification
    // This endpoint NEVER claims signature validity
    return new Response(
      JSON.stringify({
        document: doc.document_name,
        document_hash: doc.document_hash,
        signature_base64: doc.signature_base64,
        algorithm: doc.algorithm,
        curve: doc.curve,
        hash_algorithm: doc.hash_algorithm,
        signed_at: doc.signed_at,
        signed_by: doc.signed_by,
        invariants_version: doc.invariants_version,
        audit_level: doc.audit_level,
        verification_note: 'This endpoint returns signature data. Verification must be performed by the caller using the public key. The system does NOT assert validity.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const error = err as Error;
    console.error('[verify-document] Error:', error.message);
    
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
