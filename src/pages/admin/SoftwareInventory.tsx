import { useState } from 'react';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { AgentSelector } from '@/components/AgentSelector';
import { useSoftwareInventory } from '@/hooks/useSoftwareInventory';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Package, Search } from 'lucide-react';
import { motion } from 'framer-motion';

const getRiskVariant = (risk: string): "default" | "secondary" | "destructive" | "warning" | "success" => {
  switch (risk.toLowerCase()) {
    case 'critical': return 'destructive';
    case 'high': return 'warning';
    case 'medium': return 'warning';
    case 'low': return 'success';
    default: return 'secondary';
  }
};

export default function SoftwareInventory() {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const { data: software, isLoading, error } = useSoftwareInventory(selectedAgent, !!selectedAgent);

  const filteredSoftware = software?.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.vendor?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const riskCounts = software?.reduce((acc, item) => {
    const risk = item.risk_level.toLowerCase();
    acc[risk] = (acc[risk] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <AdminPageLayout
      title="Inventario de Software"
      description="Visualize software instalado nos agentes"
    >
      <div className="space-y-6">
        {/* Agent Selector */}
        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Selecionar Agente
            </CardTitle>
            <CardDescription>Escolha um agente para visualizar o inventario</CardDescription>
          </CardHeader>
          <CardContent>
            <AgentSelector value={selectedAgent} onValueChange={setSelectedAgent} />
          </CardContent>
        </Card>

        {selectedAgent && (
          <>
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-5">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{software?.length || 0}</div>
                  </CardContent>
                </Card>
              </motion.div>

              {['critical', 'high', 'medium', 'low'].map((risk, idx) => (
                <motion.div
                  key={risk}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                >
                  <Card className={`border-l-4 border-l-${getRiskVariant(risk)}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium capitalize">{risk}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{riskCounts[risk] || 0}</div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Search */}
            <Card>
              <CardContent className="pt-6">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar software..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Software Table */}
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
                  Erro ao carregar inventario: {error instanceof Error ? error.message : 'Erro desconhecido'}
                </AlertDescription>
              </Alert>
            ) : filteredSoftware.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {searchTerm ? 'Nenhum software encontrado com esse termo de busca.' : 'Nenhum software encontrado para este agente.'}
                </AlertDescription>
              </Alert>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Versao</TableHead>
                        <TableHead>Fabricante</TableHead>
                        <TableHead>Local</TableHead>
                        <TableHead>Risco</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSoftware.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>{item.version || 'N/A'}</TableCell>
                          <TableCell>{item.vendor || 'N/A'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                            {item.install_location || 'N/A'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getRiskVariant(item.risk_level)}>
                              {item.risk_level}
                            </Badge>
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
