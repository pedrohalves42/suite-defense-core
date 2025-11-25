import { useState } from 'react';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { AgentSelector } from '@/components/AgentSelector';
import { useWebActivity } from '@/hooks/useWebActivity';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Globe, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

export default function WebActivity() {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  
  const { data: activity, isLoading, error } = useWebActivity(selectedAgent, !!selectedAgent);

  const topDomains = activity?.slice(0, 10) || [];
  const totalHits = activity?.reduce((sum, item) => sum + item.hits, 0) || 0;

  return (
    <AdminPageLayout
      title="Atividade Web"
      description="Visualize dominios acessados nos ultimos dias"
    >
      <div className="space-y-6">
        {/* Agent Selector */}
        <Card className="border-l-4 border-l-info">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Selecionar Agente
            </CardTitle>
            <CardDescription>Escolha um agente para visualizar atividade web</CardDescription>
          </CardHeader>
          <CardContent>
            <AgentSelector value={selectedAgent} onValueChange={setSelectedAgent} />
          </CardContent>
        </Card>

        {selectedAgent && (
          <>
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Dominios Unicos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{activity?.length || 0}</div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card className="border-l-4 border-l-accent">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total de Acessos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalHits}</div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card className="border-l-4 border-l-info">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Media por Dominio</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {activity?.length ? Math.round(totalHits / activity.length) : 0}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Top Domains Chart */}
            {topDomains.length > 0 && (
              <Card className="border-l-4 border-l-warning">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Top 10 Dominios Mais Acessados
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {topDomains.map((item, idx) => (
                      <div key={item.domain} className="flex items-center gap-3">
                        <Badge variant="outline" className="w-8 justify-center">
                          {idx + 1}
                        </Badge>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{item.domain}</span>
                            <span className="text-sm text-muted-foreground">{item.hits} acessos</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-info to-primary transition-all"
                              style={{ width: `${(item.hits / topDomains[0].hits) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Activity Table */}
            {isLoading ? (
              <Card>
                <CardContent className="pt-6 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </CardContent>
              </Card>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Erro ao carregar atividade web: {error instanceof Error ? error.message : 'Erro desconhecido'}
                </AlertDescription>
              </Alert>
            ) : activity?.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Nenhuma atividade web encontrada para este agente.
                </AlertDescription>
              </Alert>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Todos os Dominios</CardTitle>
                  <CardDescription>Atividade completa das ultimas 24 horas</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dominio</TableHead>
                        <TableHead>Acessos</TableHead>
                        <TableHead>Primeira Visita</TableHead>
                        <TableHead>Ultima Visita</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activity?.map((item) => (
                        <TableRow key={item.domain}>
                          <TableCell className="font-medium">{item.domain}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.hits}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(item.first_seen_at), 'dd/MM/yyyy HH:mm')}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(item.last_seen_at), 'dd/MM/yyyy HH:mm')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AdminPageLayout>
  );
}
