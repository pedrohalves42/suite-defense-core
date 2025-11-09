import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/hooks/useTenant';
import { Plus, Copy, Eye, EyeOff, Trash2, Key } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ApiKeys() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read']);
  const [expiresInDays, setExpiresInDays] = useState('365');
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['api-keys', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const createApiKey = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant não encontrado');

      // Generate API key (sk_live_... format)
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      const keyPart = Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 48);
      
      const apiKey = `sk_live_${keyPart}`;
      const keyPrefix = apiKey.substring(0, 12) + '...';

      // Hash the key
      const encoder = new TextEncoder();
      const data = encoder.encode(apiKey);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays));

      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('api_keys')
        .insert({
          tenant_id: tenant.id,
          name,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          scopes,
          expires_at: expiresAt.toISOString(),
          created_by: user?.id,
        });

      if (error) throw error;

      return apiKey;
    },
    onSuccess: (apiKey) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setNewApiKey(apiKey);
      toast({ title: 'API key criada com sucesso!' });
      setName('');
      setScopes(['read']);
      setExpiresInDays('365');
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Erro ao criar API key', variant: 'destructive' });
    },
  });

  const deleteApiKey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast({ title: 'API key removida com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Erro ao remover API key', variant: 'destructive' });
    },
  });

  const toggleKeyVisibility = (id: string) => {
    setShowKey(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado para área de transferência!' });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Chaves de API</h2>
          <p className="text-muted-foreground">Gerencie chaves de API para integração externa</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Chave de API
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Nova Chave de API</DialogTitle>
              <DialogDescription>
                Crie uma chave de API para acessar os dados do tenant programaticamente
              </DialogDescription>
            </DialogHeader>
            
            {newApiKey ? (
              <div className="space-y-4">
                <Alert>
                  <Key className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-semibold mb-2">Sua chave de API foi criada com sucesso!</p>
                    <p className="text-sm text-muted-foreground mb-2">
                      Copie esta chave agora. Você não poderá vê-la novamente.
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <code className="flex-1 p-2 bg-muted rounded text-sm">
                        {newApiKey}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(newApiKey)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
                <Button
                  onClick={() => {
                    setNewApiKey(null);
                    setOpen(false);
                  }}
                  className="w-full"
                >
                  Fechar
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Nome</Label>
                  <Input
                    placeholder="Minha API Key"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Permissões</Label>
                  <Select
                    value={scopes[0]}
                    onValueChange={(value) => setScopes([value])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read">Apenas Leitura</SelectItem>
                      <SelectItem value="write">Leitura e Escrita</SelectItem>
                      <SelectItem value="admin">Admin (Controle Total)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Expira em (dias)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="3650"
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                  />
                </div>
                <Button
                  onClick={() => createApiKey.mutate()}
                  disabled={createApiKey.isPending || !name}
                  className="w-full"
                >
                  Criar Chave de API
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Chaves Ativas</CardTitle>
          <CardDescription>Suas chaves de API para integração</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Carregando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Chave</TableHead>
                  <TableHead>Permissões</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último Uso</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys?.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-sm">
                          {showKey[key.id] ? key.key_prefix : key.key_prefix}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(key.key_prefix)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {key.scopes.join(', ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {key.is_active ? (
                        <Badge variant="default">Ativa</Badge>
                      ) : (
                        <Badge variant="secondary">Inativa</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {key.last_used_at
                        ? format(new Date(key.last_used_at), 'dd/MM/yyyy HH:mm')
                        : 'Nunca'}
                    </TableCell>
                    <TableCell>
                      {format(new Date(key.expires_at), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteApiKey.mutate(key.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!apiKeys || apiKeys.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Nenhuma chave de API criada ainda
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentação da API</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Endpoints Disponíveis:</h3>
            <div className="space-y-2 text-sm">
              <div className="p-3 bg-muted rounded">
                <code className="text-primary">GET /functions/v1/api-tenant-info</code>
                <p className="text-muted-foreground mt-1">Retorna informações básicas do tenant</p>
              </div>
              <div className="p-3 bg-muted rounded">
                <code className="text-primary">GET /functions/v1/api-tenant-features</code>
                <p className="text-muted-foreground mt-1">Lista features e quotas disponíveis</p>
              </div>
              <div className="p-3 bg-muted rounded">
                <code className="text-primary">GET /functions/v1/api-tenant-stats</code>
                <p className="text-muted-foreground mt-1">Estatísticas de uso (agentes, scans, jobs)</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Exemplo de Uso:</h3>
            <pre className="p-3 bg-muted rounded text-sm overflow-x-auto">
{`curl -X GET \\
  'https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/api-tenant-info' \\
  -H 'Authorization: Bearer YOUR_API_KEY'`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
