import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Ban, Clock, Eye, Shield, FileText, FileSpreadsheet } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import type { EnrichedActivity, SortField, SortDir } from './types';
import { ITEMS_PER_PAGE } from './types';

interface WebActivityTableProps {
  isLoading: boolean;
  error: Error | null;
  filteredActivity: EnrichedActivity[];
  paginatedActivity: EnrichedActivity[];
  sortField: SortField;
  sortDir: SortDir;
  currentPage: number;
  totalPages: number;
  onSort: (field: SortField) => void;
  onPageChange: (page: number) => void;
  onAnalyzeDomain: (domain: string) => void;
  onBlockSite: (domain: string) => void;
  onUnblockSite: (domain: string) => void;
  onExportCSV: () => void;
  onExportPDF: () => void;
  sortedActivityLength: number;
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <span className="text-muted-foreground/30 ml-1">↕</span>;
  return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

export function WebActivityTable({
  isLoading, error, filteredActivity, paginatedActivity,
  sortField, sortDir, currentPage, totalPages,
  onSort, onPageChange, onAnalyzeDomain, onBlockSite, onUnblockSite,
  onExportCSV, onExportPDF, sortedActivityLength,
}: WebActivityTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Erro ao carregar atividade web: {error.message}</AlertDescription>
      </Alert>
    );
  }

  if (filteredActivity.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Nenhuma atividade web encontrada para os filtros selecionados.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />Todos os Domínios
            </CardTitle>
            <CardDescription>{filteredActivity.length} domínios encontrados • Página {currentPage} de {totalPages}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onExportCSV} disabled={!filteredActivity.length} className="gap-1">
              <FileSpreadsheet className="h-4 w-4" />CSV
            </Button>
            <Button variant="default" size="sm" onClick={onExportPDF} disabled={!filteredActivity.length} className="gap-1">
              <FileText className="h-4 w-4" />PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => onSort('domain')}>
                Domínio <SortIcon field="domain" sortField={sortField} sortDir={sortDir} />
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => onSort('category')}>
                Categoria <SortIcon field="category" sortField={sortField} sortDir={sortDir} />
              </TableHead>
              <TableHead className="text-center cursor-pointer select-none hover:text-foreground" onClick={() => onSort('hits')}>
                Acessos <SortIcon field="hits" sortField={sortField} sortDir={sortDir} />
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => onSort('last_seen_at')}>
                <Clock className="h-4 w-4 inline mr-1" />Última Visita <SortIcon field="last_seen_at" sortField={sortField} sortDir={sortDir} />
              </TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedActivity.map((item) => (
              <TableRow key={item.domain} className={item.isBlocked ? 'bg-destructive/5' : ''}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {item.domain}
                    {item.isBlocked && (
                      <Badge variant="destructive" className="text-xs"><Ban className="h-3 w-3 mr-1" />Bloqueado</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={item.category.color} variant="outline">{item.category.icon} {item.category.name}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary" className="font-mono">{item.hits.toLocaleString('pt-BR')}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatBrazilDateTime(item.last_seen_at, 'datetime')}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onAnalyzeDomain(item.domain)} title="Analisar ameaça">
                      <Shield className="h-4 w-4" />
                    </Button>
                    {!item.isBlocked ? (
                      <Button variant="destructive" size="sm" onClick={() => onBlockSite(item.domain)}>
                        <Ban className="h-4 w-4 mr-1" />Bloquear
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => onUnblockSite(item.domain)}>Desbloquear</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted-foreground">
              Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, sortedActivityLength)} de {sortedActivityLength}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(1)}>««</Button>
              <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>‹ Anterior</Button>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>Próxima ›</Button>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => onPageChange(totalPages)}>»»</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
