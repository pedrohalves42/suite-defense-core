import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Shield, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/hooks/useTenant";
import { prepareJobsForInsert } from "@/lib/job-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Agent {
  id: string;
  agent_name: string;
  status: string;
}

export function SystemScanButton() {
  const [open, setOpen] = useState(false);
  const [agentName, setAgentName] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  const { data: agents, isLoading: isLoadingAgents } = useQuery({
    queryKey: ["active-agents", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      // ADR-026 Zero-Gap: Use RPC with explicit tenant_id
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      if (error) throw error;
      return ((data || []) as Array<Record<string, unknown>>)
        .filter((a: Record<string, unknown>) => a.status === 'active')
        .map((a: Record<string, unknown>): Agent => ({ id: String(a.id), agent_name: String(a.agent_name), status: String(a.status) }))
        .sort((a: Agent, b: Agent) => a.agent_name.localeCompare(b.agent_name));
    },
    enabled: !!tenant?.id,
  });

  const createSystemScan = useMutation({
    mutationFn: async (agentName: string) => {
      if (!tenant?.id) {
        throw new Error("Tenant ID não encontrado");
      }

      // Create multiple scan jobs for critical system paths
      // Agent expandira variaveis de ambiente automaticamente
      const criticalPaths = [
        "C:\\Users\\Public\\Downloads",  // Pasta publica de downloads
        "C:\\Windows\\Temp",             // Temp do sistema
        "C:\\ProgramData",               // Dados de programas
        "%USERPROFILE%\\Downloads",      // Downloads do usuario (agente expande)
        "%TEMP%",                        // Pasta temp do usuario (agente expande)
      ];

      const jobs = criticalPaths.map((path) => ({
        tenant_id: tenant.id,
        agent_name: agentName,
        type: "scan",
        payload: { filePath: path },
        status: "queued",
      }));

      const jobsWithHash = await prepareJobsForInsert(jobs);
      const { data, error } = await supabase.from("jobs").insert(jobsWithHash).select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Scan Completo Iniciado",
        description: `${data.length} jobs de scan criados para pastas críticas do sistema`,
      });
      queryClient.invalidateQueries({ queryKey: ["virus-scans"] });
      setOpen(false);
      setAgentName("");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar scan",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!agentName) {
      toast({
        title: "Agente não selecionado",
        description: "Por favor, selecione um agente",
        variant: "destructive",
      });
      return;
    }

    createSystemScan.mutate(agentName);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="cta">
          <Shield className="mr-2 h-4 w-4" />
          Scan Completo do Sistema
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escanear Sistema Completo</DialogTitle>
          <DialogDescription>
            Executa scan em múltiplas pastas críticas do sistema: Temp, Downloads,
            Public, ProgramData
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Agente</label>
            <Select value={agentName} onValueChange={setAgentName}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um agente online" />
              </SelectTrigger>
              <SelectContent>
                {isLoadingAgents ? (
                  <SelectItem value="loading" disabled>
                    Carregando...
                  </SelectItem>
                ) : agents && agents.length > 0 ? (
                  agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.agent_name}>
                      {agent.agent_name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>
                    Nenhum agente online
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createSystemScan.isPending || !agentName}
            >
              {createSystemScan.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Iniciar Scan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
