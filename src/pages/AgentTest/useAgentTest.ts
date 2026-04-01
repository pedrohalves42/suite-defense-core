import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';

interface TestResult {
  step: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message: string;
  timestamp: string;
  data?: any;
}

export type { TestResult };

export function useAgentTest() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');
      const response = await supabase.functions.invoke('system-maintenance', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Dados de teste limpos com sucesso',
        description: `${data.results.agents} agentes, ${data.results.agent_tokens} tokens, ${data.results.installation_analytics} eventos removidos`,
      });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setSelectedAgent(null);
      setTestResults([]);
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao limpar dados', description: error.message, variant: 'destructive' });
    },
  });

  const { data: agents } = useQuery({
    queryKey: ['agents', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      if (error) throw error;
      return ((data || []) as unknown[]).sort((a: any, b: any) => a.agent_name.localeCompare(b.agent_name));
    },
    enabled: !!tenant?.id,
  });

  const addTestResult = (result: Omit<TestResult, 'timestamp'>) => {
    setTestResults(prev => [...prev, { ...result, timestamp: new Date().toISOString() }]);
  };

  const runIntegrationTest = useMutation({
    mutationFn: async (agentName: string) => {
      if (!tenant) throw new Error('Tenant nao encontrado');
      setTestResults([]);

      // Step 1
      addTestResult({ step: '1. Criar Job de Teste', status: 'running', message: 'Criando job de teste tipo \'report\'...' });
      const { data: jobResponse, error: jobError } = await supabase.functions.invoke('create-job', {
        body: { agentName, type: 'report', payload: { test: true, timestamp: new Date().toISOString() }, approved: true },
      });
      if (jobError) {
        const errorData = typeof jobError === 'object' && 'error' in jobError ? jobError.error : jobError;
        const errorCode = errorData?.code;
        const errorMessage = errorData?.message || jobError.message || 'Erro ao criar job';
        if (errorCode === 'FORBIDDEN') throw new Error('Acesso negado. E necessario ter papel admin, operator ou super_admin.');
        else if (errorCode === 'AGENT_NOT_FOUND') throw new Error('Agente nao encontrado ou nao pertence ao tenant selecionado.');
        else throw new Error(`Erro ao criar job: ${errorMessage}`);
      }
      const job = { id: jobResponse.id, created_at: new Date().toISOString(), ...jobResponse };
      addTestResult({ step: '1. Criar Job de Teste', status: 'success', message: `Job criado com sucesso: ${job.id}`, data: job });

      // Step 2
      addTestResult({ step: '2. Aguardar Polling do Agent', status: 'running', message: 'Aguardando agent fazer polling (max 120s)...' });
      let polled = false;
      let attempts = 0;
      while (!polled && attempts < 24) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
        const { data: updatedJob } = await supabase.from('jobs').select('status, delivered_at').eq('id', job.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (updatedJob?.status === 'delivered' || updatedJob?.delivered_at) {
          polled = true;
          addTestResult({ step: '2. Aguardar Polling do Agent', status: 'success', message: `Agent fez polling apos ${attempts * 5}s`, data: updatedJob });
        }
      }
      if (!polled) throw new Error('Agent nao fez polling apos 120s. Verifique se o agent esta rodando.');

      // Step 3
      addTestResult({ step: '3. Aguardar Conclusao do Job', status: 'running', message: 'Aguardando agent executar e retornar output (max 60s)...' });
      let jobCompleted = false;
      attempts = 0;
      while (!jobCompleted && attempts < 12) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
        const { data: updatedJob } = await supabase.from('jobs').select('status, output, completed_at').eq('id', job.id).maybeSingle();
        if (updatedJob?.status === 'completed' && updatedJob?.output) {
          jobCompleted = true;
          addTestResult({ step: '3. Aguardar Conclusao do Job', status: 'success', message: `Job completado com output apos ${attempts * 5}s`, data: { status: updatedJob.status, output: updatedJob.output } });
        }
      }
      if (!jobCompleted) throw new Error('Agent nao completou job com output apos 60s. Verifique os logs do agent.');

      // Step 4
      addTestResult({ step: '4. Aguardar ACK do Job', status: 'running', message: 'Aguardando agent confirmar job (max 30s)...' });
      let acked = false;
      attempts = 0;
      while (!acked && attempts < 6) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
        const { data: updatedJob } = await supabase.from('jobs').select('status, completed_at').eq('id', job.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (updatedJob?.status === 'completed' && updatedJob?.completed_at) {
          acked = true;
          addTestResult({ step: '4. Aguardar ACK do Job', status: 'success', message: `Job confirmado apos ${attempts * 5}s`, data: updatedJob });
        }
      }
      if (!acked) throw new Error('Agent nao confirmou job apos 30s. Verifique os logs do agent.');

      addTestResult({ step: '5. Teste Completo', status: 'success', message: '[OK]  Fluxo completo funcionando corretamente!' });
      return { success: true };
    },
    onError: (error: Error) => {
      addTestResult({ step: 'Erro', status: 'error', message: error.message });
      toast({ title: 'Erro no Teste', description: error.message, variant: 'destructive' });
    },
    onSuccess: () => {
      toast({ title: 'Teste Completo', description: 'Fluxo de integracao validado com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  return {
    agents, testResults, selectedAgent, setSelectedAgent,
    cleanupMutation, runIntegrationTest,
  };
}
