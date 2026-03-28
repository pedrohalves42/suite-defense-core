import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Wifi, WifiOff } from 'lucide-react';
import type { DashboardSummary } from './types';

interface SearchFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: 'all' | 'online' | 'offline';
  onStatusFilterChange: (value: 'all' | 'online' | 'offline') => void;
  summary: DashboardSummary | null;
}

export function SearchFilters({ searchTerm, onSearchChange, statusFilter, onStatusFilterChange, summary }: SearchFiltersProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[250px]">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome do computador..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              onClick={() => onStatusFilterChange('all')}
              size="sm"
            >
              Todos ({summary?.total_agents || 0})
            </Button>
            <Button
              variant={statusFilter === 'online' ? 'default' : 'outline'}
              onClick={() => onStatusFilterChange('online')}
              size="sm"
              className={statusFilter === 'online' ? '' : 'text-success hover:text-success'}
            >
              <Wifi className="w-4 h-4 mr-1" />
              Online ({summary?.online_agents || 0})
            </Button>
            <Button
              variant={statusFilter === 'offline' ? 'default' : 'outline'}
              onClick={() => onStatusFilterChange('offline')}
              size="sm"
            >
              <WifiOff className="w-4 h-4 mr-1" />
              Offline ({summary?.offline_agents || 0})
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
