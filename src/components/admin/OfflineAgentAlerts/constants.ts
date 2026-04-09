import type { BusinessHours } from './types';

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  enabled: true,
  timezone: 'America/Sao_Paulo',
  days: [1, 2, 3, 4, 5],
  start: '08:00',
  end: '18:00',
};

export const severityConfig = {
  warning: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    border: 'border-yellow-200 dark:border-yellow-800',
    text: 'text-yellow-700 dark:text-yellow-400',
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    icon: 'text-yellow-500',
  },
  danger: {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-orange-200 dark:border-orange-800',
    text: 'text-orange-700 dark:text-orange-400',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    icon: 'text-orange-500',
  },
  critical: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-400',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    icon: 'text-red-500',
  },
  info: {
    bg: 'bg-slate-50 dark:bg-slate-950/30',
    border: 'border-slate-200 dark:border-slate-700',
    text: 'text-slate-600 dark:text-slate-400',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    icon: 'text-slate-400',
  },
} as const;
