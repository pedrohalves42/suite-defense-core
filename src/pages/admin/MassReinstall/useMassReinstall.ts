import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function useMassReinstall() {
  const [copiedScript, setCopiedScript] = useState<string | null>(null);
  const [enrollmentKey, setEnrollmentKey] = useState('');
  const { tenant } = useTenant();

  const { data: offlineAgents, isLoading, refetch } = useQuery({
    queryKey: ['offline-agents-for-reinstall', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data: rawData, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      if (error) throw error;
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      return ((rawData as unknown as Array<{ id: string; agent_name: string; hostname: string; agent_version: string; last_heartbeat: string | null; status: string }>) || [])
        .filter(a => !a.last_heartbeat || a.last_heartbeat < cutoff)
        .sort((a, b) => (a.agent_name || '').localeCompare(b.agent_name || ''));
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(type);
    toast.success('Copiado para a área de transferência');
    setTimeout(() => setCopiedScript(null), 2000);
  };

  const downloadScript = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Script ${filename} baixado`);
  };

  const getReinstallCommand = (key: string) => {
    if (!key.trim()) return '# Cole sua Enrollment Key acima para gerar o comando';
    return `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $sp="$env:TEMP\\cs-install-$(Get-Random).ps1"; Invoke-WebRequest -Uri "${SUPABASE_URL}/functions/v1/serve-installer/${key.trim()}?os_type=windows" -OutFile $sp -UseBasicParsing; & $sp; Remove-Item $sp -Force`;
  };

  const getFullCommand = (key: string) => {
    if (!key.trim()) return '# Cole sua Enrollment Key acima para gerar o comando';
    return `# Limpeza + Reinstalação em um único comando
Get-ScheduledTask -TaskName "CyberShield*" -EA 0 | Unregister-ScheduledTask -Confirm:$false -EA 0; Remove-Item "C:\\CyberShield" -Recurse -Force -EA 0; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $sp="$env:TEMP\\cs-install-$(Get-Random).ps1"; Invoke-WebRequest -Uri "${SUPABASE_URL}/functions/v1/serve-installer/${key.trim()}?os_type=windows" -OutFile $sp -UseBasicParsing; & $sp; Remove-Item $sp -Force`;
  };

  const formatLastHeartbeat = (lastHeartbeat: string | null) => {
    if (!lastHeartbeat) return 'Nunca conectou';
    const diffMs = Date.now() - new Date(lastHeartbeat).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays > 0) return `${diffDays}d atrás`;
    if (diffHours > 0) return `${diffHours}h atrás`;
    return `${diffMins}min atrás`;
  };

  return {
    offlineAgents, isLoading, refetch,
    copiedScript, enrollmentKey, setEnrollmentKey,
    copyToClipboard, downloadScript,
    getReinstallCommand, getFullCommand, formatLastHeartbeat,
  };
}
