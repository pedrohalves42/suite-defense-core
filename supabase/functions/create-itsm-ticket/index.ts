import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { handleException } from '../_shared/error-handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

// ── Jira API ──
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
  const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
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
  return {
    id: data.id,
    key: data.key,
    url: `${baseUrl}/browse/${data.key}`,
  };
}

// ── ServiceNow API ──
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
  const response = await fetch(`${baseUrl}/api/now/table/incident`, {
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

  return {
    id: sysId,
    key: number,
    url: `${baseUrl}/nav_to.do?uri=incident.do?sys_id=${sysId}`,
  };
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: role } = await supabase
      .from('user_roles').select('tenant_id').eq('user_id', user.id).limit(1).maybeSingle();
    const tenantId = role?.tenant_id;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'No tenant' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: CreateTicketRequest = await req.json();

    if (!body.integration_id || !body.summary || !body.source_type) {
      return new Response(JSON.stringify({ error: 'integration_id, summary, and source_type are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get integration
    const { data: integration, error: intErr } = await supabase
      .from('itsm_integrations')
      .select('*')
      .eq('id', body.integration_id)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .single();

    if (intErr || !integration) {
      return new Response(JSON.stringify({ error: 'Integration not found or inactive' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create ticket based on provider
    let result: { id: string; key: string; url: string };

    if (integration.provider === 'jira') {
      result = await createJiraTicket(integration as Record<string, unknown>, body);
    } else if (integration.provider === 'servicenow') {
      result = await createServiceNowTicket(integration as Record<string, unknown>, body);
    } else {
      return new Response(JSON.stringify({ error: `Unknown provider: ${integration.provider}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Save ticket record
    const { data: ticket, error: ticketErr } = await supabase
      .from('itsm_tickets')
      .insert({
        tenant_id: tenantId,
        integration_id: body.integration_id,
        external_ticket_id: result.id,
        external_ticket_key: result.key,
        external_ticket_url: result.url,
        provider: integration.provider,
        source_type: body.source_type,
        source_id: body.source_id || null,
        summary: body.summary,
        description: body.description,
        priority: body.priority || integration.default_priority,
        status: 'open',
        agent_id: body.agent_id || null,
        agent_name: body.agent_name || null,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (ticketErr) {
      console.error('Failed to save ticket record:', ticketErr);
    }

    return new Response(JSON.stringify({
      success: true,
      ticket_id: ticket?.id,
      external_key: result.key,
      external_url: result.url,
      provider: integration.provider,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return handleException(error, requestId, 'create-itsm-ticket');
  }
});
