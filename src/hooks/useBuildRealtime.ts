import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface BuildStatus {
  build_status: 'pending' | 'building' | 'completed' | 'failed';
  download_url: string | null;
  sha256_hash: string | null;
  file_size_bytes: number | null;
  error_message: string | null;
  build_duration_seconds: number | null;
  github_run_url: string | null;
}

interface UseBuildRealtimeOptions {
  buildId: string | null;
  onStatusChange: (status: BuildStatus) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook para monitorar status de build via Realtime
 * Substitui polling por subscription push-based
 */
export function useBuildRealtime({ buildId, onStatusChange, onError }: UseBuildRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isSubscribedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      logger.info('[useBuildRealtime] Cleaning up subscription', { buildId });
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      isSubscribedRef.current = false;
    }
  }, [buildId]);

  useEffect(() => {
    if (!buildId) {
      cleanup();
      return;
    }

    // Evitar subscription duplicada
    if (isSubscribedRef.current && channelRef.current) {
      return;
    }

    logger.info('[useBuildRealtime] Setting up Realtime subscription', { buildId });

    const channel = supabase
      .channel(`build-status-${buildId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agent_builds',
          filter: `id=eq.${buildId}`
        },
        (payload) => {
          const newData = payload.new as BuildStatus & { id: string };
          
          logger.info('[useBuildRealtime] Received update', {
            buildId,
            status: newData.build_status,
            hasDownloadUrl: !!newData.download_url
          });

          onStatusChange({
            build_status: newData.build_status,
            download_url: newData.download_url,
            sha256_hash: newData.sha256_hash,
            file_size_bytes: newData.file_size_bytes,
            error_message: newData.error_message,
            build_duration_seconds: newData.build_duration_seconds,
            github_run_url: newData.github_run_url
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          logger.info('[useBuildRealtime] Successfully subscribed', { buildId });
          isSubscribedRef.current = true;
        } else if (status === 'CHANNEL_ERROR') {
          logger.error('[useBuildRealtime] Subscription error', { buildId });
          onError?.(new Error('Falha na conexão Realtime'));
          isSubscribedRef.current = false;
        } else if (status === 'TIMED_OUT') {
          logger.warn('[useBuildRealtime] Subscription timeout', { buildId });
          onError?.(new Error('Timeout na conexão Realtime'));
          isSubscribedRef.current = false;
        }
      });

    channelRef.current = channel;

    return cleanup;
  }, [buildId, onStatusChange, onError, cleanup]);

  // Função para fetch manual (fallback)
  const fetchStatus = useCallback(async (): Promise<BuildStatus | null> => {
    if (!buildId) return null;

    try {
      const { data, error } = await supabase
        .from('agent_builds')
        .select('build_status, download_url, sha256_hash, file_size_bytes, error_message, build_duration_seconds, github_run_url')
        .eq('id', buildId)
        .single();

      if (error) {
        logger.error('[useBuildRealtime] Fetch error', error);
        return null;
      }

      return data as BuildStatus;
    } catch (err) {
      logger.error('[useBuildRealtime] Fetch exception', err);
      return null;
    }
  }, [buildId]);

  return { fetchStatus, cleanup };
}
