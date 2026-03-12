/**
 * send-security-alert — Migrated to serveTenant() middleware (V-1095)
 * Previously had no tenant validation for the caller.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { corsHeaders } from '../_shared/cors.ts';

serveTenant(async (_req, ctx) => {
  const { tenantId, userId, supabase, body, req } = ctx;

  const { alertType, severity, details } = body;

  if (!alertType || !severity) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: alertType, severity' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Extract IP from request
  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                    req.headers.get('x-real-ip') || 
                    'unknown';

  // Insert security log
  const { error: logError } = await supabase
    .from('security_logs')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      ip_address: ipAddress,
      endpoint: '/send-security-alert',
      attack_type: alertType === 'integrity_failure' ? 'control_characters' : 'unauthorized',
      severity,
      blocked: true,
      details: details || {},
      user_agent: req.headers.get('user-agent') || null,
    });

  if (logError) {
    console.error('[SECURITY-ALERT] Failed to log security event:', logError);
  }

  console.log(`[SECURITY-ALERT] ${severity.toUpperCase()} - ${alertType}`, {
    user_id: userId,
    tenant_id: tenantId,
    ip_address: ipAddress,
    details,
  });

  // For critical/high severity, create system alert
  if (severity === 'critical' || severity === 'high') {
    try {
      await supabase
        .from('system_alerts')
        .insert({
          tenant_id: tenantId,
          alert_type: alertType,
          severity,
          title: `Alerta de Seguranca: ${alertType}`,
          message: `Tentativa suspeita detectada: ${JSON.stringify(details)}`,
          details: details || {},
        });
    } catch (alertError) {
      console.error('[SECURITY-ALERT] Failed to create system alert:', alertError);
    }
  }

  return { success: true, message: 'Security alert logged successfully' };
});
