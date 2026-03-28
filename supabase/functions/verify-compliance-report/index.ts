/**
 * Verify Compliance Report - Migrated to servePublic middleware
 * Public endpoint for cryptographic verification of compliance reports.
 * No authentication required ? anyone with an audit_id can verify.
 */
import { servePublic } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { requireEnv } from '../_shared/env.ts';

const VerifySchema = z.object({
  audit_id: z.string().min(1, 'audit_id is required'),
});

// Real SHA256 using Web Crypto API
async function generateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// HMAC-SHA256 for digital signature verification
async function generateHMAC(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const dataBuffer = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, dataBuffer);
  const signatureArray = Array.from(new Uint8Array(signature));
  return signatureArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

interface ReportData {
  id: string;
  audit_id: string;
  sha256: string;
  hmac_signature: string;
  report_data: Record<string, unknown>;
  tenant_id: string;
  title: string;
  risk_score: number | null;
  risk_level: string | null;
  status: string;
  created_at: string;
  expires_at: string | null;
  report_type: string;
}

servePublic(async (req, ctx) => {
  const { supabase, requestId } = ctx;

  // Get audit_id from query params (GET) or body (POST)
  let auditId: string | null = null;

  if (req.method === "GET") {
    const url = new URL(req.url);
    auditId = url.searchParams.get("audit_id");
  } else {
    const parsed = VerifySchema.safeParse(ctx.body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ success: false, error: 'audit_id is required', integrity: { valid: false } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    auditId = parsed.data.audit_id;
  }

  if (!auditId) {
    return new Response(
      JSON.stringify({ success: false, error: 'audit_id is required', integrity: { valid: false } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[verify-compliance-report][${requestId}] Verifying report: ${auditId}`);

  // Fetch report by audit_id
  const { data: report, error: fetchError } = await supabase
    .from("generated_reports")
    .select("id, audit_id, sha256, hmac_signature, report_data, tenant_id, title, risk_score, risk_level, status, created_at, expires_at, report_type")
    .eq("audit_id", auditId)
    .single();

  if (fetchError || !report) {
    logger.info(`[verify-compliance-report][${requestId}] Report NOT found for audit_id: "${auditId}"`);
    return new Response(
      JSON.stringify({ success: false, error: 'Relatorio nao encontrado', audit_id: auditId, integrity: { valid: false } }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const typedReport = report as ReportData;

  // Get HMAC secret for verification
  const hmacSecret = requireEnv('COMPLIANCE_HMAC_SECRET');

  // Reconstruct payload for hash verification
  const reportData = typedReport.report_data;
  const payloadForHash = JSON.stringify({
    audit_id: reportData.audit_id,
    tenant_id: reportData.tenant_id,
    tenant_name: reportData.tenant_name,
    template: reportData.template,
    period_start: reportData.period_start,
    period_end: reportData.period_end,
    generated_at: reportData.generated_at,
    risk_score: reportData.risk_score,
    statistics: reportData.statistics,
  });

  // Calculate hashes
  const calculatedSha256 = await generateSHA256(payloadForHash);
  const calculatedHmac = await generateHMAC(payloadForHash, hmacSecret);

  // Verify integrity
  const sha256Match = calculatedSha256 === typedReport.sha256;
  const hmacValid = calculatedHmac === typedReport.hmac_signature;
  const isIntegrityValid = sha256Match && hmacValid;

  // Check expiration
  const isExpired = typedReport.expires_at ? new Date(typedReport.expires_at) < new Date() : false;

  // Get client IP for audit trail
  const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";

  // Log verification to audit trail
  await supabase.from("audit_report_verifications").insert({
    report_id: typedReport.id,
    audit_id: auditId,
    sha256_match: sha256Match,
    hmac_valid: hmacValid,
    verification_ip: clientIp,
    verification_method: req.method === "GET" ? "api_get" : "api_post",
    verification_details: {
      calculated_sha256: calculatedSha256.substring(0, 16) + "...",
      expected_sha256: typedReport.sha256?.substring(0, 16) + "...",
      is_expired: isExpired,
      verified_at: new Date().toISOString(),
    },
  });

  // Update report with last verification time if valid
  if (isIntegrityValid) {
    await supabase
      .from("generated_reports")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", typedReport.id);
  }

  // Get tenant name
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", typedReport.tenant_id)
    .single();

  logger.info(`[verify-compliance-report][${requestId}] Verification: SHA256=${sha256Match}, HMAC=${hmacValid}`);

  return {
    success: true,
    audit_id: auditId,
    report_id: typedReport.id,
    integrity: {
      valid: isIntegrityValid,
      sha256_match: sha256Match,
      hmac_valid: hmacValid,
      algorithm: "SHA256 + HMAC-SHA256",
    },
    report: {
      title: typedReport.title,
      report_type: typedReport.report_type,
      risk_score: typedReport.risk_score,
      risk_level: typedReport.risk_level,
      status: typedReport.status,
      created_at: typedReport.created_at,
      expires_at: typedReport.expires_at,
      is_expired: isExpired,
      tenant_name: tenant?.name ?? "Unknown",
      template: reportData.template,
      template_name: reportData.template_name,
      period_start: reportData.period_start,
      period_end: reportData.period_end,
      statistics: reportData.statistics,
    },
    hashes: {
      sha256: typedReport.sha256,
      sha256_preview: typedReport.sha256?.substring(0, 16) + "...",
    },
    verification: {
      verified_at: new Date().toISOString(),
      verification_method: "cryptographic",
      compliance_standards: ["SOC2", "ISO 27001"],
    },
  };
}, { methods: ['GET', 'POST'] });
