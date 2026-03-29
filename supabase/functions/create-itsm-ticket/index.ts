import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

interface CreateTicketRequest {
  integration_id: string;
  summary: string;
  description?: string;
  priority?: string;
  source_type: 'alert' | 'vulnerability' | 'remediation' | 'compliance' | 'manual';
  source_id?: string;
  agent_id?: string;
  agent_name?: string;
}

// ?? Jira API ??
async function createJiraTicket(
  integration: Record<string, unknown>,
  ticket: CreateTicketRequest
): Promise<{ id: string; key: string; url: string }> {
  const creds = integration.credentials_encrypted as Record<string, string>;
  const baseUrl = (integration.base_url as string).replace(/\/$/, '');
  const projectKey = integration.project_key as string;
  const issueType = integration.default_issue_type as string || 'Task';
  const jiraPriority = mapPriorityToJira(ticket.priority || integration.default_priority as string || 'Medium');

  const body = {
    fields: {
      project: { key: projectKey },
      summary: ticket.summary,
      description: {
        type: 'doc',
        version: 1,
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: ticket.description || ticket.summary }]
        }]
      },
      issuetype: { name: issueType },
      priority: { name: jiraPriority },
      labels: ['cybershield', `source-${ticket.source_type}`],
    }
  };

  const auth = btoa(`${creds.email}:${creds.api_token}`);
  const response = await fetchWithTimeout(`${baseUrl}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Jira API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return { id: data.id, key: data.key, url: `${baseUrl}/browse/${data.key}` };
}

// ?? ServiceNow API ??
async function createServiceNowTicket(
  integration: Record<string, unknown>,
  ticket: CreateTicketRequest
): Promise<{ id: string; key: string; url: string }> {
  const creds = integration.credentials_encrypted as Record<string, string>;
  const baseUrl = (integration.base_url as string).replace(/\/$/, '');
  const snPriority = mapPriorityToServiceNow(ticket.priority || integration.default_priority as string || 'Medium');

  const body = {
    short_description: ticket.summary,
    description: ticket.description || ticket.summary,
    priority: snPriority,
    category: 'Security',
    subcategory: ticket.source_type,
    impact: snPriority <= 2 ? '1' : '2',
    urgency: snPriority <= 2 ? '1' : '2',
  };

  const auth = btoa(`${creds.username}:${creds.password}`);
  const response = await fetchWithTimeout(`${baseUrl}/api/now/table/incident`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ServiceNow API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const sysId = data.result?.sys_id;
  const number = data.result?.number;
  return { id: sysId, key: number, url: `${baseUrl}/nav_to.do?uri=incident.do?sys_id=${sysId}` };
}

function mapPriorityToJira(priority: string): string {
  const map: Record<string, string> = {
    critical: 'Highest', high: 'High', medium: 'Medium', low: 'Low', info: 'Lowest'
  };
  return map[priority.toLowerCase()] || 'Medium';
}

function mapPriorityToServiceNow(priority: string): number {
  const map: Record<string, number> = {
    critical: 1, high: 2, medium: 3, low: 4, info: 5
  };
  return map[priority.toLowerCase()] || 3;
}

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, userId, requestId, body } = ctx;

  const ticketBody: CreateTicketRequest = body;

  if (!ticketBody.integration_id || !ticketBody.summary || !ticketBody.source_type) {
    return new Response(
      JSON.stringify({ error: 'integration_id, summary, and source_type are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get integration
  const { data: integration, error: intErr } = await supabase
    .from('itsm_integrations')
    .select('*')
    .eq('id', ticketBody.integration_id)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .single();

  if (intErr || !integration) {
    return new Response(
      JSON.stringify({ error: 'Integration not found or inactive' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create ticket based on provider
  let result: { id: string; key: string; url: string };

  if (integration.provider === 'jira') {
    result = await createJiraTicket(integration as Record<string, unknown>, ticketBody);
  } else if (integration.provider === 'servicenow') {
    result = await createServiceNowTicket(integration as Record<string, unknown>, ticketBody);
  } else {
    return new Response(
      JSON.stringify({ error: `Unknown provider: ${integration.provider}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Save ticket record
  const { data: ticket, error: ticketErr } = await supabase
    .from('itsm_tickets')
    .insert({
      tenant_id: tenantId,
      integration_id: ticketBody.integration_id,
      external_ticket_id: result.id,
      external_ticket_key: result.key,
      external_ticket_url: result.url,
      provider: integration.provider,
      source_type: ticketBody.source_type,
      source_id: ticketBody.source_id || null,
      summary: ticketBody.summary,
      description: ticketBody.description,
      priority: ticketBody.priority || integration.default_priority,
      status: 'open',
      agent_id: ticketBody.agent_id || null,
      agent_name: ticketBody.agent_name || null,
      created_by: userId,
    })
    .select('id')
    .single();

  if (ticketErr) {
    logger.error(`[create-itsm-ticket][${requestId}] Failed to save ticket record:`, ticketErr);
  }

  return {
    success: true,
    ticket_id: ticket?.id,
    external_key: result.key,
    external_url: result.url,
    provider: integration.provider,
  };
}, { methods: ['POST'] });
