import { logger } from '@/lib/logger';
import type { BusinessHours, SeverityLevel } from './types';

export function getSeverity(hours: number, isBusinessHours: boolean): SeverityLevel {
  if (!isBusinessHours) return 'info';
  if (hours >= 8) return 'critical';
  if (hours >= 4) return 'danger';
  return 'warning';
}

export function isWithinBusinessHours(businessHours: BusinessHours): boolean {
  if (!businessHours.enabled) return true;

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: businessHours.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });

    const parts = formatter.formatToParts(now);
    const weekdayPart = parts.find(p => p.type === 'weekday')?.value || '';
    const hourPart = parts.find(p => p.type === 'hour')?.value || '00';
    const minutePart = parts.find(p => p.type === 'minute')?.value || '00';

    const weekdayMap: Record<string, number> = {
      'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6,
    };
    const currentDay = weekdayMap[weekdayPart] ?? new Date().getDay();

    if (!businessHours.days.includes(currentDay)) return false;

    const currentMinutes = parseInt(hourPart) * 60 + parseInt(minutePart);
    const [startHour, startMin] = businessHours.start.split(':').map(Number);
    const [endHour, endMin] = businessHours.end.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch (error) {
    logger.error('Error checking business hours:', error);
    return true;
  }
}
