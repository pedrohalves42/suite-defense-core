import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, AlertTriangle, Laptop, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RISK_CONFIG } from './constants';

interface TopRiskyItem {
  name: string;
  vendor: string | null;
  risk_level: string;
  machine_count: number;
  first_seen_at: string;
}

interface Props {
  topRisky: TopRiskyItem[] | undefined;
}

export const SoftwareTopThreats: React.FC<Props> = ({ topRisky }) => {
  if (!topRisky || topRisky.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Principais Ameaças
          </CardTitle>
          <CardDescription>Software de alto risco com maior presença na frota</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {topRisky.map((item) => {
              const risk = RISK_CONFIG[item.risk_level];
              const Icon = risk?.icon || AlertTriangle;
              return (
                <div key={item.name} className={cn('p-3 rounded-lg border flex flex-col gap-1.5', risk?.bgClass)}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold truncate flex-1">{item.name}</span>
                    <Icon className="h-4 w-4 shrink-0 mt-0.5" />
                  </div>
                  {item.vendor && <span className="text-xs opacity-70 truncate">{item.vendor}</span>}
                  <div className="flex items-center gap-3 text-xs mt-1">
                    <span className="flex items-center gap-1">
                      <Laptop className="h-3 w-3" />
                      {item.machine_count} {item.machine_count === 1 ? 'máquina' : 'máquinas'}
                    </span>
                    <span className="flex items-center gap-1 opacity-70">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(item.first_seen_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
