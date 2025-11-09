import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Shield, AlertTriangle, CheckCircle, Trash2, RotateCcw, Search, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function Quarantine() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'restore' | 'delete'>('restore');
  const itemsPerPage = 10;

  const queryClient = useQueryClient();

  // Fetch quarantined files
  const { data: quarantinedFiles, isLoading } = useQuery({
    queryKey: ['quarantined-files', page, searchTerm, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('quarantined_files')
        .select('*, virus_scans(positives, total_scans, virustotal_permalink)', { count: 'exact' })
        .order('quarantined_at', { ascending: false })
        .range((page - 1) * itemsPerPage, page * itemsPerPage - 1);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (searchTerm) {
        query = query.or(`file_path.ilike.%${searchTerm}%,agent_name.ilike.%${searchTerm}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data, count };
    }
  });

  // Restore file mutation
  const restoreMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const { error } = await supabase
        .from('quarantined_files')
        .update({
          status: 'restored',
          restored_at: new Date().toISOString(),
          restored_by: (await supabase.auth.getUser()).data.user?.id
        })
        .eq('id', fileId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quarantined-files'] });
      toast.success('Arquivo restaurado com sucesso');
      setActionDialogOpen(false);
    },
    onError: () => {
      toast.error('Erro ao restaurar arquivo');
    }
  });

  // Delete file mutation
  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const { error } = await supabase
        .from('quarantined_files')
        .update({ status: 'deleted' })
        .eq('id', fileId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quarantined-files'] });
      toast.success('Arquivo marcado como deletado');
      setActionDialogOpen(false);
    },
    onError: () => {
      toast.error('Erro ao deletar arquivo');
    }
  });

  const handleAction = (file: any, type: 'restore' | 'delete') => {
    setSelectedFile(file);
    setActionType(type);
    setActionDialogOpen(true);
  };

  const confirmAction = () => {
    if (!selectedFile) return;
    
    if (actionType === 'restore') {
      restoreMutation.mutate(selectedFile.id);
    } else {
      deleteMutation.mutate(selectedFile.id);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      quarantined: { variant: 'destructive' as const, icon: AlertTriangle, text: 'Em Quarentena' },
      restored: { variant: 'default' as const, icon: CheckCircle, text: 'Restaurado' },
      deleted: { variant: 'secondary' as const, icon: Trash2, text: 'Deletado' }
    };
    
    const config = variants[status as keyof typeof variants];
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.text}
      </Badge>
    );
  };

  const totalPages = Math.ceil((quarantinedFiles?.count || 0) / itemsPerPage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Arquivos em Quarentena
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie arquivos maliciosos detectados automaticamente
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Quarentena</CardTitle>
            <FileWarning className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {quarantinedFiles?.data?.filter(f => f.status === 'quarantined').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Restaurados</CardTitle>
            <RotateCcw className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {quarantinedFiles?.data?.filter(f => f.status === 'restored').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deletados</CardTitle>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {quarantinedFiles?.data?.filter(f => f.status === 'deleted').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Filtre os arquivos em quarentena</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por caminho ou agente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="quarantined">Em Quarentena</SelectItem>
                <SelectItem value="restored">Restaurado</SelectItem>
                <SelectItem value="deleted">Deletado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Arquivos</CardTitle>
          <CardDescription>
            Lista de arquivos maliciosos detectados ({quarantinedFiles?.count || 0} total)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Carregando...</div>
          ) : quarantinedFiles?.data?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileWarning className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum arquivo em quarentena</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Agente</TableHead>
                    <TableHead>Detecções</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quarantinedFiles?.data?.map((file: any) => (
                    <TableRow key={file.id}>
                      <TableCell className="font-mono text-sm">{file.file_path}</TableCell>
                      <TableCell>{file.agent_name}</TableCell>
                      <TableCell>
                        {file.virus_scans?.[0] && (
                          <Badge variant="outline">
                            {file.virus_scans[0].positives}/{file.virus_scans[0].total_scans}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(file.status)}</TableCell>
                      <TableCell>{format(new Date(file.quarantined_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {file.status === 'quarantined' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAction(file, 'restore')}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleAction(file, 'delete')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {page} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Próxima
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <AlertDialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === 'restore' ? 'Restaurar Arquivo' : 'Deletar Arquivo'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === 'restore'
                ? 'Tem certeza que deseja restaurar este arquivo? Ele voltará a estar acessível no sistema.'
                : 'Tem certeza que deseja marcar este arquivo como deletado? Esta ação não pode ser desfeita.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAction}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
