/**
 * IP Allowlist Enforcement Middleware
 * Restricts admin access to authorized IPs from admin_ip_whitelist table
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'

/**
 * Extract client IP from request headers
 */
export function extractClientIP(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
}

/**
 * Check if the requesting IP is allowed for admin operations on the given tenant.
 * Returns null if allowed, or a 403 Response if blocked.
 * 
 * If no allowlist entries exist for the tenant, access is permitted (open by default).
 * If entries exist, the IP must match at least one active, non-expired entry.
 */
export async function enforceIPAllowlist(
  supabase: SupabaseClient,
  req: Request,
  tenantId: string,
  userId: string
): Promise<Response | null> {
  const ip = extractClientIP(req)

  // Skip enforcement for internal/private IPs (dev environment)
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'unknown') {
    return null
  }

  const { data: entries, error } = await supabase
    .from('admin_ip_whitelist')
    .select('ip_address, is_active, expires_at')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  if (error) {
    console.error('[ip-allowlist] Error fetching allowlist:', error.message)
    // Fail open on DB error to avoid locking admins out
    return null
  }

  // No entries configured = no restriction
  if (!entries || entries.length === 0) {
    return null
  }

  const now = new Date()
  const activeEntries = entries.filter(e => !e.expires_at || new Date(e.expires_at) > now)

  if (activeEntries.length === 0) {
    // All entries expired — treat as no restriction
    return null
  }

  // Check if IP matches any entry (ip_address is stored as inet type)
  const isAllowed = activeEntries.some(e => {
    const entryIP = String(e.ip_address)
    // Direct match
    if (entryIP === ip) return true
    // CIDR match (basic /24, /16 support)
    if (entryIP.includes('/')) return isIPInCIDR(ip, entryIP)
    return false
  })

  if (isAllowed) {
    return null
  }

  // Blocked — log security event
  console.warn(`[SECURITY] IP ${ip} denied access for user ${userId} on tenant ${tenantId}`)

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: userId,
    action: 'ip_allowlist_denied',
    resource_type: 'admin_access',
    details: { ip, active_allowlist_count: activeEntries.length },
  }).catch(() => {}) // Don't fail if audit insert fails

  return new Response(
    JSON.stringify({
      error: 'Access denied: your IP address is not authorized',
      ip,
    }),
    {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

/**
 * Basic CIDR matching for IPv4
 */
function isIPInCIDR(ip: string, cidr: string): boolean {
  try {
    const [network, maskStr] = cidr.split('/')
    const mask = parseInt(maskStr, 10)
    if (isNaN(mask) || mask < 0 || mask > 32) return false

    const ipNum = ipv4ToNumber(ip)
    const netNum = ipv4ToNumber(network)
    if (ipNum === null || netNum === null) return false

    const maskBits = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0
    return (ipNum & maskBits) === (netNum & maskBits)
  } catch {
    return false
  }
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let num = 0
  for (const p of parts) {
    const octet = parseInt(p, 10)
    if (isNaN(octet) || octet < 0 || octet > 255) return null
    num = (num << 8) + octet
  }
  return num >>> 0
}
