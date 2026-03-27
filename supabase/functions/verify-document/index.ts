import { servePublic } from '../_shared/serve-tenant.ts';

/**
 * Verify Document - Public Endpoint (No Auth Required)
 * Returns signature metadata for external verification.
 * ZERO TRUST: This endpoint does NOT validate signatures.
 * 
 * GET /verify-document?name=CYBERSHIELD_WHITEPAPER.md
 */

servePublic(async (req, ctx) => {
  const { supabase, requestId } = ctx;

  const url = new URL(req.url);
  const documentName = url.searchParams.get('name');

  if (!documentName) {
    return new Response(
      JSON.stringify({ 
        error: 'Missing required parameter: name',
        usage: 'GET /verify-document?name=DOCUMENT_NAME'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

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
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return {
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
  };
});
