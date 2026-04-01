import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { RpcAgentRow } from '@/types/rpc';
import { logger } from '@/lib/logger';
import { useAuth } from '@/hooks/useAuth';

export function useClientOnboarding() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [agentCount, setAgentCount] = useState(0);
  const [hasOnlineAgent, setHasOnlineAgent] = useState(false);
  const [activeSection, setActiveSection] = useState('intro');

  useEffect(() => {
    if (user) fetchAgentStats();
  }, [user]);

  const fetchAgentStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: role } = await supabase
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!role?.tenant_id) return;

      const { data: agents } = await supabase.rpc('get_agents_list', {
        p_tenant_id: role.tenant_id,
        p_include_archived: false,
      });

      const agentsList = (agents || []) as unknown as RpcAgentRow[];
      setAgentCount(agentsList.length);
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      setHasOnlineAgent(agentsList.some((a) => a.last_heartbeat && a.last_heartbeat > cutoff));
    } catch (error) {
      logger.error('Error fetching agent stats:', error);
    }
  };

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: 'Comando copiado!',
      description: 'Cole no PowerShell como Administrador',
    });
  };

  const onboardingProgress = () => {
    let progress = 0;
    if (user) progress += 25;
    if (agentCount > 0) progress += 50;
    if (hasOnlineAgent) progress += 25;
    return progress;
  };

  return {
    navigate,
    user,
    copied,
    agentCount,
    hasOnlineAgent,
    activeSection,
    setActiveSection,
    copyCommand,
    onboardingProgress,
  };
}
