import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlertPayload {
  alert_id?: string;
  tenant_id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  details?: Record<string, unknown>;
  agent_name?: string;
}

interface NotificationChannel {
  id: string;
  tenant_id: string;
  channel_type: 'whatsapp' | 'telegram' | 'email' | 'sms';
  name: string;
  config: Record<string, string>;
  is_verified: boolean;
  is_active: boolean;
}

interface NotificationPreference {
  id: string;
  channel_id: string;
  alert_types: string[];
  severity_filter: string[];
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_timezone: string;
  enabled: boolean;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // SECURITY: Validate internal function secret for internal-only endpoint
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const providedSecret = req.headers.get('X-Internal-Secret');

  if (!INTERNAL_SECRET || providedSecret !== INTERNAL_SECRET) {
    logger.warn('[dispatch-notification] Unauthorized access attempt', {
      hasSecret: !!providedSecret,
      secretMatch: providedSecret === INTERNAL_SECRET
    });
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload: AlertPayload = await req.json();
    logger.info('[dispatch-notification] Received alert', { 
      alert_type: payload.alert_type,
      severity: payload.severity,
      tenant_id: payload.tenant_id 
    });

    // Fetch active channels for tenant
    const { data: channels, error: channelsError } = await supabase
      .from('notification_channels')
      .select('*')
      .eq('tenant_id', payload.tenant_id)
      .eq('is_active', true)
      .eq('is_verified', true);

    if (channelsError) {
      logger.error('[dispatch-notification] Error fetching channels', channelsError);
      throw channelsError;
    }

    if (!channels || channels.length === 0) {
      logger.info('[dispatch-notification] No active channels for tenant', { tenant_id: payload.tenant_id });
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No notification channels configured',
        notifications_sent: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch preferences for each channel
    const channelIds = channels.map((c: NotificationChannel) => c.id);
    const { data: preferences, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('*')
      .in('channel_id', channelIds)
      .eq('enabled', true);

    if (prefsError) {
      logger.error('[dispatch-notification] Error fetching preferences', prefsError);
      throw prefsError;
    }

    const results: Array<{ channel: string; status: string; error?: string }> = [];

    for (const channel of channels as NotificationChannel[]) {
      const pref = preferences?.find((p: NotificationPreference) => p.channel_id === channel.id);
      
      // Check if this channel should receive this alert
      if (pref) {
        // Check severity filter
        if (!pref.severity_filter.includes(payload.severity)) {
          logger.info('[dispatch-notification] Skipping - severity not in filter', {
            channel_id: channel.id,
            severity: payload.severity,
            filter: pref.severity_filter
          });
          results.push({ channel: channel.name, status: 'skipped', error: 'Severity not in filter' });
          continue;
        }

        // Check alert type filter (if specified)
        if (pref.alert_types.length > 0 && !pref.alert_types.includes(payload.alert_type)) {
          logger.info('[dispatch-notification] Skipping - alert type not in filter', {
            channel_id: channel.id,
            alert_type: payload.alert_type,
            filter: pref.alert_types
          });
          results.push({ channel: channel.name, status: 'skipped', error: 'Alert type not in filter' });
          continue;
        }

        // Check quiet hours
        if (pref.quiet_hours_start && pref.quiet_hours_end) {
          const now = new Date();
          const tz = pref.quiet_hours_timezone || 'America/Sao_Paulo';
          const timeStr = now.toLocaleTimeString('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' });
          
          if (timeStr >= pref.quiet_hours_start && timeStr <= pref.quiet_hours_end) {
            logger.info('[dispatch-notification] Skipping - quiet hours active', {
              channel_id: channel.id,
              current_time: timeStr,
              quiet_start: pref.quiet_hours_start,
              quiet_end: pref.quiet_hours_end
            });
            results.push({ channel: channel.name, status: 'skipped', error: 'Quiet hours active' });
            continue;
          }
        }
      }

      // Dispatch to appropriate channel
      try {
        let recipient = '';
        let functionName = '';

        switch (channel.channel_type) {
          case 'whatsapp':
            functionName = 'send-whatsapp-notification';
            recipient = channel.config.phone || '';
            break;
          case 'telegram':
            functionName = 'send-telegram-notification';
            recipient = channel.config.chat_id || '';
            break;
          case 'email':
            functionName = 'send-email-notification';
            recipient = channel.config.email || '';
            break;
          case 'sms':
            // SMS not implemented yet
            results.push({ channel: channel.name, status: 'skipped', error: 'SMS not implemented' });
            continue;
        }

        // Call the specific notification function
        const { error: invokeError } = await supabase.functions.invoke(functionName, {
          body: {
            channel_id: channel.id,
            tenant_id: payload.tenant_id,
            alert_id: payload.alert_id,
            recipient,
            config: channel.config,
            alert: {
              type: payload.alert_type,
              severity: payload.severity,
              title: payload.title,
              message: payload.message,
              details: payload.details,
              agent_name: payload.agent_name
            }
          }
        });

        if (invokeError) {
          logger.error('[dispatch-notification] Error invoking function', { 
            function: functionName, 
            error: invokeError 
          });
          results.push({ channel: channel.name, status: 'failed', error: invokeError.message });
        } else {
          results.push({ channel: channel.name, status: 'sent' });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        logger.error('[dispatch-notification] Exception sending notification', { 
          channel: channel.name, 
          error: errorMsg 
        });
        results.push({ channel: channel.name, status: 'failed', error: errorMsg });
      }
    }

    const sentCount = results.filter(r => r.status === 'sent').length;
    logger.info('[dispatch-notification] Completed', { 
      total_channels: channels.length,
      sent: sentCount,
      results 
    });

    return new Response(JSON.stringify({ 
      success: true,
      notifications_sent: sentCount,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[dispatch-notification] Fatal error', { error: errorMsg });
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
