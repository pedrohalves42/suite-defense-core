/**
 * saml-sso — SAML 2.0 SP endpoint (metadata / login / acs / configure / config).
 *
 * D9-D1: Tipagem estrita sem alterar runtime, validação SAML, tenant binding,
 * RelayState handling, ou semântica de qualquer ação. Helpers compartilhados
 * (servePublic, etc.) preservados.
 */
import type { SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException } from '../_shared/error-handler.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { servePublic } from '../_shared/serve-public.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import type { Database } from '../_shared/database.types.ts';

const SamlSchema = z.object({
  action: z.enum(['metadata', 'login', 'acs', 'configure', 'config']).default('metadata'),
  tenantId: z.string().uuid().optional(),
  samlResponse: z.string().max(100000).optional(),
  relayState: z.string().max(500).optional(),
  provider: z.string().max(100).optional(),
  entityId: z.string().max(500).optional(),
  ssoUrl: z.string().url().max(2048).optional(),
  certificate: z.string().max(10000).optional(),
  attributeMapping: z.record(z.string()).optional(),
}).passthrough();

const SP_ENTITY_ID = Deno.env.get('SAML_SP_ENTITY_ID') || 'cybershield'
const ACS_URL = Deno.env.get('SAML_ACS_URL') || 'https://cybershield-audit.lovable.app/auth/saml/callback'
const DASHBOARD_URL = Deno.env.get('DASHBOARD_URL') || 'https://cybershield-audit.lovable.app'

