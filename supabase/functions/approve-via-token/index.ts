// SECURITY FIX: Removed deprecated std/http/server import (bundling risk)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit config for token approval: strict to prevent brute-force
const RATE_LIMIT_CONFIG = {
  maxRequests: 10,      // 10 attempts
  windowMinutes: 15,    // per 15 minutes
  blockMinutes: 60,     // block for 1 hour if exceeded
};

/**
 * One-Click Approval via Token
 * 
 * This edge function allows approving playbook execution requests
 * via a direct link with a secure token.
 * 
 * Security:
 * - Token is single-use (cleared after approval)
 * - Token expires in 24h
 * - Full audit trail (IP, user-agent, timestamp)
 * - No authentication required (token IS the secret)
 * - Rate limited by IP to prevent brute-force attacks
 */

interface ApprovalResult {
  success: boolean;
  message: string;
  playbook_name?: string;
  execution_id?: string;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  // Extract client info for audit
  const clientIp = req.headers.get('cf-connecting-ip') || 
                   req.headers.get('x-real-ip') || 
                   req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                   'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  // Create supabase client early for rate limiting
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Rate limit by IP to prevent brute-force token guessing
  const rateLimitResult = await checkRateLimit(
    supabase,
    clientIp,
    'approve-via-token',
    RATE_LIMIT_CONFIG
  );

  if (!rateLimitResult.allowed) {
    logger.info(`[approve-via-token] Rate limited - IP: ${clientIp} - resetAt: ${rateLimitResult.resetAt} - requestId: ${requestId}`);
    return generateHtmlResponse({
      success: false,
      message: `Muitas tentativas. Tente novamente após ${rateLimitResult.resetAt?.toLocaleString('pt-BR')}`,
      error: 'RATE_LIMITED'
    });
  }

  try {
    // Accept token from query string (GET) or body (POST)
    let token: string | null = null;
    
    if (req.method === 'GET') {
      const url = new URL(req.url);
      token = url.searchParams.get('token');
    } else if (req.method === 'POST') {
      const body = await req.json();
      token = body.token;
    } else {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!token) {
      logger.info(`[approve-via-token] Missing token - requestId: ${requestId}`);
      return generateHtmlResponse({
        success: false,
        message: 'Token de aprovação não fornecido',
        error: 'MISSING_TOKEN'
      });
    }

    logger.info(`[approve-via-token] Processing approval - token: ${token.substring(0, 8)}... - requestId: ${requestId}`);

    // Find approval request by token
    const { data: approvalRequest, error: findError } = await supabase
      .from('approval_requests')
      .select(`
        id,
        tenant_id,
        playbook_execution_id,
        action_type,
        action_payload,
        status,
        expires_at,
        approval_token_expires_at,
        required_approvers,
        current_approvers
      `)
      .eq('approval_token', token)
      .single();

    if (findError || !approvalRequest) {
      logger.info(`[approve-via-token] Token not found or invalid - requestId: ${requestId}`);
      return generateHtmlResponse({
        success: false,
        message: 'Token de aprovação inválido ou não encontrado',
        error: 'INVALID_TOKEN'
      });
    }

    // Validate status
    if (approvalRequest.status !== 'pending') {
      logger.info(`[approve-via-token] Request already processed - status: ${approvalRequest.status} - requestId: ${requestId}`);
      return generateHtmlResponse({
        success: false,
        message: `Esta solicitação já foi processada (status: ${approvalRequest.status})`,
        error: 'ALREADY_PROCESSED'
      });
    }

    // Validate token expiration
    const now = new Date();
    if (approvalRequest.approval_token_expires_at && new Date(approvalRequest.approval_token_expires_at) < now) {
      logger.info(`[approve-via-token] Token expired - requestId: ${requestId}`);
      return generateHtmlResponse({
        success: false,
        message: 'O link de aprovação expirou',
        error: 'TOKEN_EXPIRED'
      });
    }

    // Validate request expiration
    if (approvalRequest.expires_at && new Date(approvalRequest.expires_at) < now) {
      logger.info(`[approve-via-token] Request expired - requestId: ${requestId}`);
      return generateHtmlResponse({
        success: false,
        message: 'A solicitação de aprovação expirou',
        error: 'REQUEST_EXPIRED'
      });
    }

    // Extract playbook info from action_payload
    const payload = approvalRequest.action_payload as Record<string, unknown>;
    const playbookName = (payload?.playbook_name as string) || 'Playbook';
    const executionId = (payload?.execution_id as string) || approvalRequest.playbook_execution_id;

    // Approve the request
    const { error: updateError } = await supabase
      .from('approval_requests')
      .update({
        status: 'approved',
        approved_at: now.toISOString(),
        current_approvers: approvalRequest.required_approvers, // Mark as fully approved
        approval_token: null, // Invalidate token (single-use)
        approval_token_expires_at: null,
      })
      .eq('id', approvalRequest.id);

    if (updateError) {
      logger.error(`[approve-via-token] Failed to update request - error: ${updateError.message} - requestId: ${requestId}`);
      return generateHtmlResponse({
        success: false,
        message: 'Erro ao processar aprovação',
        error: 'UPDATE_FAILED'
      });
    }

    logger.info(`[approve-via-token] Request approved successfully - id: ${approvalRequest.id} - requestId: ${requestId}`);

    // Create audit log entry
    await supabase.from('audit_logs').insert({
      tenant_id: approvalRequest.tenant_id,
      action: 'approve_via_token',
      resource_type: 'approval_request',
      resource_id: approvalRequest.id,
      success: true,
      details: {
        playbook_name: playbookName,
        execution_id: executionId,
        approved_via: 'one_click_link',
        client_ip: clientIp,
        user_agent: userAgent,
        request_id: requestId,
        processing_time_ms: Date.now() - startTime,
      },
    });

    // Log in risk_decision_log
    await supabase.from('risk_decision_log').insert({
      tenant_id: approvalRequest.tenant_id,
      playbook_execution_id: executionId,
      event_type: 'one_click_approval',
      playbook_id: payload?.playbook_id as string,
      playbook_name: playbookName,
      decision: 'approved_via_token',
      decision_reason: 'Approved via one-click email link',
      context: {
        approval_request_id: approvalRequest.id,
        approved_via: 'one_click_link',
        client_ip: clientIp,
        user_agent: userAgent,
      },
    });

    // Create system alert to notify about approval
    await supabase.from('system_alerts').insert({
      tenant_id: approvalRequest.tenant_id,
      alert_type: 'playbook_approved',
      severity: 'info',
      message: `Playbook "${playbookName}" foi aprovado via link direto`,
      metadata: {
        approval_request_id: approvalRequest.id,
        execution_id: executionId,
        approved_via: 'one_click_link',
      },
    });

    // Trigger execution by updating playbook_execution status
    if (executionId) {
      await supabase
        .from('playbook_executions')
        .update({ 
          status: 'in_progress',
          auto_executed: false,
          triggered_by: 'one_click_approval',
        })
        .eq('id', executionId);
    }

    logger.info(`[approve-via-token] Approval complete - execution: ${executionId} - time: ${Date.now() - startTime}ms - requestId: ${requestId}`);

    return generateHtmlResponse({
      success: true,
      message: 'Aprovação realizada com sucesso!',
      playbook_name: playbookName,
      execution_id: executionId,
    });

  } catch (error) {
    logger.error(`[approve-via-token] Error: ${error} - requestId: ${requestId}`);
    return generateHtmlResponse({
      success: false,
      message: 'Erro interno ao processar aprovação',
      error: error instanceof Error ? error.message : 'INTERNAL_ERROR'
    });
  }
});

