import { XCircle, CheckCircle, Clock } from 'lucide-react';

export const STATUS_OPTIONS = [
  { value: 'failed', label: 'Falhados', icon: XCircle, color: 'text-destructive' },
  { value: 'cancelled', label: 'Cancelados', icon: XCircle, color: 'text-muted-foreground' },
  { value: 'completed', label: 'Concluídos', icon: CheckCircle, color: 'text-success' },
  { value: 'queued', label: 'Na Fila', icon: Clock, color: 'text-warning' },
] as const;

export const DAYS_OPTIONS = [
  { value: 1, label: 'Mais de 1 dia' },
  { value: 3, label: 'Mais de 3 dias' },
  { value: 7, label: 'Mais de 7 dias' },
  { value: 14, label: 'Mais de 14 dias' },
  { value: 30, label: 'Mais de 30 dias' },
] as const;
