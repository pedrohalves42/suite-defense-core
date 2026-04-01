import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Platform } from '../types';

export function useAgentConfig() {
  const [searchParams] = useSearchParams();
  const [agentName, setAgentName] = useState('');
  const [platform, setPlatform] = useState<Platform>('windows');
  const [agentNameError, setAgentNameError] = useState('');
  const [isCheckingName, setIsCheckingName] = useState(false);

  // Detect URL params (regenerated credentials)
  useEffect(() => {
    const agentNameFromUrl = searchParams.get('agent_name');
    const isRegenerated = searchParams.get('regenerated') === 'true';
    if (agentNameFromUrl) setAgentName(agentNameFromUrl);
    if (agentNameFromUrl && isRegenerated) {
      toast.info(
        `? Agente "${agentNameFromUrl}" teve credenciais regeneradas. O instalador antigo NAO funciona mais. Gere um novo abaixo.`,
        { duration: 8000 }
      );
    }
  }, [searchParams]);

  // Agent name validation
  useEffect(() => {
    if (!agentName) { setAgentNameError(''); return; }

    const invalidChars = /[^a-zA-Z0-9\-_]/;
    if (invalidChars.test(agentName)) { setAgentNameError('[ERROR]  Use apenas letras, numeros, hifens e underscores'); return; }
    if (agentName.length < 3) { setAgentNameError('[ERROR]  Nome deve ter pelo menos 3 caracteres'); return; }
    if (agentName.length > 50) { setAgentNameError('[ERROR]  Maximo de 50 caracteres'); return; }

    const abortController = new AbortController();
    let isMounted = true;

    const timer = setTimeout(async () => {
      if (!isMounted) return;
      setIsCheckingName(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const checkNameWithRetry = async (retries = 2): Promise<void> => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            if (isMounted) { setAgentNameError('[ERROR]  Sessao expirada.'); setIsCheckingName(false); }
            return;
          }
          if (abortController.signal.aborted || !isMounted) return;

          const { data, error } = await supabase.functions.invoke('check-agent-name-availability', {
            body: { agentName },
            headers: { Authorization: `Bearer ${session.access_token}` },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (abortController.signal.aborted || !isMounted) return;
          if (error) throw error;
          if (isMounted) {
            setAgentNameError(!data.available ? `[ERROR]  ${data.reason || 'Nome indisponivel'}` : '[OK]  Nome disponivel');
          }
        } catch (err) {
          const error = err as Error & { name?: string };
          if (error.name === 'AbortError') {
            if (isMounted) setAgentNameError('?? Timeout - tente novamente');
          } else if (retries > 0) {
            await new Promise(r => setTimeout(r, 1000 * (3 - retries)));
            return checkNameWithRetry(retries - 1);
          } else {
            if (abortController.signal.aborted || !isMounted) return;
            if (isMounted) setAgentNameError('[ERROR]  Erro ao validar - verifique sua conexao');
          }
        } finally {
          if (isMounted) setIsCheckingName(false);
        }
      };

      await checkNameWithRetry();
    }, 800);

    return () => { isMounted = false; abortController.abort(); clearTimeout(timer); };
  }, [agentName]);

  const isNameValid = agentName.length >= 3 && agentName.length <= 50 && !/[^a-zA-Z0-9\-_]/.test(agentName) && !agentNameError.startsWith('[ERROR] ');

  return {
    searchParams,
    agentName, setAgentName,
    platform, setPlatform,
    agentNameError,
    isCheckingName,
    isNameValid,
  };
}