/**
 * Generate HTML response for browser display
 */
function generateHtmlResponse(result: ApprovalResult): Response {
  const isSuccess = result.success;
  const statusCode = isSuccess ? 200 : (result.error === 'INTERNAL_ERROR' ? 500 : 400);
  
  const bgColor = isSuccess ? '#22c55e' : '#ef4444';
  const icon = isSuccess ? '✅' : '❌';
  const title = isSuccess ? 'Aprovação Concluída' : 'Erro na Aprovação';
  
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - CyberShield</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 500px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }
    .icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    .status-badge {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      background: ${bgColor};
      color: white;
      margin-bottom: 20px;
    }
    h1 {
      color: #1e293b;
      font-size: 24px;
      margin-bottom: 16px;
    }
    .message {
      color: #64748b;
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .details {
      background: #f8fafc;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
      text-align: left;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      color: #64748b;
      font-size: 14px;
    }
    .detail-value {
      color: #1e293b;
      font-size: 14px;
      font-weight: 500;
    }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      background: #3b82f6;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #2563eb;
    }
    .footer {
      margin-top: 24px;
      color: #94a3b8;
      font-size: 12px;
    }
    .redirect-notice {
      margin-top: 16px;
      color: #64748b;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <span class="status-badge">${isSuccess ? 'Aprovado' : 'Erro'}</span>
    <h1>${title}</h1>
    <p class="message">${result.message}</p>
    
    ${isSuccess && result.playbook_name ? `
      <div class="details">
        <div class="detail-row">
          <span class="detail-label">Playbook</span>
          <span class="detail-value">${result.playbook_name}</span>
        </div>
        ${result.execution_id ? `
          <div class="detail-row">
            <span class="detail-label">Execução</span>
            <span class="detail-value">${result.execution_id.substring(0, 8)}...</span>
          </div>
        ` : ''}
        <div class="detail-row">
          <span class="detail-label">Status</span>
          <span class="detail-value">Em execução</span>
        </div>
      </div>
    ` : ''}
    
    ${!isSuccess && result.error ? `
      <div class="details">
        <div class="detail-row">
          <span class="detail-label">Código</span>
          <span class="detail-value">${result.error}</span>
        </div>
      </div>
    ` : ''}
    
    <a href="/" class="btn">Ir para o Dashboard</a>
    
    <p class="redirect-notice">
      Você será redirecionado automaticamente em <span id="countdown">5</span> segundos...
    </p>
    
    <p class="footer">CyberShield Security Platform</p>
  </div>
  
  <script>
    let seconds = 5;
    const countdown = document.getElementById('countdown');
    const interval = setInterval(() => {
      seconds--;
      countdown.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(interval);
        window.location.href = '/';
      }
    }, 1000);
  </script>
</body>
</html>
  `;

  return new Response(html, {
    status: statusCode,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
