/**
 * Approve via Token - Migrated to servePublic
 * One-click approval via secure token link.
 * No auth required - the token IS the secret.
 */
import { servePublic } from '../_shared/serve-tenant.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';

interface ApprovalResult {
  success: boolean;
  message: string;
  playbook_name?: string;
  execution_id?: string;
  error?: string;
}

servePublic(async (req, ctx) => {
  const { supabase, requestId } = ctx;
  const startTime = Date.now();

  const clientIp = req.headers.get('cf-connecting-ip') ||
                   req.headers.get('x-real-ip') ||
                   req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                   'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  const rateLimitResult = await checkRateLimit(supabase, clientIp, 'approve-via-token', {
    maxRequests: 10, windowMinutes: 15, blockMinutes: 60,
  });

  if (!rateLimitResult.allowed) {
    return generateHtmlResponse({
      success: false,
      message: `Muitas tentativas. Tente novamente apos ${rateLimitResult.resetAt?.toLocaleString('pt-BR')}`,
      error: 'RATE_LIMITED',
    });
  }

  let token: string | null = null;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    token = url.searchParams.get('token');
  } else if (req.method === 'POST') {
    const body = ctx.body as Record<string, unknown>;
    token = (body?.token as string) || null;
  }

  if (!token) {
    return generateHtmlResponse({ success: false, message: 'Token de aprovacao nao fornecido', error: 'MISSING_TOKEN' });
  }

  logger.info(`[approve-via-token] Processing approval - token: ${token.substring(0, 8)}... - requestId: ${requestId}`);

  const { data: approvalRequest, error: findError } = await supabase
    .from('approval_requests')
    .select('id, tenant_id, playbook_execution_id, action_type, action_payload, status, expires_at, approval_token_expires_at, required_approvers, current_approvers')
    .eq('approval_token', token)
    .single();

  if (findError || !approvalRequest) {
    return generateHtmlResponse({ success: false, message: 'Token de aprovacao invalido ou nao encontrado', error: 'INVALID_TOKEN' });
  }

  if (approvalRequest.status !== 'pending') {
    return generateHtmlResponse({ success: false, message: `Esta solicitacao ja foi processada (status: ${approvalRequest.status})`, error: 'ALREADY_PROCESSED' });
  }

  const now = new Date();
  if (approvalRequest.approval_token_expires_at && new Date(approvalRequest.approval_token_expires_at) < now) {
    return generateHtmlResponse({ success: false, message: 'O link de aprovacao expirou', error: 'TOKEN_EXPIRED' });
  }
  if (approvalRequest.expires_at && new Date(approvalRequest.expires_at) < now) {
    return generateHtmlResponse({ success: false, message: 'A solicitacao de aprovacao expirou', error: 'REQUEST_EXPIRED' });
  }

  const payload = approvalRequest.action_payload as Record<string, unknown>;
  const playbookName = (payload?.playbook_name as string) || 'Playbook';
  const executionId = (payload?.execution_id as string) || approvalRequest.playbook_execution_id;

  const { error: updateError } = await supabase
    .from('approval_requests')
    .update({
      status: 'approved', approved_at: now.toISOString(),
      current_approvers: approvalRequest.required_approvers,
      approval_token: null, approval_token_expires_at: null,
    })
    .eq('id', approvalRequest.id);

  if (updateError) {
    return generateHtmlResponse({ success: false, message: 'Erro ao processar aprovacao', error: 'UPDATE_FAILED' });
  }

  await supabase.from('audit_logs').insert({
    tenant_id: approvalRequest.tenant_id, action: 'approve_via_token',
    resource_type: 'approval_request', resource_id: approvalRequest.id,
    success: true,
    details: {
      playbook_name: playbookName, execution_id: executionId,
      approved_via: 'one_click_link', client_ip: clientIp, user_agent: userAgent,
      request_id: requestId, processing_time_ms: Date.now() - startTime,
    },
  });

  await supabase.from('risk_decision_log').insert({
    tenant_id: approvalRequest.tenant_id, playbook_execution_id: executionId,
    event_type: 'one_click_approval', playbook_id: payload?.playbook_id as string,
    playbook_name: playbookName, decision: 'approved_via_token',
    decision_reason: 'Approved via one-click email link',
    context: { approval_request_id: approvalRequest.id, approved_via: 'one_click_link', client_ip: clientIp, user_agent: userAgent },
  });

  await supabase.from('system_alerts').insert({
    tenant_id: approvalRequest.tenant_id, alert_type: 'playbook_approved', severity: 'info',
    message: `Playbook "${playbookName}" foi aprovado via link direto`,
    metadata: { approval_request_id: approvalRequest.id, execution_id: executionId, approved_via: 'one_click_link' },
  });

  if (executionId) {
    await supabase.from('playbook_executions').update({
      status: 'in_progress', auto_executed: false, triggered_by: 'one_click_approval',
    }).eq('id', executionId);
  }

  return generateHtmlResponse({
    success: true, message: 'Aprovacao realizada com sucesso!',
    playbook_name: playbookName, execution_id: executionId,
  });
}, { methods: ['GET', 'POST'] });

function generateHtmlResponse(result: ApprovalResult): Response {
  const isSuccess = result.success;
  const statusCode = isSuccess ? 200 : (result.error === 'INTERNAL_ERROR' ? 500 : 400);
  const bgColor = isSuccess ? '#22c55e' : '#ef4444';
  const icon = isSuccess ? '[OK] ' : '[ERROR] ';
  const title = isSuccess ? 'Aprovacao Concluida' : 'Erro na Aprovacao';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} - CyberShield</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#fff;border-radius:16px;padding:40px;max-width:500px;width:100%;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,.25)}.icon{font-size:64px;margin-bottom:20px}.status-badge{display:inline-block;padding:8px 16px;border-radius:20px;font-size:12px;font-weight:600;text-transform:uppercase;background:${bgColor};color:#fff;margin-bottom:20px}h1{color:#1e293b;font-size:24px;margin-bottom:16px}.message{color:#64748b;font-size:16px;line-height:1.6;margin-bottom:24px}.btn{display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-weight:500}.footer{margin-top:24px;color:#94a3b8;font-size:12px}</style></head>
<body><div class="card"><div class="icon">${icon}</div><span class="status-badge">${isSuccess ? 'Aprovado' : 'Erro'}</span><h1>${title}</h1><p class="message">${result.message}</p><a href="/" class="btn">Ir para o Dashboard</a><p class="footer">CyberShield Security Platform</p></div>
<script>let s=5;const c=setInterval(()=>{if(--s<=0){clearInterval(c);window.location.href='/'}},1000)</script></body></html>`;

  return new Response(html, {
    status: statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
