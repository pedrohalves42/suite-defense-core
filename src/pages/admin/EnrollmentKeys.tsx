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
import { useToast } from '@/hooks/use-toast';
import { Plus, Copy, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

export default function EnrollmentKeys() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState('24');
  const [maxUses, setMaxUses] = useState('1');
  const [description, setDescription] = useState('');

  const { data: keys, isLoading } = useQuery({
    queryKey: ['enrollment-keys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollment_keys')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

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

  const deleteKey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('enrollment_keys')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollment-keys'] });
      toast({ title: 'Chave removida com sucesso!' });
    },
  });

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    toast({ title: 'Chave copiada!' });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Chaves de Enrollment</h2>
          <p className="text-muted-foreground">Gerencie as chaves para registro de novos agentes</p>
        </div>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Chaves Ativas</CardTitle>
          <CardDescription>Lista de todas as chaves de enrollment</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Carregando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chave</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usos</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys?.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-mono text-sm">{key.key}</TableCell>
                    <TableCell>{key.description || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={key.is_active ? 'default' : 'secondary'}>
                        {key.is_active ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </TableCell>
                    <TableCell>{key.current_uses}/{key.max_uses}</TableCell>
                    <TableCell>{format(new Date(key.expires_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => copyToClipboard(key.key)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => deleteKey.mutate(key.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
