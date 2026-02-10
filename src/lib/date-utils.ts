import { format as fnsFormat } from 'date-fns';
import { format as formatTz, toZonedTime } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';
import { formatDistanceToNow as fnsFormatDistanceToNow } from 'date-fns';

// Re-export ptBR for backward compatibility with existing components
export { ptBR } from 'date-fns/locale';

export const BRASILIA_TIMEZONE = 'America/Sao_Paulo';

/**
 * Drop-in replacement for date-fns `format()` that always uses Brasília timezone.
 * Usage: import { format } from '@/lib/date-utils'; (instead of date-fns)
 */
export function format(date: Date | string | number, formatStr: string, options?: { locale?: any }): string {
  const d = typeof date === 'string' ? new Date(date) : typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  const zonedDate = toZonedTime(d, BRASILIA_TIMEZONE);
  return formatTz(zonedDate, formatStr, { 
    locale: options?.locale || ptBR,
    timeZone: BRASILIA_TIMEZONE 
  });
}

/**
 * Drop-in replacement for date-fns `formatDistanceToNow()` using Brasília timezone.
 */
export function formatDistanceToNow(date: Date | string | number, options?: { addSuffix?: boolean; locale?: any }): string {
  const d = typeof date === 'string' ? new Date(date) : typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return fnsFormatDistanceToNow(d, { 
    addSuffix: options?.addSuffix,
    locale: options?.locale || ptBR 
  });
}

/**
 * Indicador visual de timezone para exibição em headers
 */
export const TIMEZONE_INDICATOR = '(UTC-3)';

/**
 * Converte uma data para o timezone de Brasília
 */
export function toBrasiliaTime(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  return toZonedTime(d, BRASILIA_TIMEZONE);
}

/**
 * Formata data/hora para o fuso horário de Brasília (UTC-3)
 * @param dateString - Data em formato ISO string (UTC)
 * @param formatType - Tipo de formato desejado
 */
export function formatBrazilDateTime(
  dateString: string | Date | null | undefined,
  formatType: 'full' | 'date' | 'time' | 'short' | 'datetime' | 'filename' | 'day-month' = 'datetime'
): string {
  if (!dateString) return '-';
  
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  
  if (isNaN(date.getTime())) return '-';
  
  const options: Intl.DateTimeFormatOptions = {
    timeZone: BRASILIA_TIMEZONE,
  };
  
  switch (formatType) {
    case 'full':
      return date.toLocaleString('pt-BR', {
        ...options,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    case 'datetime':
      return date.toLocaleString('pt-BR', {
        ...options,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    case 'short':
      return date.toLocaleString('pt-BR', {
        ...options,
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    case 'date':
      return date.toLocaleDateString('pt-BR', {
        ...options,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    case 'time':
      return date.toLocaleTimeString('pt-BR', {
        ...options,
        hour: '2-digit',
        minute: '2-digit',
      });
    case 'filename':
      // Format for filenames: yyyy-MM-dd_HHmm
      return date.toLocaleString('pt-BR', {
        ...options,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).replace(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2})/, '$3-$2-$1_$4$5');
    case 'day-month':
      return date.toLocaleDateString('pt-BR', {
        ...options,
        day: '2-digit',
        month: '2-digit',
      });
    default:
      return date.toLocaleString('pt-BR', options);
  }
}

/**
 * Formata data usando date-fns com timezone de Brasília
 * @param date - Data em qualquer formato
 * @param formatString - String de formato do date-fns (ex: "dd/MM/yyyy HH:mm")
 */
export function formatBrazil(
  date: string | Date | null | undefined,
  formatString: string
): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  
  const zonedDate = toZonedTime(d, BRASILIA_TIMEZONE);
  return formatTz(zonedDate, formatString, { 
    locale: ptBR,
    timeZone: BRASILIA_TIMEZONE 
  });
}

/**
 * Formata hora para exibição em gráficos (HH:mm) com timezone de Brasília
 */
export function formatBrazilTime(date: string | Date | null | undefined): string {
  return formatBrazil(date, 'HH:mm');
}

/**
 * Formata data curta para gráficos (dd/MM) com timezone de Brasília
 */
export function formatBrazilShortDate(date: string | Date | null | undefined): string {
  return formatBrazil(date, 'dd/MM');
}

/**
 * Formata distância relativa (ex: "há 5 minutos") em português
 */
export function formatRelativeTime(dateString: string | Date | null | undefined): string {
  if (!dateString) return '-';
  
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  
  if (isNaN(date.getTime())) return '-';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSeconds < 60) return 'agora';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  if (diffDays === 1) return 'ontem';
  if (diffDays < 7) return `há ${diffDays} dias`;
  
  return formatBrazilDateTime(date, 'date');
}

/**
 * Formata duração entre duas datas (ex: "2h 30min", "3 dias")
 */
export function formatDuration(startDate: Date, endDate: Date): string {
  const diffMs = Math.abs(endDate.getTime() - startDate.getTime());
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSeconds < 60) return `${diffSeconds}s`;
  if (diffMinutes < 60) return `${diffMinutes}min`;
  if (diffHours < 24) {
    const remainingMinutes = diffMinutes % 60;
    if (remainingMinutes > 0) {
      return `${diffHours}h ${remainingMinutes}min`;
    }
    return `${diffHours}h`;
  }
  if (diffDays === 1) return '1 dia';
  return `${diffDays} dias`;
}
