import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { HardDrive, Server, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';


interface DiskMetric {
  drive_letter: string;
  drive_label: string | null;
  drive_type: string | null;
  total_gb: number;
  used_gb: number;
  free_gb: number;
  usage_percent: number;
  is_system_drive: boolean;
  collected_at: string;
}

interface DiskMetricsPanelProps {
  agentId: string;
  compact?: boolean;
}

const getDiskIcon = (driveType: string | null, isSystemDrive: boolean) => {
  if (isSystemDrive) return Server;
  if (driveType === 'Network') return Database;
  return HardDrive;
};

const getUsageColor = (percent: number) => {
  if (percent >= 95) return 'text-destructive';
  if (percent >= 85) return 'text-amber-500';
  if (percent >= 70) return 'text-yellow-500';
  return 'text-emerald-500';
};

const getProgressColor = (percent: number) => {
  if (percent >= 95) return 'bg-destructive';
  if (percent >= 85) return 'bg-amber-500';
  if (percent >= 70) return 'bg-yellow-500';
  return 'bg-emerald-500';
};

export const DiskMetricsPanel = ({ agentId, compact = false }: DiskMetricsPanelProps) => {
  const adaptiveInterval = useAdaptivePolling(300000);
  const { data: disks, isLoading, error } = useQuery({
    queryKey: ['agent-disks', agentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_agent_disk_details', { 
        p_agent_id: agentId 
      });
      
      if (error) throw error;
      return data as DiskMetric[];
    },
    enabled: !!agentId,
    refetchInterval: adaptiveInterval,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error || !disks || disks.length === 0) {
    return null; // Não mostrar nada se não houver dados de discos
  }

  if (compact) {
    // Versão compacta: mostrar todos os discos com barras de progresso
    return (
      <div className="space-y-2">
        {disks.map((disk) => (
          <div key={disk.drive_letter}>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <HardDrive className="h-3 w-3" /> {disk.drive_letter}
              </span>
              <span className={cn('font-medium', getUsageColor(disk.usage_percent))}>
                {disk.usage_percent.toFixed(0)}%
              </span>
            </div>
            <Progress 
              value={disk.usage_percent} 
              className={cn(
                'h-1.5',
                disk.usage_percent >= 95 ? '[&>div]:bg-destructive' :
                disk.usage_percent >= 85 ? '[&>div]:bg-amber-500' :
                disk.usage_percent >= 70 ? '[&>div]:bg-yellow-500' : '[&>div]:bg-emerald-500'
              )}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <HardDrive className="h-4 w-4" />
        <span>Armazenamento ({disks.length} disco{disks.length > 1 ? 's' : ''})</span>
      </div>
      
      <div className="space-y-2">
        {disks.map((disk) => {
          const Icon = getDiskIcon(disk.drive_type, disk.is_system_drive);
          
          return (
            <div key={disk.drive_letter} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {disk.drive_letter}
                    {disk.drive_label && (
                      <span className="text-muted-foreground ml-1">({disk.drive_label})</span>
                    )}
                  </span>
                  {disk.is_system_drive && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      Sistema
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {disk.used_gb.toFixed(1)} / {disk.total_gb.toFixed(1)} GB
                  </span>
                  <span className={cn('font-semibold', getUsageColor(disk.usage_percent))}>
                    {disk.usage_percent.toFixed(0)}%
                  </span>
                </div>
              </div>
              
              <div className="relative">
                <Progress 
                  value={disk.usage_percent} 
                  className="h-2"
                />
                <div 
                  className={cn(
                    'absolute inset-0 h-2 rounded-full transition-all',
                    getProgressColor(disk.usage_percent)
                  )}
                  style={{ width: `${Math.min(disk.usage_percent, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DiskMetricsPanel;
