import { Eye, AlertTriangle, Shield } from 'lucide-react';

export const SEVERITY_CONFIG = {
  info: { label: 'Info', color: 'bg-blue-100 text-blue-800', icon: Eye },
  warning: { label: 'Aviso', color: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle },
  critical: { label: 'Crítico', color: 'bg-red-100 text-red-800', icon: Shield },
} as const;

export const ANOMALY_TYPE_LABELS: Record<string, string> = {
  score_deviation: 'Desvio de Score',
  recommendation_flip: 'Mudança de Recomendação',
  token_overflow: 'Overflow de Tokens',
  suspicious_pattern: 'Padrão Suspeito',
  extreme_score: 'Score Extremo',
};
