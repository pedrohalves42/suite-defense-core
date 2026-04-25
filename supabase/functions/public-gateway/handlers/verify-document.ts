/**
 * verify-document handler — Inlined into public-gateway (Phase 6D)
 * Returns signature metadata for external verification.
 */
import { z } from 'https://esm.sh/zod@3.23.8';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const DocumentNameSchema = z.string().min(1).max(255).regex(/^[a-zA-Z0-9_.\-]+$/);

export async function handleVerifyDocument(
  supabase: any,
  req: Request,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  // Support both GET (query param) and POST (payload)
  let documentName: string | undefined;

  if (payload.name && typeof payload.name === 'string') {
    documentName = payload.name;
  } else {
    const url = new URL(req.url);
    documentName = url.searchParams.get('name') || undefined;
  }

  const nameResult = DocumentNameSchema.safeParse(documentName);
  if (!nameResult.success) {
    return {
      error: 'Invalid or missing parameter: name',
      usage: 'POST { action: "public:verify-document", payload: { name: "DOCUMENT_NAME" } }',
      __status: 400,
    };
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
    .eq('document_name', nameResult.data)
    .single();

  if (error || !doc) {
    return {
      error: 'Document not found',
      document: nameResult.data,
      hint: 'Verify the document name is correct and has been signed',
      __status: 404,
    };
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
    verification_note: 'This endpoint returns signature data. Verification must be performed by the caller using the public key. The system does NOT assert validity.',
  };
}
