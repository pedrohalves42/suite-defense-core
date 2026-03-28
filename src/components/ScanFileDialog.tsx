import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RpcAgentRow } from '@/types/rpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FileSearch, Loader2, HardDrive } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useActiveTenant } from '@/hooks/useActiveTenant';

export function ScanFileDialog() {
  const [open, setOpen] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [filePath, setFilePath] = useState('');
  const [scanFullSystem, setScanFullSystem] = useState(false);
  const queryClient = useQueryClient();
  const { activeTenant, loading: tenantLoading } = useActiveTenant();

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ['active-agents', activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return [];
      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: activeTenant.id,
        p_include_archived: false
      });
      
      if (error) throw error;
      return ((data || []) as any as RpcAgentRow[])
        .filter((a) => a.status === 'active')
        .map((a) => ({ agent_name: a.agent_name, status: a.status }))
        .sort((a, b) => a.agent_name.localeCompare(b.agent_name));
    },
    enabled: !tenantLoading && !!activeTenant?.id,
  });

  const createScanJob = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nao autenticado');

      // Determinar tipo de job e payload
      const jobType = scanFullSystem ? 'full_system_scan' : 'scan';
      const payload = scanFullSystem 
        ? { scanType: 'full_system' }
        : { filePath: filePath };

      const { data, error } = await supabase.functions.invoke('create-job', {
        body: {
          agent_name: agentName,
          job_type: jobType,
          payload
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      const message = scanFullSystem 
        ? `O computador ${agentName} irá escanear todo o sistema em breve.`
        : `O computador ${agentName} irá escanear o arquivo em breve.`;
      
      toast({
        title: scanFullSystem ? 'Scan Completo Iniciado' : 'Job de Scan Criado',
        description: message,
      });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setOpen(false);
      setAgentName('');
      setFilePath('');
      setScanFullSystem(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao Criar Job',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Validação de path inválido para conta SYSTEM
  const isInvalidPath = (path: string) => {
    const invalidPatterns = [
      '%USERPROFILE%',
      '%APPDATA%',
      '%TEMP%',
      '%LOCALAPPDATA%',
      '\\users\\',
      '/users/',
      'downloads',
      'documents',
      'desktop',
    ];
    const lowerPath = path.toLowerCase();
    return invalidPatterns.some(pattern => lowerPath.includes(pattern.toLowerCase()));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!agentName) {
      toast({
        title: 'Computador Obrigatório',
        description: 'Selecione um computador ativo para executar o scan.',
        variant: 'destructive',
      });
      return;
    }
    
    // Se não for scan completo, validar o caminho
    if (!scanFullSystem) {
      const trimmedPath = filePath.trim();
      
      if (!trimmedPath) {
        toast({
          title: 'Caminho Obrigatório',
          description: 'Informe o caminho completo do arquivo ou marque "Escanear Todo o Computador".',
          variant: 'destructive',
        });
        return;
      }
      
      // Bloquear paths inválidos para SYSTEM
      if (isInvalidPath(filePath)) {
        toast({
          title: 'Caminho Inválido',
          description: 'O agente roda como SYSTEM e não tem acesso a pastas de usuário. Use caminhos como C:\\Program Files\\...',
          variant: 'destructive',
        });
        return;
      }
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
            <Label htmlFor="agent">Computador</Label>
            <Select value={agentName} onValueChange={setAgentName}>
              <SelectTrigger id="agent">
                <SelectValue placeholder="Selecione um computador ativo" />
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
                    Nenhum computador ativo disponível
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Opção Scan Completo */}
          <div className="flex items-center space-x-3 p-3 rounded-md border bg-muted/30">
            <Checkbox 
              id="scanFullSystem" 
              checked={scanFullSystem}
              onCheckedChange={(checked) => setScanFullSystem(checked as boolean)}
            />
            <div className="flex-1">
              <Label htmlFor="scanFullSystem" className="flex items-center gap-2 cursor-pointer font-medium">
                <HardDrive className="h-4 w-4 text-primary" />
                Escanear Todo o Computador
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Verifica todas as unidades e diretórios do sistema
              </p>
            </div>
          </div>

          {/* Campo de caminho (apenas se não for scan completo) */}
          {!scanFullSystem && (
            <div className="space-y-2">
              <Label htmlFor="filePath">Caminho do Arquivo</Label>
              <Input
                id="filePath"
                type="text"
                placeholder="C:\Program Files\app\file.exe"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
              />
              <div className="rounded-md bg-muted/50 p-2 text-xs">
                <p className="font-medium mb-1">Caminhos recomendados (conta SYSTEM):</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  <li><code>C:\Windows\System32\...</code></li>
                  <li><code>C:\Program Files\...</code></li>
                  <li><code>C:\ProgramData\...</code></li>
                  <li><code>C:\Temp\...</code></li>
                </ul>
              </div>
              {(filePath.includes('%USERPROFILE%') || 
                filePath.includes('%APPDATA%') || 
                filePath.includes('%TEMP%') ||
                filePath.toLowerCase().includes('\\users\\') ||
                filePath.toLowerCase().includes('downloads') ||
                filePath.toLowerCase().includes('documents') ||
                filePath.toLowerCase().includes('desktop')) && (
                <div className="rounded-md bg-destructive/20 border border-destructive/30 p-3 text-xs text-destructive">
                  <p className="font-semibold">⚠️ Caminho Inválido para SYSTEM</p>
                  <p className="mt-1">
                    O agente roda como conta SYSTEM e <strong>não tem acesso</strong> a pastas de usuário como Downloads, Documents ou Desktop.
                  </p>
                  <p className="mt-1">
                    Use caminhos absolutos como <code>C:\Program Files\...</code> ou <code>C:\Windows\...</code>
                  </p>
                </div>
              )}
            </div>
          )}

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
              ) : scanFullSystem ? (
                <>
                  <HardDrive className="mr-2 h-4 w-4" />
                  Escanear Sistema
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
