import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  HardDrive, CheckCircle, AlertTriangle, XCircle, CloudOff,
  Clock, Database, Cloud, Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBackupStatus, type BackupStatusRecord } from '@/hooks/useBackupStatus';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_CONFIG = {
  ok: { 
    label: 'OK', 
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    Icon: CheckCircle,
    iconColor: 'text-green-500',
  },
  warning: { 
    label: 'Atrasado', 
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    Icon: AlertTriangle,
    iconColor: 'text-yellow-500',
  },
  critical: { 
    label: 'Crítico', 
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    Icon: XCircle,
    iconColor: 'text-red-500',
  },
  not_configured: { 
    label: 'Não configurado', 
    color: 'bg-muted text-muted-foreground',
    Icon: CloudOff,
    iconColor: 'text-muted-foreground',
  },
  unknown: { 
    label: 'Desconhecido', 
    color: 'bg-muted text-muted-foreground',
    Icon: HardDrive,
    iconColor: 'text-muted-foreground',
  },
};

const TYPE_ICONS: Record<string, typeof HardDrive> = {
  windows_backup: Shield,
  vss: Database,
  third_party: HardDrive,
  cloud_sync: Cloud,
  database_backup: Database,
};

function BackupRow({ record }: { record: BackupStatusRecord }) {
  const config = STATUS_CONFIG[record.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.unknown;
  const TypeIcon = TYPE_ICONS[record.backup_type] || HardDrive;

  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-3">
        <TypeIcon className={cn('h-4 w-4', config.iconColor)} />
        <div>
          <p className="text-sm font-medium">{record.backup_tool || record.backup_type}</p>
          {record.last_backup_at && (
            <p className="text-xs text-muted-foreground">
              <Clock className="inline h-3 w-3 mr-1" />
              {formatDistanceToNow(new Date(record.last_backup_at), { addSuffix: true, locale: ptBR })}
            </p>
          )}
        </div>
      </div>
      <Badge variant="outline" className={cn('text-xs', config.color)}>
        {config.label}
      </Badge>
    </div>
  );
}

export function BackupAwarenessCard() {
  const { data: summary, isLoading } = useBackupStatus();

  const overallStatus = !summary || summary.total === 0
    ? 'empty'
    : summary.critical > 0
      ? 'critical'
      : summary.warning > 0
        ? 'warning'
        : summary.notConfigured > 0
          ? 'not_configured'
          : 'ok';

  const statusStyles = {
    empty: 'border-border',
    ok: 'border-green-200 dark:border-green-800',
    warning: 'border-yellow-200 dark:border-yellow-800',
    critical: 'border-red-200 dark:border-red-800',
    not_configured: 'border-border',
  };

  return (
    <Card className={cn('transition-colors', statusStyles[overallStatus])}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Backup Awareness
          </span>
          {summary && summary.total > 0 && (
            <div className="flex gap-1">
              {summary.ok > 0 && (
                <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">
                  {summary.ok} OK
                </Badge>
              )}
              {summary.critical > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {summary.critical} crítico
                </Badge>
              )}
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : !summary || summary.total === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CloudOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum backup monitorado</p>
            <p className="text-xs mt-1">Os agentes reportarão o status automaticamente</p>
          </div>
        ) : (
          <div className="space-y-0">
            {summary.records.map(record => (
              <BackupRow key={record.id} record={record} />
            ))}
            {summary.oldestBackupHours !== null && summary.oldestBackupHours > 24 && (
              <div className="mt-3 p-2 rounded bg-destructive/10 text-destructive text-xs flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                Backup mais antigo: {Math.round(summary.oldestBackupHours)}h atrás
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
