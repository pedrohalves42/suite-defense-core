import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from "./logger.ts";
/**
 * Business Hours Utility
 * 
 * Verifica se o horario atual esta dentro do expediente configurado.
 * Usado para evitar alertas fora do horario de trabalho.
 */

export interface BusinessHoursConfig {
  enabled: boolean;
  days: number[];  // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  start: string;   // "08:00"
  end: string;     // "18:00"
  timezone: string; // "America/Sao_Paulo"
}

/**
 * Verifica se o horario atual esta dentro do expediente configurado
 */
export function isWithinBusinessHours(config: BusinessHoursConfig | null | undefined): boolean {
  // Se nao ha configuracao ou esta desabilitado, considera sempre dentro do expediente
  if (!config || !config.enabled) {
    return true;
  }

  try {
    const now = new Date();
    
    // Converter para o timezone configurado
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: config.timezone || 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    
    const parts = formatter.formatToParts(now);
    const hourPart = parts.find(p => p.type === 'hour');
    const minutePart = parts.find(p => p.type === 'minute');
    const weekdayPart = parts.find(p => p.type === 'weekday');
    
    if (!hourPart || !minutePart || !weekdayPart) {
      logger.warn('[BusinessHours] Failed to parse date parts, assuming within hours');
      return true;
    }

    // Mapear weekday string para numero (0-6)
    const weekdayMap: Record<string, number> = {
      'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6,
      // Versoes lowercase para compatibilidade com dados existentes
      'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6,
      // Nomes completos
      'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6
    };
    const currentDay = weekdayMap[weekdayPart.value] ?? new Date().getDay();
    
    // Verificar se e um dia de expediente
    const workDays = config.days || [1, 2, 3, 4, 5]; // Default: segunda a sexta
    
    // CORRECAO: Normalizar workDays para numeros (aceita strings ou numeros)
    const normalizedWorkDays = (workDays as (number | string)[]).map((day) => {
      if (typeof day === 'number') return day;
      // Converter string para numero usando o mapa
      const normalized = weekdayMap[day.toLowerCase()];
      return normalized !== undefined ? normalized : -1;
    }).filter((d): d is number => d >= 0 && d <= 6);

    if (!normalizedWorkDays.includes(currentDay)) {
      return false;
    }

    // Verificar horario
    const currentTimeMinutes = parseInt(hourPart.value) * 60 + parseInt(minutePart.value);
    
    const [startHour, startMinute] = (config.start || '08:00').split(':').map(Number);
    const [endHour, endMinute] = (config.end || '18:00').split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    return currentTimeMinutes >= startMinutes && currentTimeMinutes <= endMinutes;
  } catch (error) {
    logger.warn('[BusinessHours] Error checking business hours:', error);
    // Em caso de erro, considera dentro do expediente para nao bloquear alertas
    return true;
  }
}

/**
 * Busca configuracao de horario de expediente do tenant
 */
export async function getTenantBusinessHours(
  supabase: SupabaseClient,
  tenantId: string
): Promise<BusinessHoursConfig | null> {
  try {
    const { data: settings, error } = await supabase
      .from('tenant_settings')
      .select('business_hours')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn(`[BusinessHours] Error fetching tenant settings for ${tenantId}:`, error.message);
      return null;
    }

    return settings?.business_hours as BusinessHoursConfig | null;
  } catch (error) {
    logger.warn('[BusinessHours] Error in getTenantBusinessHours:', error);
    return null;
  }
}

/**
 * Verifica se deve processar alertas para um tenant baseado no horario de expediente
 */
export async function shouldProcessAlertsForTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ shouldProcess: boolean; reason: string }> {
  const businessHours = await getTenantBusinessHours(supabase, tenantId);
  
  if (!businessHours || !businessHours.enabled) {
    return { shouldProcess: true, reason: 'business_hours_not_configured' };
  }

  const withinHours = isWithinBusinessHours(businessHours);
  
  if (withinHours) {
    return { shouldProcess: true, reason: 'within_business_hours' };
  }
  
  return { shouldProcess: false, reason: 'outside_business_hours' };
}
