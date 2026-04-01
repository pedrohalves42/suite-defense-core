import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { type EffectivenessStatus } from '@/lib/explain-insight';

const config = {
  resolved: { icon: CheckCircle2, className: 'bg-green-100 text-green-700 border-green-200', label: 'Resolvido' },
  partial: { icon: AlertTriangle, className: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Parcial' },
  failed: { icon: XCircle, className: 'bg-red-100 text-red-700 border-red-200', label: 'Não resolvido' },
  pending: { icon: Loader2, className: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Verificando' },
  unknown: { icon: AlertTriangle, className: 'bg-gray-100 text-gray-500 border-gray-200', label: 'Indeterminado' },
};

export function EffectivenessBadge({ status }: { status: EffectivenessStatus }) {
  const { icon: Icon, className, label } = config[status] || config.unknown;
  return (
    <Badge variant="outline" className={`gap-1 ${className}`}>
      <Icon className={`h-3 w-3 ${status === 'pending' ? 'animate-spin' : ''}`} />
      {label}
    </Badge>
  );
}
