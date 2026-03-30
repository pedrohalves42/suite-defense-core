import { useState, useEffect, memo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Plus, XCircle, ChevronLeft, ChevronRight, TrendingUp, Key, Users, Clock, Trash, Loader2 } from 'lucide-react';
import { subDays } from 'date-fns';
import { formatBrazilDateTime } from '@/lib/date-utils';

const ITEMS_PER_PAGE = 10;

const CountdownTimer = memo(({ expiresAt }: { expiresAt: string }) => {
  const [timeRemaining, setTimeRemaining] = useState('');
  const [colorClass, setColorClass] = useState('text-green-600');

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const expiry = new Date(expiresAt);
      const diff = expiry.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining('Expirado');
        setColorClass('text-muted-foreground');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 12) {
        setTimeRemaining(`${hours}h ${minutes}m`);
        setColorClass('text-green-600');
      } else if (hours >= 1) {
        setTimeRemaining(`${hours}h ${minutes}m`);
        setColorClass('text-yellow-600');
      } else if (minutes > 0) {
        setTimeRemaining(`${minutes}m`);
        setColorClass('text-red-600');
      } else {
        setTimeRemaining('< 1m');
        setColorClass('text-red-600');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // Atualiza a cada minuto

    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <span className={`font-medium ${colorClass}`}>
      {timeRemaining}
    </span>
  );
});

