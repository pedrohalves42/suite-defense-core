/**
 * Light Mode evaluation — reduces collection during media streaming.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

interface LightModeResult {
  activated?: boolean;
  deactivated?: boolean;
  media?: string[];
  duration?: number;
  reason?: string;
}

const MEDIA_PROCESSES = ['chrome', 'firefox', 'msedge', 'vlc', 'obs64', 'obs', 'teams', 'zoom', 'discord', 'spotify'];

export async function evaluateLightMode(
  supabase: SupabaseClient,
  agentId: string,
  agentName: string,
  tenantId: string,
  cpuPercent: number,
  networkBytesTotal: number,
): Promise<LightModeResult | null> {
  try {
    const { data: latestProcesses } = await supabase
      .from('agent_processes')
      .select('processes')
      .eq('agent_id', agentId)
      .order('collected_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestProcesses?.processes) return null;

    const processNames = (latestProcesses.processes as Array<Record<string, unknown>>).map((p) => (p.name as string) || '');
    const networkMbps = networkBytesTotal / (1024 * 1024);
    const normalizedActive = new Set(processNames.map(n => n.toLowerCase().replace('.exe', '')));
    const detectedMedia = MEDIA_PROCESSES.filter(mp => normalizedActive.has(mp));

    const { data: existingConfig } = await supabase
      .from('agent_light_mode_configs')
      .select('*')
      .eq('agent_id', agentId)
      .maybeSingle();

    if (detectedMedia.length > 0 && cpuPercent > 50 && networkMbps > 10) {
      if (!existingConfig?.is_active) {
        const configData = {
          agent_id: agentId,
          tenant_id: tenantId,
          is_active: true,
          activated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          reason: 'media_streaming_detected',
          collection_interval_seconds: 600,
          skip_process_collection: true,
          skip_network_collection: true,
          compress_payloads: true,
          active_media_processes: detectedMedia,
        };

        if (existingConfig) {
          await supabase.from('agent_light_mode_configs').update(configData).eq('id', existingConfig.id);
        } else {
          await supabase.from('agent_light_mode_configs').insert(configData);
        }

        logger.info(`[Light Mode] Activated for ${agentName}: ${detectedMedia.join(', ')}`);
        return { activated: true, media: detectedMedia, duration: 15 };
      }
    } else if (existingConfig?.is_active) {
      if (existingConfig.expires_at && new Date() >= new Date(existingConfig.expires_at)) {
        await supabase.from('agent_light_mode_configs').update({
          is_active: false,
          activated_at: null,
          expires_at: null,
          reason: '',
          collection_interval_seconds: 60,
          skip_process_collection: false,
          skip_network_collection: false,
          compress_payloads: false,
          active_media_processes: [],
        }).eq('id', existingConfig.id);

        logger.info(`[Light Mode] Deactivated for ${agentName}: expired`);
        return { deactivated: true, reason: 'expired' };
      }
    }

    return null;
  } catch (lightModeError) {
    logger.warn('[Light Mode] Evaluation failed (non-blocking)', lightModeError);
    return null;
  }
}
