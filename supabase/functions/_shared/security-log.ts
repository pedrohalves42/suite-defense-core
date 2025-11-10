import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export interface SecurityLogParams {
  supabase: SupabaseClient;
  tenantId?: string;
  userId?: string;
  ipAddress: string;
  endpoint: string;
  attackType: 'sql_injection' | 'xss' | 'path_traversal' | 'rate_limit' | 'invalid_input' | 'brute_force' | 'unauthorized' | 'control_characters';
  severity: 'low' | 'medium' | 'high' | 'critical';
  blocked: boolean;
  details?: Record<string, any>;
  userAgent?: string;
  requestId?: string;
}

/**
 * Log tentativas de ataque e validações de segurança falhadas
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

    // Log também no console para monitoramento
    console.log(`[SECURITY] ${severity.toUpperCase()} - ${attackType} blocked at ${endpoint} from ${ipAddress}`);
  } catch (error) {
    // Não falhar a requisição se não conseguir logar
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
    // X-Forwarded-For pode conter múltiplos IPs, pegar o primeiro
    return forwardedFor.split(',')[0].trim();
  }
  
  // Fallback para IP genérico se não conseguir extrair
  return 'unknown';
}

/**
 * Verifica se IP está em lista de bloqueio (múltiplas tentativas)
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

  // Se tiver 5+ tentativas bloqueadas na última hora, bloquear temporariamente
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
