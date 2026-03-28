import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, tenantId, requestId } = ctx;

  // Get light mode config for this agent
  const { data: config } = await supabase
    .from('agent_light_mode_configs')
    .select('*')
    .eq('agent_id', agentId)
    .maybeSingle();

  if (!config) {
    // No config exists ? return defaults (normal mode)
    return {
      light_mode_active: false,
      collection_interval_seconds: 180,
      skip_process_collection: false,
      skip_network_collection: false,
      compress_payloads: false,
      aggregation: {
        enabled: true,
        window_seconds: 3,
        file_threshold: 50,
        process_threshold: 20,
        network_threshold: 100,
        max_buffer_size: 500,
      },
    };
  }

  // Check if light mode expired
  if (config.is_active && config.expires_at) {
    const expiresAt = new Date(config.expires_at);
    if (new Date() >= expiresAt) {
      // Deactivate expired light mode
      await supabase
        .from('agent_light_mode_configs')
        .update({
          is_active: false,
          activated_at: null,
          expires_at: null,
          reason: '',
          collection_interval_seconds: 180,
          skip_process_collection: false,
          skip_network_collection: false,
          compress_payloads: false,
          active_media_processes: [],
        })
        .eq('id', config.id);

      return {
        light_mode_active: false,
        collection_interval_seconds: 180,
        skip_process_collection: false,
        skip_network_collection: false,
        compress_payloads: false,
        light_mode_expired: true,
        aggregation: {
          enabled: true,
          window_seconds: 3,
          file_threshold: 50,
          process_threshold: 20,
          network_threshold: 100,
          max_buffer_size: 500,
        },
      };
    }
  }

  return {
    light_mode_active: config.is_active,
    collection_interval_seconds: config.collection_interval_seconds,
    skip_process_collection: config.skip_process_collection,
    skip_network_collection: config.skip_network_collection,
    compress_payloads: config.compress_payloads,
    light_mode_reason: config.reason || undefined,
    light_mode_expires_at: config.expires_at || undefined,
    active_media_processes: config.active_media_processes || [],
    remaining_minutes: config.expires_at
      ? Math.max(0, Math.ceil((new Date(config.expires_at).getTime() - Date.now()) / 60000))
      : 0,
    // v5.0.14: Edge Event Aggregation parameters
    aggregation: {
      enabled: config.aggregation_enabled ?? true,
      window_seconds: config.aggregation_window_seconds ?? 3,
      file_threshold: config.aggregation_file_threshold ?? 50,
      process_threshold: config.aggregation_process_threshold ?? 20,
      network_threshold: config.aggregation_network_threshold ?? 100,
      max_buffer_size: config.aggregation_max_buffer_size ?? 500,
    },
  };
});