import React from 'react';
import { TrendingUp, TrendingDown, Minus, Monitor, Shield, AlertCircle, Ban, Bug, Info } from 'lucide-react';
import { getComplianceRiskInfo } from '@/lib/ui-dictionary';

export const getRiskColor = (score: number | null) => {
  if (score === null) return 'bg-muted text-muted-foreground';
  if (score >= 70) return 'bg-destructive text-destructive-foreground';
  if (score >= 40) return 'bg-amber-500 text-white';
  return 'bg-green-500 text-white';
};

export const getRiskInfo = (level: string | null) => {
  if (!level) return { label: 'Não avaliado', emoji: '❓', description: '' };
  return getComplianceRiskInfo(level);
};

export const getTrendIcon = (trend?: string) => {
  if (trend === 'subindo') return <TrendingUp className="h-4 w-4 text-destructive" />;
  if (trend === 'descendo') return <TrendingDown className="h-4 w-4 text-green-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
};

export const getHighlightIcon = (icon: string) => {
  switch (icon) {
    case 'computer': return <Monitor className="h-5 w-5" />;
    case 'shield': return <Shield className="h-5 w-5" />;
    case 'alert': return <AlertCircle className="h-5 w-5" />;
    case 'block': return <Ban className="h-5 w-5" />;
    case 'virus': return <Bug className="h-5 w-5" />;
    case 'offline': return <Monitor className="h-5 w-5" />;
    default: return <Info className="h-5 w-5" />;
  }
};

export const getStatusColor = (status: string) => {
  if (status === 'good') return 'text-green-600 bg-green-50 dark:bg-green-900/20';
  if (status === 'warning') return 'text-amber-600 bg-amber-50 dark:bg-amber-900/20';
  return 'text-red-600 bg-red-50 dark:bg-red-900/20';
};
