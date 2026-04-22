/**
 * verify-compliance-report handler — Inlined into public-gateway (Phase 6D)
 * Cryptographic verification of compliance reports.
 */
import { logger } from '../../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { requireEnv } from '../../_shared/env.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { timingSafeEqual } from '../../_shared/crypto-utils.ts';

const VerifySchema = z.object({
  audit_id: z.string().min(1, 'audit_id is required'),
});

async function generateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function generateHMAC(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
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

export async function handleVerifyComplianceReport(
  supabase: SupabaseClient,
  req: Request,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  // Support GET (query param) and POST (payload)
  let auditId: string | null = null;

  if (req.method === "GET") {
    auditId = (payload.audit_id as string) || null;
  } else {
    const parsed = VerifySchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false, error: 'audit_id is required', integrity: { valid: false }, __status: 400 };
    }
    auditId = parsed.data.audit_id;
  }

  if (!auditId) {
    return { success: false, error: 'audit_id is required', integrity: { valid: false }, __status: 400 };
  }

  logger.info(`[verify-compliance-report][${requestId}] Verifying report: ${auditId}`);

  const { data: report, error: fetchError } = await supabase
    .from("generated_reports")
    .select("id, audit_id, sha256, hmac_signature, report_data, tenant_id, title, risk_score, risk_level, status, created_at, expires_at, report_type")
    .eq("audit_id", auditId)
    .single();

  if (fetchError || !report) {
    return { success: false, error: 'Relatorio nao encontrado', audit_id: auditId, integrity: { valid: false }, __status: 404 };
  }

  const typedReport = report as ReportData;
  const hmacSecret = requireEnv('COMPLIANCE_HMAC_SECRET');

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

  const calculatedSha256 = await generateSHA256(payloadForHash);
  const calculatedHmac = await generateHMAC(payloadForHash, hmacSecret);

  const [sha256Match, hmacValid] = await Promise.all([
    timingSafeEqual(calculatedSha256, typedReport.sha256),
    timingSafeEqual(calculatedHmac, typedReport.hmac_signature),
  ]);
  const isIntegrityValid = sha256Match && hmacValid;
  const isExpired = typedReport.expires_at ? new Date(typedReport.expires_at) < new Date() : false;

  const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";

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

  if (isIntegrityValid) {
    await supabase
      .from("generated_reports")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", typedReport.id);
  }

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
}
