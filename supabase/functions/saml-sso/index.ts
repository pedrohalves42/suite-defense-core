import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * SAML 2.0 SSO Edge Function
 * Supports Okta, Azure AD, Google Workspace, Auth0
 * Actions: metadata, login, acs, configure, config
 */

const SP_ENTITY_ID = Deno.env.get('SAML_SP_ENTITY_ID') || 'cybershield'
const ACS_URL = Deno.env.get('SAML_ACS_URL') || 'https://cybershield-audit.lovable.app/auth/saml/callback'
const DASHBOARD_URL = Deno.env.get('DASHBOARD_URL') || 'https://cybershield-audit.lovable.app'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  try {
    const body = await req.json().catch(() => ({}))
    const action = body.action || 'metadata'

    // ─── METADATA ───
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
        headers: { ...corsHeaders, 'Content-Type': 'application/xml' }
      })
    }

    // ─── LOGIN: Initiate SAML AuthnRequest ───
    if (action === 'login') {
      const { tenantId } = body
      if (!tenantId) {
        return new Response(JSON.stringify({ error: 'tenantId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: config, error: cfgErr } = await supabase
        .from('saml_configs')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('enabled', true)
        .single()

      if (cfgErr || !config) {
        return new Response(JSON.stringify({ error: 'SAML not configured for this tenant' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const requestId = `_${crypto.randomUUID()}`
      const authnRequest = `<?xml version="1.0"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="${requestId}" Version="2.0"
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
        key: `saml:req:${requestId}`,
        value: { tenantId, requestId, createdAt: new Date().toISOString() },
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })

      console.log(`[saml-sso] Login initiated for tenant ${tenantId}, provider: ${config.provider}`)
      return new Response(JSON.stringify({ redirect_url: redirectUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ─── ACS: Assertion Consumer Service (IdP callback) ───
    if (action === 'acs') {
      const { samlResponse, relayState } = body
      if (!samlResponse) {
        return new Response(JSON.stringify({ error: 'SAMLResponse required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Decode SAML response
      const decoded = atob(samlResponse)

      // Extract attributes (simplified — production should use proper XML parser)
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
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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

      console.log(`[saml-sso] ACS: user ${email} authenticated via SAML, role: ${role}`)

      return new Response(JSON.stringify({
        success: true,
        token_hash: linkData.properties?.hashed_token,
        email,
        redirect_url: DASHBOARD_URL,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ─── CONFIGURE: Set up SAML for tenant ───
    if (action === 'configure') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const token = authHeader.replace('Bearer ', '')
      const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token)
      if (claimsErr || !claims?.claims?.sub) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { tenantId, provider, entityId, ssoUrl, certificate, attributeMapping } = body
      if (!tenantId || !provider || !ssoUrl) {
        return new Response(JSON.stringify({ error: 'tenantId, provider, ssoUrl required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
        user_id: claims.claims.sub,
        action: 'saml_configured',
        resource_type: 'saml_config',
        details: { provider, ssoUrl },
      }).catch(() => {})

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ─── GET CONFIG ───
    if (action === 'config') {
      const { tenantId } = body
      if (!tenantId) {
        return new Response(JSON.stringify({ error: 'tenantId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: config } = await supabase
        .from('saml_configs')
        .select('tenant_id, provider, entity_id, sso_url, enabled, updated_at')
        .eq('tenant_id', tenantId)
        .maybeSingle()

      return new Response(JSON.stringify(config || { enabled: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('[saml-sso] Error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
