import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { realtimeChannelManager } from '@/lib/realtime-manager';

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
  tenantId?: string; // F-003: Tenant Isolation
  onStatusChange: (status: BuildStatus) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook para monitorar status de build via Realtime
 * Reutiliza canais via RealtimeChannelManager
 */
export function useBuildRealtime({ buildId, tenantId, onStatusChange, onError }: UseBuildRealtimeOptions) {
  const instanceId = useRef(`build-${Math.random().toString(36).substring(2, 9)}`).current;

  useEffect(() => {
    if (!buildId) return;

    logger.info('[useBuildRealtime] Subscribing via manager', { buildId, instanceId });

    realtimeChannelManager.subscribe(
      instanceId,
      'agent_builds',
      `id=eq.${buildId}`,
      (payload) => {
        if (payload.eventType !== 'UPDATE') return;
        
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
      },
      'public',
      tenantId
    );

    return () => {
      logger.info('[useBuildRealtime] Unsubscribing via manager', { buildId, instanceId });
      realtimeChannelManager.unsubscribe(instanceId, 'agent_builds', `id=eq.${buildId}`, 'public', tenantId);
    };
  }, [buildId, onStatusChange, instanceId]);

  const cleanup = useCallback(() => {
    if (buildId) {
      realtimeChannelManager.unsubscribe(instanceId, 'agent_builds', `id=eq.${buildId}`, 'public', tenantId);
    }
  }, [instanceId, buildId]);

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
