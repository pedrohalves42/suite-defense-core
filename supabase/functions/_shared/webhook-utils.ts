/**
 * Webhook Alert Utilities for CyberShield
 * Supports Slack, Microsoft Teams, and generic JSON webhooks
 */

export interface WebhookPayload {
  tenantId: string;
  alertType: 'agent_offline' | 'agent_online' | 'jobs_failed' | 'test';
  agentName?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Detects webhook provider from URL
 */
export function detectWebhookProvider(url: string): 'slack' | 'teams' | 'generic' {
  if (url.includes('hooks.slack.com')) return 'slack';
  if (url.includes('webhook.office.com') || url.includes('outlook.office.com')) return 'teams';
  return 'generic';
}

/**
 * Formats payload for Slack webhook
 */
function formatSlackPayload(payload: WebhookPayload): Record<string, unknown> {
  const emoji = payload.alertType === 'agent_offline' ? '?' : 
                payload.alertType === 'agent_online' ? '?' : 
                payload.alertType === 'jobs_failed' ? '[ERROR] ' : '?';
  
  const title = payload.alertType === 'agent_offline' ? `Agent Offline: ${payload.agentName}` :
                payload.alertType === 'agent_online' ? `Agent Online: ${payload.agentName}` :
                payload.alertType === 'jobs_failed' ? `Jobs Failed` :
                'CyberShield Alert';

  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} ${title}`,
        emoji: true
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Time:*\n${payload.timestamp}`
        },
        {
          type: "mrkdwn", 
          text: `*Type:*\n${payload.alertType.replace('_', ' ').toUpperCase()}`
        }
      ]
    }
  ];

  // Add data fields
  if (payload.data) {
    const dataFields: Array<Record<string, unknown>> = [];
    
    if (payload.data.minutesOffline) {
      dataFields.push({
        type: "mrkdwn",
        text: `*Offline Duration:*\n${payload.data.minutesOffline} minutes`
      });
    }
    
    if (payload.data.lastHeartbeat) {
      dataFields.push({
        type: "mrkdwn",
        text: `*Last Heartbeat:*\n${payload.data.lastHeartbeat}`
      });
    }

    if (payload.data.failedCount) {
      dataFields.push({
        type: "mrkdwn",
        text: `*Failed Jobs:*\n${payload.data.failedCount}`
      });
    }

    if (dataFields.length > 0) {
      blocks.push({
        type: "section",
        fields: dataFields
      });
    }
  }

  return {
    text: `${emoji} ${title}`,
    blocks
  };
}

/**
 * Formats payload for Microsoft Teams webhook (Adaptive Card format)
 */
function formatTeamsPayload(payload: WebhookPayload): Record<string, unknown> {
  const themeColor = payload.alertType === 'agent_offline' ? 'd73a49' : 
                     payload.alertType === 'agent_online' ? '28a745' : 
                     payload.alertType === 'jobs_failed' ? 'dc3545' : '0078d4';

  const title = payload.alertType === 'agent_offline' ? `? Agent Offline: ${payload.agentName}` :
                payload.alertType === 'agent_online' ? `? Agent Online: ${payload.agentName}` :
                payload.alertType === 'jobs_failed' ? `[ERROR]  Jobs Failed` :
                '? CyberShield Alert';

  const facts: Array<Record<string, string>> = [
    { name: "Time", value: payload.timestamp },
    { name: "Alert Type", value: payload.alertType.replace('_', ' ').toUpperCase() }
  ];

  if (payload.data) {
    if (payload.data.minutesOffline) {
      facts.push({ name: "Offline Duration", value: `${payload.data.minutesOffline} minutes` });
    }
    if (payload.data.lastHeartbeat) {
      facts.push({ name: "Last Heartbeat", value: String(payload.data.lastHeartbeat) });
    }
    if (payload.data.failedCount) {
      facts.push({ name: "Failed Jobs", value: String(payload.data.failedCount) });
    }
  }

  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor,
    summary: title,
    sections: [
      {
        activityTitle: title,
        activitySubtitle: `Tenant: ${payload.tenantId}`,
        facts,
        markdown: true
      }
    ]
  };
}

/**
 * Formats payload for generic JSON webhook
 */
function formatGenericPayload(payload: WebhookPayload): Record<string, unknown> {
  return {
    source: 'cybershield',
    version: '1.0',
    tenant_id: payload.tenantId,
    alert_type: payload.alertType,
    agent_name: payload.agentName,
    timestamp: payload.timestamp,
    data: payload.data || {}
  };
}

/**
 * Sends a webhook alert to the configured URL
 * Automatically detects provider and formats payload accordingly
 */
export async function sendWebhookAlert(
  webhookUrl: string,
  payload: WebhookPayload,
  timeoutMs: number = 10000
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const provider = detectWebhookProvider(webhookUrl);
  
  let formattedPayload: Record<string, unknown>;
  switch (provider) {
    case 'slack':
      formattedPayload = formatSlackPayload(payload);
      break;
    case 'teams':
      formattedPayload = formatTeamsPayload(payload);
      break;
    default:
      formattedPayload = formatGenericPayload(payload);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CyberShield-Webhook/1.0'
      },
      body: JSON.stringify(formattedPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { success: true, statusCode: response.status };
    } else {
      return { 
        success: false, 
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    return {
      success: false,
      error: isTimeout ? 'Request timeout' : (error instanceof Error ? error.message : 'Unknown error')
    };
  }
}
