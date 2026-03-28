import { Card, CardContent } from '@/components/ui/card';
import { Server, Activity, XCircle, Clock, PowerOff, ArrowUpCircle } from 'lucide-react';
import type { AgentStats, StatusFilter, VersionFilter } from './types';

interface StatsCardsProps {
  stats: AgentStats;
  statusFilter: StatusFilter;
  versionFilter: VersionFilter;
  onStatusFilter: (f: StatusFilter) => void;
  onVersionFilter: (f: VersionFilter) => void;
}

export function StatsCards({ stats, statusFilter, versionFilter, onStatusFilter, onVersionFilter }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onStatusFilter('all')}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Server className="h-5 w-5 text-muted-foreground" />
            <span className="text-2xl font-bold">{stats.total}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total</p>
        </CardContent>
      </Card>
      <Card className={`cursor-pointer hover:border-green-500/50 transition-colors ${statusFilter === 'online' ? 'border-green-500' : ''}`} onClick={() => onStatusFilter('online')}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Activity className="h-5 w-5 text-green-500" />
            <span className="text-2xl font-bold text-green-500">{stats.online}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Online</p>
        </CardContent>
      </Card>
      <Card className={`cursor-pointer hover:border-red-500/50 transition-colors ${statusFilter === 'offline' ? 'border-red-500' : ''}`} onClick={() => onStatusFilter('offline')}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <XCircle className="h-5 w-5 text-red-500" />
            <span className="text-2xl font-bold text-red-500">{stats.offline}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Offline</p>
        </CardContent>
      </Card>
      <Card className={`cursor-pointer hover:border-orange-500/50 transition-colors ${statusFilter === 'pending' ? 'border-orange-500' : ''}`} onClick={() => onStatusFilter('pending')}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Clock className="h-5 w-5 text-orange-500" />
            <span className="text-2xl font-bold text-orange-500">{stats.pending}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Pendente</p>
        </CardContent>
      </Card>
      <Card className={`cursor-pointer hover:border-muted-foreground/50 transition-colors ${statusFilter === 'disabled' ? 'border-muted-foreground' : ''}`} onClick={() => onStatusFilter('disabled')}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <PowerOff className="h-5 w-5 text-muted-foreground" />
            <span className="text-2xl font-bold">{stats.disabled}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Desativado</p>
        </CardContent>
      </Card>
      <Card className={`cursor-pointer hover:border-amber-500/50 transition-colors ${versionFilter === 'outdated' ? 'border-amber-500' : ''}`} onClick={() => onVersionFilter(versionFilter === 'outdated' ? 'all' : 'outdated')}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <ArrowUpCircle className="h-5 w-5 text-amber-500" />
            <span className="text-2xl font-bold text-amber-500">{stats.outdated}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Desatualizado</p>
        </CardContent>
      </Card>
    </div>
  );
}
