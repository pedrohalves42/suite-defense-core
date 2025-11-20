import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileSearch, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export function ScanFileDialog() {
  const [open, setOpen] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [filePath, setFilePath] = useState('');
  const queryClient = useQueryClient();

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ['active-agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('agent_name, status')
        .eq('status', 'active')
        .order('agent_name');
      
      if (error) throw error;
      return data;
    },
  });

  const createScanJob = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nao autenticado');

      const { data, error } = await supabase.functions.invoke('create-job', {
        body: {
          agent_name: agentName,
          job_type: 'scan',
          payload: {
            file_path: filePath
          }
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Job de Scan Criado',
        description: `O agente ${agentName} ira escanear o arquivo em breve.`,
      });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setOpen(false);
      setAgentName('');
      setFilePath('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao Criar Job',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentName || !filePath) {
      toast({
        title: 'Campos Obrigatorios',
        description: 'Selecione um agente e informe o caminho do arquivo.',
        variant: 'destructive',
      });
      return;
    }
    createScanJob.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <FileSearch className="mr-2 h-4 w-4" />
          Escanear Arquivo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Escanear Arquivo</DialogTitle>
          <DialogDescription>
            Crie um job de scan para verificar um arquivo especifico em um agente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agent">Agente</Label>
            <Select value={agentName} onValueChange={setAgentName}>
              <SelectTrigger id="agent">
                <SelectValue placeholder="Selecione um agente ativo" />
              </SelectTrigger>
              <SelectContent>
                {agentsLoading ? (
                  <div className="flex items-center justify-center p-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : agents?.length ? (
                  agents.map((agent) => (
                    <SelectItem key={agent.agent_name} value={agent.agent_name}>
                      {agent.agent_name}
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-2 text-sm text-muted-foreground">
                    Nenhum agente ativo disponivel
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="filePath">Caminho do Arquivo</Label>
            <Input
              id="filePath"
              type="text"
              placeholder="C:\path\to\file.exe"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Exemplo: C:\Users\Public\Downloads\arquivo.exe
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createScanJob.isPending}>
              {createScanJob.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Job de Scan'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
