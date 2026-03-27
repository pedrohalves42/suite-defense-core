import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestId = crypto.randomUUID().substring(0, 8);
    logger.info(`[verify-compliance-report][${requestId}] === INICIANDO VERIFICAÇÃO ===`);
    logger.info(`[verify-compliance-report][${requestId}] Method: ${req.method}`);
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get audit_id from query params or body
    let auditId: string | null = null;
    
    if (req.method === "GET") {
      const url = new URL(req.url);
      auditId = url.searchParams.get("audit_id");
      logger.info(`[verify-compliance-report][${requestId}] GET audit_id from query: ${auditId}`);
    } else if (req.method === "POST") {
      const body = await req.json();
      auditId = body.audit_id;
      logger.info(`[verify-compliance-report][${requestId}] POST audit_id from body: ${auditId}`);
    }

    if (!auditId) {
      logger.info(`[verify-compliance-report][${requestId}] ERROR: audit_id não fornecido`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "audit_id is required",
        integrity: { valid: false }
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    logger.info(`[verify-compliance-report][${requestId}] Buscando relatório com audit_id: "${auditId}"`);

    // Fetch report by audit_id
    const { data: report, error: fetchError } = await supabase
      .from("generated_reports")
      .select("id, audit_id, sha256, hmac_signature, report_data, tenant_id, title, risk_score, risk_level, status, created_at, expires_at, report_type")
      .eq("audit_id", auditId)
      .single();

    logger.info(`[verify-compliance-report][${requestId}] Resultado da busca:`, {
      found: !!report,
      error: fetchError?.message || null,
      report_id: report?.id || null,
      report_audit_id: report?.audit_id || null
    });

    if (fetchError || !report) {
      logger.info(`[verify-compliance-report][${requestId}] ERRO: Relatório NÃO encontrado para audit_id: "${auditId}"`);
      
      // Lista os audit_ids existentes para debug
      const { data: existingReports } = await supabase
        .from("generated_reports")
        .select("audit_id, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      
      logger.info(`[verify-compliance-report][${requestId}] Últimos 5 audit_ids no banco:`, existingReports?.map(r => r.audit_id) || []);
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Relatório não encontrado",
        audit_id: auditId,
        integrity: { valid: false },
        debug: {
          searched_audit_id: auditId,
          existing_audit_ids: existingReports?.map(r => r.audit_id) || []
        }
      }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    logger.info(`[verify-compliance-report][${requestId}] SUCESSO: Relatório encontrado!`, {
      id: report.id,
      audit_id: report.audit_id,
      title: report.title,
      has_sha256: !!report.sha256,
      has_hmac: !!report.hmac_signature
    });

    const typedReport = report as ReportData;

    // Get HMAC secret for verification
    const hmacSecret = Deno.env.get("COMPLIANCE_HMAC_SECRET");
    if (!hmacSecret) {
      logger.error("[verify-compliance-report] COMPLIANCE_HMAC_SECRET not configured!");
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Server configuration error",
        integrity: { valid: false }
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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
    const clientIp = req.headers.get("x-forwarded-for") || 
                     req.headers.get("x-real-ip") || 
                     "unknown";

    // Log verification to audit trail
    const { error: logError } = await supabase
      .from("audit_report_verifications")
      .insert({
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

    if (logError) {
      logger.error("[verify-compliance-report] Failed to log verification:", logError);
    }

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

    logger.info(`[verify-compliance-report] Verification for ${auditId}: SHA256=${sha256Match}, HMAC=${hmacValid}, IP=${clientIp}`);

    return new Response(JSON.stringify({
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
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    logger.error("[verify-compliance-report] ERROR CRÍTICO:", error);
    logger.error("[verify-compliance-report] Stack:", error instanceof Error ? error.stack : "N/A");
    return new Response(JSON.stringify({ 
      success: false, 
      error: "Internal server error",
      integrity: { valid: false },
      debug: { message: error instanceof Error ? error.message : String(error) }
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
