import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export const useAgentReleases = () => {
  const queryClient = useQueryClient();

  // SECURITY: Use agent_releases_public view (Phase 3 hardening - column privileges block script_content)
  const { data: releases = [], isLoading, error, refetch } = useQuery({
    queryKey: ['agent-releases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_releases_public')
        .select('id, version, platform, channel, sha256, release_notes, is_active, created_at')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 600_000, // COST-OPT v8: 2min → 10min (releases rarely change)
    refetchOnWindowFocus: true,
    staleTime: 300_000,
    refetchIntervalInBackground: false,
  });

  const registerRelease = useMutation({
    mutationFn: async ({
      version,
      platform,
      script_content,
      release_notes,
      channel = 'stable',
      manual_sha256,
      // SSA-004: Assinatura Ed25519 opcional (auto-gerada no backend se não fornecida)
      signature_base64,
      signed_by,
    }: {
      version: string;
      platform: string;
      script_content: string;
      release_notes?: string;
      channel?: string;
      manual_sha256?: string;
      signature_base64?: string;
      signed_by?: string;
    }) => {
      // Normalize script content for Windows (same logic as serve-agent-update)
      // This ensures SHA256 in database matches what agents receive
      const normalizeForWindows = (content: string): string => {
        return content
          .replace(/\r\n/g, '\n')   // Normalize all to LF first
          .replace(/\r/g, '\n')     // Handle standalone CR
          .replace(/\n/g, '\r\n');  // Convert to Windows CRLF
      };

      // Use manual SHA256 if provided (for backwards compatibility)
      // Otherwise calculate SHA256 from NORMALIZED content (standard for v3.10.12+ agents)
      let sha256: string;
      if (manual_sha256) {
        sha256 = manual_sha256;
        logger.debug('[useAgentReleases] Using manual SHA256', { sha256: sha256.substring(0, 16) });
      } else {
        // Normalize content for Windows platform before calculating SHA256
        const normalizedContent = platform === 'windows' 
          ? normalizeForWindows(script_content) 
          : script_content;
        
        const encoder = new TextEncoder();
        const contentBytes = encoder.encode(normalizedContent);
        const hashBuffer = await crypto.subtle.digest('SHA-256', contentBytes);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        logger.debug('[useAgentReleases] Calculated SHA256 from normalized content', { sha256: sha256.substring(0, 16) });
      }

      logger.debug('[useAgentReleases] Registering release', {
        platform,
        version,
        hasSignature: !!signature_base64,
        signedBy: signed_by || 'automation (backend)'
      });

      // Call register-agent-release Edge Function
      // SSA-004: Backend auto-signs if ED25519_PRIVATE_KEY is configured
      const { data: result, error } = await supabase.functions.invoke('register-agent-release', {
        body: {
          version,
          platform,
          script_content,
          sha256,
          manual_sha256,
          release_notes,
          channel,
          // SSA-004: Pass signature if provided, otherwise backend auto-signs
          signature_base64,
          signed_by,
        },
      });

      if (error) throw error;
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agent-releases'] });
      const signatureStatus = data?.signature_present 
        ? `(assinada por ${data.signed_by})` 
        : '(sem assinatura)';
      toast.success(`Release registrada com sucesso ${signatureStatus}`);
    },
    onError: (error) => {
      logger.error('Error registering release:', error);
      toast.error(`Erro ao registrar release: ${error.message || 'Unknown error'}`);
    },
  });

  return {
    releases,
    isLoading,
    error,
    refetch,
    registerRelease: registerRelease.mutate,
    isRegistering: registerRelease.isPending,
  };
};