export default function EnrollmentKeys() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canWrite, loading: roleLoading } = useUserRole();
  const { logSensitiveAccess } = useAuditLog();
  const [open, setOpen] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState('24');
  const [maxUses, setMaxUses] = useState('1');
  const [description, setDescription] = useState('');
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  
  // Audit log: list view
  const logListView = useCallback(async () => {
    await logSensitiveAccess('enrollment_key', 'list', 'list', { 
      page, 
      filter: statusFilter,
      search: searchTerm || null 
    });
  }, [logSensitiveAccess, page, statusFilter, searchTerm]);
  
  useEffect(() => {
    logListView();
  }, [logListView]);

  // FASE 1.3: Usar view segura com mascara ao inves de tabela direta
  const { data: keys, isLoading } = useQuery({
    queryKey: ['enrollment-keys', page, searchTerm, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('enrollment_keys_safe')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      if (searchTerm) {
        query = query.or(`description.ilike.%${searchTerm}%,key_masked.ilike.%${searchTerm}%`);
      }

      if (statusFilter !== 'all') {
        query = query.eq('is_active', statusFilter === 'active');
      }

      const { data, error, count } = await query;
      if (error) throw error;

      // ADR-FINAL-002: Use profiles_public view for listing creator names
      if (data && data.length > 0) {
        const creatorIds = [...new Set(data.map(k => k.created_by).filter(Boolean))];
        const { data: profiles } = await supabase
          .from('profiles_public')
          .select('user_id, full_name')
          .in('user_id', creatorIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);
        
        const dataWithCreators = data.map(key => ({
          ...key,
          creator_name: key.created_by ? profileMap.get(key.created_by) : null
        }));

        return { data: dataWithCreators, count };
      }

      return { data, count };
    },
  });

  // FASE 2: Usar view segura para estatisticas
  const { data: stats } = useQuery({
    queryKey: ['enrollment-keys-stats'],
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      
      // Usar enrollment_keys_safe ao inves de enrollment_keys
      const { data: allKeys } = await supabase
        .from('enrollment_keys_safe')
        .select('*');

      const { data: recentKeys } = await supabase
        .from('enrollment_keys_safe')
        .select('*')
        .gte('created_at', thirtyDaysAgo);

      const { data: usedKeys } = await supabase
        .from('enrollment_keys_safe')
        .select('*')
        .not('used_at', 'is', null)
        .gte('used_at', thirtyDaysAgo);

      const activeCount = allKeys?.filter(k => k.is_active).length || 0;
      const recentCount = recentKeys?.length || 0;
      const usedCount = usedKeys?.length || 0;
      const totalUses = allKeys?.reduce((sum, k) => sum + k.current_uses, 0) || 0;

      return { activeCount, recentCount, usedCount, totalUses };
    },
  });

  const totalPages = keys?.count ? Math.ceil(keys.count / ITEMS_PER_PAGE) : 0;

  const createKey = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-enrollment-key`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expiresInHours: parseInt(expiresInHours),
          maxUses: parseInt(maxUses),
          description,
        }),
      });

      if (!response.ok) throw new Error('Failed to create key');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollment-keys'] });
      toast({ title: 'Chave criada com sucesso!' });
      setOpen(false);
      setDescription('');
    },
    onError: () => {
      toast({ title: 'Erro ao criar chave', variant: 'destructive' });
    },
  });

  // FASE 2: Usar Edge Function para revogar ao inves de acesso direto
  const revokeKey = useMutation({
    mutationFn: async (key: any) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/revoke-enrollment-key`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ keyId: key.id }),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to revoke key');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollment-keys'] });
      queryClient.invalidateQueries({ queryKey: ['enrollment-keys-stats'] });
      toast({ title: 'Chave revogada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao revogar chave', description: error.message, variant: 'destructive' });
    },
  });

  // FASE 1: Audit logging para copia de chave
  const copyToClipboard = async (key: string, keyId: string) => {
    navigator.clipboard.writeText(key);
    await logSensitiveAccess('enrollment_key', keyId, 'copy', { 
      key_prefix: key.substring(0, 8) + '...' 
    });
    toast({ title: 'Chave copiada!' });
  };

  const runManualCleanup = async () => {
    setIsCleaningUp(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke(
        'cleanup-expired-enrollment-keys',
        {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
        }
      );

      if (error) throw error;

      toast({
        title: "Limpeza concluida!",
        description: `${data.deleted_count} chaves expiradas foram removidas.`
      });

      queryClient.invalidateQueries({ queryKey: ['enrollment-keys'] });
      queryClient.invalidateQueries({ queryKey: ['enrollment-keys-stats'] });
      setShowCleanupDialog(false);
    } catch (error) {
      toast({
        title: "Erro ao executar limpeza",
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsCleaningUp(false);
    }
  };

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Chaves de Cadastro</h2>
          <p className="text-muted-foreground">Gerencie as chaves para cadastrar novos computadores</p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <>
              <AlertDialog open={showCleanupDialog} onOpenChange={setShowCleanupDialog}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline">
                    <Trash className="h-4 w-4 mr-2" />
                    Limpar Expiradas
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Limpeza Manual</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acao ira remover permanentemente todas as enrollment keys que:
                      <ul className="list-disc ml-5 mt-2 space-y-1">
                        <li>Expiraram ha mais de 48 horas</li>
                        <li>Estao marcadas como inativas</li>
                      </ul>
                      <br />
                      Esta acao nao pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isCleaningUp}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={runManualCleanup} disabled={isCleaningUp}>
                      {isCleaningUp ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Limpando...
                        </>
                      ) : (
                        "Confirmar Limpeza"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Chave
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Criar Nova Chave</DialogTitle>
                    <DialogDescription>
                      Configure os parametros para a nova chave de enrollment
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Expira em (horas)</Label>
                      <Input 
                        type="number" 
                        value={expiresInHours}
                        onChange={(e) => setExpiresInHours(e.target.value)}
                        min="1"
                      />
                    </div>
                    <div>
                      <Label>Usos maximos</Label>
                      <Input 
                        type="number" 
                        value={maxUses}
                        onChange={(e) => setMaxUses(e.target.value)}
                        min="1"
                      />
                    </div>
                    <div>
                      <Label>Descricao</Label>
                      <Textarea 
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Descricao opcional..."
                      />
                    </div>
                    <Button 
                      onClick={() => createKey.mutate()} 
                      disabled={createKey.isPending}
                      className="w-full"
                    >
                      Criar Chave
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <StatsGrid columns={4}>
        <SummaryStatCard
          title="Chaves Ativas"
          value={stats?.activeCount || 0}
          icon={Key}
          subtitle="Total de chaves ativas"
        />
        <SummaryStatCard
          title="Criadas (30d)"
          value={stats?.recentCount || 0}
          icon={TrendingUp}
          subtitle="Ultimos 30 dias"
        />
        <SummaryStatCard
          title="Usadas (30d)"
          value={stats?.usedCount || 0}
          icon={Users}
          subtitle="Ultimos 30 dias"
        />
        <SummaryStatCard
          title="Total de Usos"
          value={stats?.totalUses || 0}
          icon={Clock}
          subtitle="Todos os tempos"
        />
      </StatsGrid>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Busque e filtre as chaves</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                placeholder="Buscar por descricao ou chave..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <div>
              <Select value={statusFilter} onValueChange={(value) => {
                setStatusFilter(value);
                setPage(0);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="active">Ativas</SelectItem>
                  <SelectItem value="inactive">Inativas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chaves de Enrollment</CardTitle>
          <CardDescription>
            Mostrando {keys?.data?.length || 0} de {keys?.count || 0} chaves
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Carregando...</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Chave</TableHead>
                      <TableHead>Descricao</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Usos</TableHead>
                      <TableHead>Criado por</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead>Ultimo uso</TableHead>
                      <TableHead>Expira em</TableHead>
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys?.data?.map((key: any) => {
                      const isExpired = new Date(key.expires_at) < new Date();
                      const isMaxUsed = key.current_uses >= key.max_uses;
                      
                      return (
                        <TableRow key={key.id}>
                          {/* FASE 1.3: Mostrar chave mascarada ao inves da chave completa */}
                          <TableCell className="font-mono text-sm">{key.key_masked}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{key.description || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={key.is_active && !isExpired && !isMaxUsed ? 'default' : 'secondary'}>
                              {!key.is_active ? 'Revogada' : isExpired ? 'Expirada' : isMaxUsed ? 'Esgotada' : 'Ativa'}
                            </Badge>
                          </TableCell>
                          <TableCell>{key.current_uses}/{key.max_uses}</TableCell>
                          <TableCell>{key.creator_name || '-'}</TableCell>
                          <TableCell className="text-sm">{formatBrazilDateTime(key.created_at, 'short')}</TableCell>
                          <TableCell className="text-sm">{key.used_at ? formatBrazilDateTime(key.used_at, 'short') : '-'}</TableCell>
                          <TableCell className="text-sm">
                            <div className="flex flex-col gap-1">
                              <span className="text-muted-foreground">{formatBrazilDateTime(key.expires_at, 'short')}</span>
                              <CountdownTimer expiresAt={key.expires_at} />
                            </div>
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {/* FASE 1.3: REMOVIDO botao de copiar - chave nao pode ser copiada via frontend */}
                            {canWrite && key.is_active && (
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => revokeKey.mutate(key)}
                                disabled={revokeKey.isPending}
                                title="Revogar chave"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Pagina {page + 1} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Proxima
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
