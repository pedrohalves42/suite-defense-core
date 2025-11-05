import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

interface RateLimitConfig {
  maxRequests: number;
  windowMinutes: number;
  blockMinutes?: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 60,
  windowMinutes: 1,
  blockMinutes: 5,
};

export async function checkRateLimit(
  supabase: SupabaseClient,
  identifier: string,
  endpoint: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<{ allowed: boolean; remainingRequests?: number; resetAt?: Date }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowMinutes * 60 * 1000);

  // Verificar se está bloqueado
  const { data: existing } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('identifier', identifier)
    .eq('endpoint', endpoint)
    .single();

  if (existing?.blocked_until && new Date(existing.blocked_until) > now) {
    return {
      allowed: false,
      resetAt: new Date(existing.blocked_until),
    };
  }

  // Limpar ou criar nova janela
  if (!existing || new Date(existing.window_start) < windowStart) {
    await supabase
      .from('rate_limits')
      .upsert({
        identifier,
        endpoint,
        request_count: 1,
        window_start: now,
        last_request_at: now,
      }, {
        onConflict: 'identifier,endpoint'
      });

    return {
      allowed: true,
      remainingRequests: config.maxRequests - 1,
    };
  }

  // Incrementar contador
  const newCount = existing.request_count + 1;

  if (newCount > config.maxRequests) {
    // Bloquear temporariamente
    const blockedUntil = new Date(now.getTime() + (config.blockMinutes || 5) * 60 * 1000);
    
    await supabase
      .from('rate_limits')
      .update({
        request_count: newCount,
        last_request_at: now,
        blocked_until: blockedUntil.toISOString(),
      })
      .eq('identifier', identifier)
      .eq('endpoint', endpoint);

    return {
      allowed: false,
      resetAt: blockedUntil,
    };
  }

  // Atualizar contador
  await supabase
    .from('rate_limits')
    .update({
      request_count: newCount,
      last_request_at: now,
    })
    .eq('identifier', identifier)
    .eq('endpoint', endpoint);

  return {
    allowed: true,
    remainingRequests: config.maxRequests - newCount,
  };
}
