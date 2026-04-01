import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Props {
  totalSoftware: number;
  highRiskCount: number;
  classifiedCount: number;
  unknownCount: number;
}

export const SoftwareRiskSummaryCards: React.FC<Props> = ({
  totalSoftware, highRiskCount, classifiedCount, unknownCount,
}) => (
  <div className="grid gap-4 md:grid-cols-4">
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{totalSoftware}</div>
          <p className="text-xs text-muted-foreground">programas encontrados</p>
        </CardContent>
      </Card>
    </motion.div>
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      <Card className={cn(highRiskCount > 0 && 'border-destructive/50')}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Alto Risco
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={cn('text-3xl font-bold', highRiskCount > 0 && 'text-destructive')}>{highRiskCount}</div>
          <p className="text-xs text-muted-foreground">requer atenção</p>
        </CardContent>
      </Card>
    </motion.div>
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Classificados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{classifiedCount}</div>
          <p className="text-xs text-muted-foreground">com classificação</p>
        </CardContent>
      </Card>
    </motion.div>
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Não Classificados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-muted-foreground">{unknownCount}</div>
          <p className="text-xs text-muted-foreground">pendentes de análise</p>
        </CardContent>
      </Card>
    </motion.div>
  </div>
);
