import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

const statusConfig = {
  ok: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-950' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950' },
  critical: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950' },
} as const;

interface StatusItemProps {
  label: string;
  status: 'ok' | 'warning' | 'critical';
  value?: string;
}

export function StatusItem({ label, status, value }: StatusItemProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={`p-4 rounded-lg ${config.bg}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${config.color}`} />
        <span className="font-medium">{label}</span>
      </div>
      <p className={`text-sm mt-1 ${config.color}`}>
        {value || (status === 'ok' ? 'Operacional' : status === 'warning' ? 'Atenção' : 'Crítico')}
      </p>
    </div>
  );
}
