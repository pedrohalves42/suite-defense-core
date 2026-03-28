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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Mail } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { useTenant } from '@/hooks/useTenant';

export default function Invites() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'operator' | 'viewer'>('viewer');

  const { data: invites, isLoading } = useQuery({
    queryKey: ['invites'],
    queryFn: async () => {
      // Use invites_safe view to avoid exposing token field
      const { data, error } = await supabase
        .from('invites_safe')
        .select('id, email, role, status, tenant_id, invited_by, created_at, expires_at, accepted_at')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const sendInvite = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invite`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, role }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send invite');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
      toast({ title: 'Convite enviado com sucesso!' });
      setOpen(false);
      setEmail('');
      setRole('viewer');
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Erro ao enviar convite', variant: 'destructive' });
    },
  });

  // SECURITY: Use Edge Function for delete (Phase 3 hardening - column privileges block direct access)
  const deleteInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke('delete-invite', {
        body: { inviteId: id },
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
      toast({ title: 'Convite removido com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Erro ao remover convite', variant: 'destructive' });
    },
  });

  // Token is not exposed via invites_safe view for security
  // Copy link functionality removed as tokens should not be exposed to frontend

  const getStatusBadge = (status: string, expiresAt: string) => {
    if (status === 'accepted') return { variant: 'default' as const, text: 'Aceito' };
    if (new Date(expiresAt) < new Date()) return { variant: 'secondary' as const, text: 'Expirado' };
    return { variant: 'outline' as const, text: 'Pendente' };
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Convites de Usuarios</h2>
          <p className="text-muted-foreground">Convide novos membros para o seu tenant</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Convite
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enviar Convite</DialogTitle>
              <DialogDescription>
                Convide um novo usuario para {tenant?.name || 'seu tenant'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input 
                  type="email"
                  placeholder="usuario@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={role} onValueChange={(value: Record<string, unknown>) => setRole(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer - Apenas visualização</SelectItem>
                    <SelectItem value="operator">Operator - Pode gerenciar verificações</SelectItem>
                    <SelectItem value="admin">Admin - Acesso total</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={() => sendInvite.mutate()} 
                disabled={sendInvite.isPending || !email}
                className="w-full"
              >
                <Mail className="h-4 w-4 mr-2" />
                Enviar Convite
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Convites Enviados</CardTitle>
          <CardDescription>Lista de todos os convites do tenant</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Carregando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enviado em</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites?.map((invite) => {
                  const status = getStatusBadge(invite.status, invite.expires_at);
                  return (
                    <TableRow key={invite.id}>
                      <TableCell>{invite.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{invite.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.text}</Badge>
                      </TableCell>
                      <TableCell>{formatBrazilDateTime(invite.created_at, 'datetime')}</TableCell>
                      <TableCell>{formatBrazilDateTime(invite.expires_at, 'datetime')}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm" 
                          variant="ghost"
                          onClick={() => deleteInvite.mutate(invite.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
  );
}
