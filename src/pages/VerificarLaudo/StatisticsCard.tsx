import React from 'react';
import { Monitor } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Statistics } from './types';

interface StatisticsCardProps {
  stats: Statistics;
}

export const StatisticsCard: React.FC<StatisticsCardProps> = ({ stats }) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg">
        <Monitor className="h-5 w-5" />
        Estatísticas do Período
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-2xl font-bold">{stats.total_agents ?? 0}</p>
          <p className="text-xs text-muted-foreground">Computadores</p>
        </div>
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-2xl font-bold">{stats.online_agents ?? 0}</p>
          <p className="text-xs text-muted-foreground">Online</p>
        </div>
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-2xl font-bold text-amber-600">{stats.total_vulnerabilities ?? 0}</p>
          <p className="text-xs text-muted-foreground">Vulnerabilidades</p>
        </div>
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-2xl font-bold text-green-600">{stats.agents_with_active_av ?? 0}</p>
          <p className="text-xs text-muted-foreground">Com Antivírus</p>
        </div>
      </div>
    </CardContent>
  </Card>
);
