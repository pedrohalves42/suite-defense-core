import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { Plus, Copy, XCircle, ChevronLeft, ChevronRight, TrendingUp, Key, Users, Clock } from 'lucide-react';
import { format, subDays } from 'date-fns';

const ITEMS_PER_PAGE = 10;

export default function EnrollmentKeys() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canWrite, loading: roleLoading } = useUserRole();
  const [open, setOpen] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState('24');
  const [maxUses, setMaxUses] = useState('1');
  const [description, setDescription] = useState('');
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: keys, isLoading } = useQuery({
    queryKey: ['enrollment-keys', page, searchTerm, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('enrollment_keys')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      if (searchTerm) {
        query = query.or(`description.ilike.%${searchTerm}%,key.ilike.%${searchTerm}%`);
      }

      if (statusFilter !== 'all') {
        query = query.eq('is_active', statusFilter === 'active');
      }

      const { data, error, count } = await query;
      if (error) throw error;

      // Buscar nomes dos criadores separadamente
      if (data && data.length > 0) {
        const creatorIds = [...new Set(data.map(k => k.created_by).filter(Boolean))];
        const { data: profiles } = await supabase
          .from('profiles')
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

  const { data: stats } = useQuery({
    queryKey: ['enrollment-keys-stats'],
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      
      const { data: allKeys } = await supabase
        .from('enrollment_keys')
        .select('*');

      const { data: recentKeys } = await supabase
        .from('enrollment_keys')
        .select('*')
        .gte('created_at', thirtyDaysAgo);

      const { data: usedKeys } = await supabase
        .from('enrollment_keys')
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

  const revokeKey = useMutation({
    mutationFn: async (key: any) => {
      const { error } = await supabase
        .from('enrollment_keys')
        .update({ is_active: false })
        .eq('id', key.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollment-keys'] });
      queryClient.invalidateQueries({ queryKey: ['enrollment-keys-stats'] });
      toast({ title: 'Chave revogada com sucesso!' });
    },
    onError: () => {
      toast({ title: 'Erro ao revogar chave', variant: 'destructive' });
    },
  });

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    toast({ title: 'Chave copiada!' });
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
          <h2 className="text-3xl font-bold">Chaves de Enrollment</h2>
          <p className="text-muted-foreground">Gerencie as chaves para registro de novos agentes</p>
        </div>
        {canWrite && (
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
                Configure os parâmetros para a nova chave de enrollment
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
                <Label>Usos máximos</Label>
                <Input 
                  type="number" 
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  min="1"
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrição opcional..."
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
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chaves Ativas</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeCount || 0}</div>
            <p className="text-xs text-muted-foreground">Total de chaves ativas</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Criadas (30d)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.recentCount || 0}</div>
            <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usadas (30d)</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.usedCount || 0}</div>
            <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Usos</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUses || 0}</div>
            <p className="text-xs text-muted-foreground">Todos os tempos</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Busque e filtre as chaves</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                placeholder="Buscar por descrição ou chave..."
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
                      <TableHead>Descrição</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Usos</TableHead>
                      <TableHead>Criado por</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead>Último uso</TableHead>
                      <TableHead>Expira em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys?.data?.map((key: any) => {
                      const isExpired = new Date(key.expires_at) < new Date();
                      const isMaxUsed = key.current_uses >= key.max_uses;
                      
                      return (
                        <TableRow key={key.id}>
                          <TableCell className="font-mono text-sm">{key.key}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{key.description || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={key.is_active && !isExpired && !isMaxUsed ? 'default' : 'secondary'}>
                              {!key.is_active ? 'Revogada' : isExpired ? 'Expirada' : isMaxUsed ? 'Esgotada' : 'Ativa'}
                            </Badge>
                          </TableCell>
                          <TableCell>{key.current_uses}/{key.max_uses}</TableCell>
                          <TableCell>{key.creator_name || '-'}</TableCell>
                          <TableCell className="text-sm">{format(new Date(key.created_at), 'dd/MM/yy HH:mm')}</TableCell>
                          <TableCell className="text-sm">{key.used_at ? format(new Date(key.used_at), 'dd/MM/yy HH:mm') : '-'}</TableCell>
                          <TableCell className="text-sm">{format(new Date(key.expires_at), 'dd/MM/yy HH:mm')}</TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => copyToClipboard(key.key)}
                              title="Copiar chave"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
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
                  Página {page + 1} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Próxima
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
