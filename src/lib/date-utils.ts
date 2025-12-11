const BRASILIA_TIMEZONE = 'America/Sao_Paulo';

/**
 * Formata data/hora para o fuso horário de Brasília (UTC-3)
 * @param dateString - Data em formato ISO string (UTC)
 * @param formatType - Tipo de formato desejado
 */
export function formatBrazilDateTime(
  dateString: string | Date | null | undefined,
  formatType: 'full' | 'date' | 'time' | 'short' | 'datetime' = 'datetime'
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
    default:
      return date.toLocaleString('pt-BR', options);
  }
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
