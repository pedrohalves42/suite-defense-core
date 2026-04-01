import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { FileText, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { ComplianceRow } from './ComplianceRow';
import { MiniStat } from './MiniStat';
import { translateCategory } from '../utils';

interface Props {
  summaryData: any;
  overallScore: number;
}

export function ComplianceAutomationRow({ summaryData, overallScore }: Props) {
  const complianceCats = summaryData?.compliance?.category_scores as Array<{ category: string; score: number; details: string }> | null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.14 }}>
        <Card className="h-full">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Conformidade Regulatória
              </CardTitle>
              {summaryData?.compliance && (
                <Badge variant="outline" className={cn("text-xs",
                  summaryData.compliance.overall_score >= 80 ? "text-success border-success/30" :
                  summaryData.compliance.overall_score >= 60 ? "text-warning border-warning/30" :
                  "text-destructive border-destructive/30"
                )}>
                  Nota: {summaryData.compliance.grade} ({summaryData.compliance.overall_score}%)
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {complianceCats ? complianceCats.map((cat, i) => (
              <ComplianceRow key={i} category={translateCategory(cat.category)} score={cat.score} details={cat.details} />
            )) : (
              <div className="text-center py-6 space-y-2">
                <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground">Aguardando primeira avaliação de conformidade</p>
                <p className="text-xs text-muted-foreground/60">O sistema precisa de alguns dias coletando dados para gerar o relatório.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.18 }}>
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Eficiência da Proteção Automática
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Hoje</p>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Verificações" value={summaryData?.totalJobsToday || 0} color="text-foreground" />
                <MiniStat label="Concluídas" value={summaryData?.completedJobsToday || 0} color="text-success" />
                <MiniStat label="Com problema" value={summaryData?.failedJobsToday || 0} color="text-destructive" />
              </div>
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">Taxa de sucesso</span>
                  <span className={cn("text-xs font-bold",
                    (summaryData?.successRateToday || 0) >= 80 ? "text-success" :
                    (summaryData?.successRateToday || 0) >= 50 ? "text-warning" : "text-destructive"
                  )}>{summaryData?.successRateToday || 0}%</span>
                </div>
                <Progress value={summaryData?.successRateToday || 0} className="h-1.5" />
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Últimos 30 dias</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center p-2.5 rounded-lg bg-muted/30 border border-border/40">
                  <p className="text-lg font-bold text-foreground">{summaryData?.automatedJobsCompleted || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Tarefas executadas<br />com sucesso</p>
                </div>
                <div className="text-center p-2.5 rounded-lg bg-muted/30 border border-border/40">
                  <p className="text-lg font-bold text-foreground">{summaryData?.totalJobs30d || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Total de<br />verificações</p>
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">Confiabilidade do sistema</span>
                  {(() => {
                    const rate = summaryData?.totalJobs30d ? Math.round((summaryData.automatedJobsCompleted / summaryData.totalJobs30d) * 100) : 0;
                    return <span className={cn("text-xs font-bold", rate >= 80 ? "text-success" : rate >= 50 ? "text-warning" : "text-destructive")}>{rate}%</span>;
                  })()}
                </div>
                <Progress value={summaryData?.totalJobs30d ? Math.round((summaryData.automatedJobsCompleted / summaryData.totalJobs30d) * 100) : 0} className="h-1.5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
