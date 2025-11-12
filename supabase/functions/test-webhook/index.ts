import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/error-handler.ts';
import { createAuditLog } from '../_shared/audit.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Autenticação necessária' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (roleError || !userRole || userRole.role !== 'admin') {
      await createAuditLog({
        supabase,
        userId: user.id,
        action: 'test_webhook',
        resourceType: 'integration',
        details: { error: 'Unauthorized' },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ error: 'Acesso negado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get tenant settings to retrieve webhook URL
    const { data: settings, error: settingsError } = await supabase
      .from('tenant_settings')
      .select('alert_webhook_url, enable_webhook_alerts')
      .eq('tenant_id', userRole.tenant_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (settingsError || !settings) {
      await createAuditLog({
        supabase,
        userId: user.id,
        action: 'test_webhook',
        resourceType: 'integration',
        details: { error: 'Settings not found' },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Configurações não encontradas',
          message: 'Configure o webhook URL antes de testar'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!settings.alert_webhook_url) {
      await createAuditLog({
        supabase,
        userId: user.id,
        action: 'test_webhook',
        resourceType: 'integration',
        details: { error: 'Webhook URL not configured' },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Webhook URL não configurado',
          message: 'Configure o webhook URL nas configurações de alertas'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare ping payload
    const pingPayload = {
      type: 'ping',
      message: 'CyberShield webhook test',
      timestamp: new Date().toISOString(),
      tenant_id: userRole.tenant_id,
      test: true
    };

    // Test webhook with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const webhookResponse = await fetch(settings.alert_webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'CyberShield-Webhook-Test/1.0',
        },
        body: JSON.stringify(pingPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await webhookResponse.text();
      let responseBody;
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = responseText;
      }

      const isSuccess = webhookResponse.ok;

      await createAuditLog({
        supabase,
        userId: user.id,
        action: 'test_webhook',
        resourceType: 'integration',
        details: { 
          success: isSuccess,
          webhook_url: settings.alert_webhook_url,
          status_code: webhookResponse.status,
          response_body: responseBody
        },
        request: req,
        success: true,
      });

      if (!isSuccess) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Webhook retornou erro',
            message: `Status HTTP ${webhookResponse.status}: ${webhookResponse.statusText}`,
            details: {
              statusCode: webhookResponse.status,
              statusText: webhookResponse.statusText,
              responseBody: responseBody,
              url: settings.alert_webhook_url
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Webhook respondeu com sucesso ao ping',
          details: {
            statusCode: webhookResponse.status,
            statusText: webhookResponse.statusText,
            responseBody: responseBody,
            url: settings.alert_webhook_url,
            enabled: settings.enable_webhook_alerts
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error) {
      clearTimeout(timeoutId);
      
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      const isTimeout = errorMessage.includes('abort');

      await createAuditLog({
        supabase,
        userId: user.id,
        action: 'test_webhook',
        resourceType: 'integration',
        details: { 
          error: errorMessage,
          webhook_url: settings.alert_webhook_url,
          timeout: isTimeout
        },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: isTimeout ? 'Timeout ao conectar com webhook' : 'Erro ao conectar com webhook',
          message: isTimeout 
            ? 'O webhook não respondeu em 10 segundos. Verifique se a URL está correta e acessível.'
            : `Erro: ${errorMessage}`,
          details: {
            url: settings.alert_webhook_url,
            error: errorMessage
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error testing webhook:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Erro ao testar webhook',
        message: error instanceof Error ? error.message : 'Erro desconhecido'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});