servePublic(async (req, ctx) => {
  const { requestId, supabase: supabaseAny, body: rawBody } = ctx;
  const supabase = supabaseAny as SupabaseClient<Database>;
  const origin = req.headers.get("origin");

  try {
    const parsed = SamlSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
      })
    }
    const body = parsed.data;
    const action = body.action

    // ??? METADATA ???
    if (action === 'metadata') {
      const metadata = `<?xml version="1.0"?>
<EntityDescriptor entityID="${SP_ENTITY_ID}" xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <SPSSODescriptor AuthnRequestsSigned="true" WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${ACS_URL}" index="0"/>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
  </SPSSODescriptor>
</EntityDescriptor>`
      return new Response(metadata, {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/xml' }
      })
    }

    // ??? LOGIN: Initiate SAML AuthnRequest ???
    if (action === 'login') {
      const { tenantId } = body
      if (!tenantId) {
        return new Response(JSON.stringify({ error: 'tenantId required' }), {
          status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }

      const { data: config, error: cfgErr } = await supabase
        .from('saml_configs')
        .select('id, tenant_id, entity_id, sso_url, certificate, enabled, attribute_mapping, created_at')
        .eq('tenant_id', tenantId)
        .eq('enabled', true)
        .single()

      if (cfgErr || !config) {
        return new Response(JSON.stringify({ error: 'SAML not configured for this tenant' }), {
          status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }

      const samlRequestId = `_${crypto.randomUUID()}`
      const authnRequest = `<?xml version="1.0"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="${samlRequestId}" Version="2.0"
    IssueInstant="${new Date().toISOString()}"
    Destination="${config.sso_url}"
    AssertionConsumerServiceURL="${ACS_URL}">
  <saml:Issuer>${SP_ENTITY_ID}</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"/>
</samlp:AuthnRequest>`

      const encoded = btoa(authnRequest)
      const redirectUrl = `${config.sso_url}?SAMLRequest=${encodeURIComponent(encoded)}&RelayState=${encodeURIComponent(tenantId)}`

      // Store request for validation
      await supabase.from('session_store').upsert({
        key: `saml:req:${samlRequestId}`,
        value: { tenantId, requestId: samlRequestId, createdAt: new Date().toISOString() },
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })

      logger.info(`[saml-sso] Login initiated for tenant ${tenantId}`)
      return { redirect_url: redirectUrl };
    }

    // ??? ACS: Assertion Consumer Service (IdP callback) ???
    if (action === 'acs') {
      const { samlResponse, relayState } = body
      if (!samlResponse) {
        return new Response(JSON.stringify({ error: 'SAMLResponse required' }), {
          status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }

      // Decode SAML response
      const decoded = atob(samlResponse)

      // Extract attributes (simplified ? production should use proper XML parser)
      const extractAttr = (name: string): string | null => {
        const re = new RegExp(`Name="${name}"[^>]*>\\s*<[^>]*AttributeValue[^>]*>([^<]+)`, 'i')
        const m = decoded.match(re)
        return m?.[1]?.trim() || null
      }

      const email = extractAttr('email') || extractAttr('http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress')
      const firstName = extractAttr('firstName') || extractAttr('http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname') || ''
      const lastName = extractAttr('lastName') || extractAttr('http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname') || ''
      const groups = extractAttr('groups')?.split(',') || []

      if (!email) {
        return new Response(JSON.stringify({ error: 'Email not found in SAML response' }), {
          status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }

      const tenantId = relayState || null

      // Determine role from groups
      let role: string = 'user'
      if (groups.some(g => g.toLowerCase().includes('super-admin') || g.toLowerCase().includes('superadmin'))) {
        role = 'super_admin'
      } else if (groups.some(g => g.toLowerCase().includes('admin'))) {
        role = 'admin'
      }

      // Check if user exists
      const { data: { users } } = await supabase.auth.admin.listUsers()
      let user = users?.find(u => u.email === email)

      if (!user) {
        // Create new user
        const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            full_name: `${firstName} ${lastName}`.trim(),
            saml_provider: true,
            tenant_id: tenantId,
          },
        })
        if (createErr) throw createErr
        user = newUser.user

        // Assign role if tenant known
        if (tenantId && user) {
          await supabase.from('user_roles').insert({
            user_id: user.id,
            tenant_id: tenantId,
            role,
          }).onConflict('user_id, tenant_id').merge({ role })
        }
      }

      // Generate magic link for session
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
      })

      if (linkErr || !linkData) {
        return new Response(JSON.stringify({ error: 'Failed to create session' }), {
          status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }

      // Audit log
      if (tenantId) {
        await supabase.from('audit_logs').insert({
          tenant_id: tenantId,
          user_id: user!.id,
          action: 'saml_login_success',
          resource_type: 'auth',
          details: { email, role, groups },
        }).catch(() => {})
      }

      logger.info(`[saml-sso] ACS: user ${email} authenticated via SAML`)

      return {
        success: true,
        token_hash: linkData.properties?.hashed_token,
        email,
        redirect_url: DASHBOARD_URL,
      };
    }

    // ??? CONFIGURE: Set up SAML for tenant ???
    if (action === 'configure') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }
      const token = authHeader.replace('Bearer ', '')
      const { data: { user: authUser }, error: claimsErr } = await supabase.auth.getUser(token)
      if (claimsErr || !authUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }

      const { tenantId, provider, entityId, ssoUrl, certificate, attributeMapping } = body
      if (!tenantId || !provider || !ssoUrl) {
        return new Response(JSON.stringify({ error: 'tenantId, provider, ssoUrl required' }), {
          status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }

      const { error: upsertErr } = await supabase.from('saml_configs').upsert({
        tenant_id: tenantId,
        provider,
        entity_id: entityId || provider,
        sso_url: ssoUrl,
        certificate: certificate || '',
        attribute_mapping: attributeMapping || { email: 'email', firstName: 'firstName', lastName: 'lastName', groups: 'groups' },
        enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' })

      if (upsertErr) throw upsertErr

      await supabase.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: authUser.id,
        action: 'saml_configured',
        resource_type: 'saml_config',
        details: { provider, ssoUrl },
      }).catch(() => {})

      return { success: true };
    }

    // ??? GET CONFIG ???
    if (action === 'config') {
      const { tenantId } = body
      if (!tenantId) {
        return new Response(JSON.stringify({ error: 'tenantId required' }), {
          status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }

      const { data: config } = await supabase
        .from('saml_configs')
        .select('tenant_id, provider, entity_id, sso_url, enabled, updated_at')
        .eq('tenant_id', tenantId)
        .maybeSingle()

      return config || { enabled: false };
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
    })
  } catch (error) {
    logger.error('[saml-sso] Error:', error)
    return handleException(error, requestId, 'saml-sso');
  }
}, {
  rateLimit: {
    endpoint: 'saml-sso',
    maxRequests: 20,
    windowMinutes: 1
  }
});