import { useState } from 'react';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Eye, FileWarning, ShieldAlert, CreditCard, User, Key,
  CheckCircle, XCircle, AlertTriangle, Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDataExposure } from '@/hooks/useDataExposure';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const CATEGORY_LABELS: Record<string, { label: string; icon: typeof Eye }> = {
  cpf: { label: 'CPF', icon: User },
  cnpj: { label: 'CNPJ', icon: User },
  credit_card: { label: 'Cartão de Crédito', icon: CreditCard },
  medical_record: { label: 'Prontuário Médico', icon: FileWarning },
  password: { label: 'Senha Exposta', icon: Key },
  api_key: { label: 'Chave de API', icon: Key },
  email_list: { label: 'Lista de Emails', icon: User },
  rg: { label: 'RG', icon: User },
  passport: { label: 'Passaporte', icon: User },
};

const SEVERITY_CONFIG: Record<string, { color: string; bg: string }> = {
  critical: { color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
  high: { color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  medium: { color: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  low: { color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
};

export default function DataExposure() {
  const { data: summary, isLoading, updateStatus } = useDataExposure();
  const [filter, setFilter] = useState<string>('all');

  const filteredFindings = summary?.findings.filter(f => {
    if (filter === 'all') return true;
    if (filter === 'open') return f.status === 'open';
    if (filter === 'remediated') return f.status === 'remediated';
    return f.data_category === filter;
  }) || [];

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await updateStatus.mutateAsync({ id, status });
      toast.success(`Status atualizado para: ${status}`);
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  return (
    <AdminPageLayout
      title="Detecção de Exposição de Dados"
      description="Monitore e gerencie dados sensíveis expostos nos endpoints"
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total', value: summary?.total || 0, color: '' },
            { label: 'Abertos', value: summary?.open || 0, color: 'text-orange-600' },
            { label: 'Críticos', value: summary?.critical || 0, color: 'text-red-600' },
            { label: 'Altos', value: summary?.high || 0, color: 'text-orange-500' },
            { label: 'Médios', value: summary?.medium || 0, color: 'text-yellow-600' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card>
                <CardContent className="py-4 text-center">
                  <div className={cn('text-2xl font-bold', stat.color)}>{stat.value}</div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Category Breakdown */}
        {summary && Object.keys(summary.byCategory).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados Expostos por Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(summary.byCategory).map(([cat, count]) => {
                  const config = CATEGORY_LABELS[cat] || { label: cat, icon: Eye };
                  return (
                    <Badge
                      key={cat}
                      variant="outline"
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => setFilter(cat)}
                    >
                      {config.label}: {count}
                    </Badge>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Findings Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Achados</CardTitle>
                <CardDescription>{filteredFindings.length} registros</CardDescription>
              </div>
              <Tabs value={filter} onValueChange={setFilter}>
                <TabsList>
                  <TabsTrigger value="all">Todos</TabsTrigger>
                  <TabsTrigger value="open">Abertos</TabsTrigger>
                  <TabsTrigger value="remediated">Remediados</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : filteredFindings.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ShieldAlert className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhuma exposição encontrada</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Severidade</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Ocorrências</TableHead>
                    <TableHead>Amostra</TableHead>
                    <TableHead>Detectado</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFindings.slice(0, 50).map(finding => {
                    const catConfig = CATEGORY_LABELS[finding.data_category] || { label: finding.data_category, icon: Eye };
                    const sevConfig = SEVERITY_CONFIG[finding.severity] || SEVERITY_CONFIG.medium;
                    const CatIcon = catConfig.icon;
                    
                    return (
                      <TableRow key={finding.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <CatIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{catConfig.label}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-xs', sevConfig.bg, sevConfig.color)}>
                            {finding.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono max-w-[200px] truncate block">
                            {finding.file_path}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {finding.match_count}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {finding.sample_preview || '—'}
                          </code>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(finding.detected_at), { addSuffix: true, locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={finding.status === 'open' ? 'outline' : 'secondary'} className="text-xs">
                            {finding.status === 'open' ? 'Aberto' : finding.status === 'remediated' ? 'Remediado' : finding.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {finding.status === 'open' && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => handleUpdateStatus(finding.id, 'remediated')}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Remediar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground"
                                onClick={() => handleUpdateStatus(finding.id, 'false_positive')}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Falso +
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminPageLayout>
  );
}
