import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export interface SecurityLogParams {
  supabase: SupabaseClient;
  tenantId?: string;
  userId?: string;
  ipAddress: string;
  endpoint: string;
  attackType: 'sql_injection' | 'xss' | 'path_traversal' | 'rate_limit' | 'invalid_input' | 'brute_force' | 'unauthorized' | 'control_characters' | 'duplicate_job_submission' | 'quota_exceeded' | 'zombie_job_ttl' | 'payload_tampering';
  severity: 'low' | 'medium' | 'high' | 'critical';
  blocked: boolean;
  details?: Record<string, any>;
  userAgent?: string;
  requestId?: string;
}

/**
 * Log tentativas de ataque e validacoes de seguranca falhadas
 */
export async function logSecurityEvent(params: SecurityLogParams): Promise<void> {
  try {
    const {
      supabase,
      tenantId,
      userId,
      ipAddress,
      endpoint,
      attackType,
      severity,
      blocked,
      details,
      userAgent,
      requestId,
    } = params;

    await supabase
      .from('security_logs')
      .insert({
        tenant_id: tenantId || null,
        user_id: userId || null,
        ip_address: ipAddress,
        endpoint,
        attack_type: attackType,
        severity,
        blocked,
        details: details || {},
        user_agent: userAgent || null,
        request_id: requestId || null,
      });

    // Log tambem no console para monitoramento
    console.log(`[SECURITY] ${severity.toUpperCase()} - ${attackType} blocked at ${endpoint} from ${ipAddress}`);

    // Enviar email para admins se for evento critico
    if (severity === 'critical' || severity === 'high') {
      try {
        const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
        
        if (INTERNAL_SECRET && SUPABASE_URL) {
          await fetch(`${SUPABASE_URL}/functions/v1/notification-dispatcher`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Secret': INTERNAL_SECRET,
            },
            body: JSON.stringify({
              channel: 'in_app',
              type: 'security_alert',
              tenant_id: tenantId,
              subject: `${severity.toUpperCase()}: ${attackType}`,
              message: `Tentativa de ataque detectada no endpoint ${endpoint}`,
              severity: severity === 'critical' ? 'critical' : 'warning',
              metadata: {
                ip_address: ipAddress,
                endpoint,
                attack_type: attackType,
                severity,
                blocked,
                user_agent: userAgent,
                ...details,
              },
            }),
          });
        }
      } catch (emailError) {
        console.error('[SECURITY-LOG] Failed to send email alert:', emailError);
      }
    }
  } catch (error) {
    // Nao falhar a requisicao se nao conseguir logar
    console.error('[SECURITY-LOG] Failed to log security event:', error);
  }
}

/**
 * Extrai IP do request (considera proxies e headers)
 */
export function extractIpAddress(req: Request): string {
  // Ordem de prioridade para detectar IP real
  const forwardedFor = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const cfConnectingIp = req.headers.get('cf-connecting-ip'); // Cloudflare
  
  if (cfConnectingIp) return cfConnectingIp;
  if (realIp) return realIp;
  if (forwardedFor) {
    // X-Forwarded-For pode conter multiplos IPs, pegar o primeiro
    return forwardedFor.split(',')[0].trim();
  }
  
  // Fallback para IP generico se nao conseguir extrair
  return 'unknown';
}

/**
 * Verifica se IP esta em lista de bloqueio (multiplas tentativas)
 */
export async function checkIpBlocklist(
  supabase: SupabaseClient,
  ipAddress: string,
  endpoint: string,
  windowMinutes: number = 60
): Promise<{ blocked: boolean; reason?: string; resetAt?: Date }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

  // Contar tentativas bloqueadas recentes deste IP neste endpoint
  const { data: recentAttempts, count } = await supabase
    .from('security_logs')
    .select('*', { count: 'exact', head: false })
    .eq('ip_address', ipAddress)
    .eq('endpoint', endpoint)
    .eq('blocked', true)
    .gte('created_at', windowStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(10);

  // Se tiver 5+ tentativas bloqueadas na ultima hora, bloquear temporariamente
  if (count && count >= 5) {
    const resetAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hora
    return {
      blocked: true,
      reason: `IP bloqueado temporariamente por ${count} tentativas de ataque`,
      resetAt,
    };
  }

  return { blocked: false };
}
