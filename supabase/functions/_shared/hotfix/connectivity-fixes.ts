/**
 * Connectivity & Authentication Hotfixes for Windows Agent Script
 */
import type { HotfixContext } from './types.ts';

/**
 * SSA-010: Fix API Endpoint URL normalization.
 * Ensures the agent script correctly handles base URLs and adds /functions/v1/ prefix.
 */
export function hotfixUrlNormalization(ctx: HotfixContext) {
  if (ctx.content.includes('HOTFIX-URL-NORM')) return;

  const oldInit = `    # Load secrets from files (preferred) or params
    $script:Config.AgentToken = Get-SecretValue -Name "agent_token" -Fallback $AgentToken
    $script:Config.HmacSecret = Get-SecretValue -Name "hmac_secret" -Fallback $HmacSecret
    $script:Config.ApiEndpoint = if ($ApiEndpoint) { $ApiEndpoint } else { $env:CYBERSHIELD_API_ENDPOINT }`;

  const newInit = `    # Load secrets from files (preferred) or params
    $script:Config.AgentToken = Get-SecretValue -Name "agent_token" -Fallback $AgentToken
    $script:Config.HmacSecret = Get-SecretValue -Name "hmac_secret" -Fallback $HmacSecret
    
    # <# HOTFIX-URL-NORM #>
    $rawEndpoint = if ($ApiEndpoint) { $ApiEndpoint } else { $env:CYBERSHIELD_API_ENDPOINT }
    if ($rawEndpoint) {
        $script:Config.ServerUrl = $rawEndpoint.TrimEnd('/') -replace '/functions/v1$', ''
        $script:Config.ApiEndpoint = "$($script:Config.ServerUrl)/functions/v1"
        $Global:ServerUrl = $script:Config.ApiEndpoint
    }`;

  if (ctx.content.includes(oldInit)) {
    ctx.content = ctx.content.replace(oldInit, newInit);
    ctx.reasons.push('fixed_url_normalization');
  }
}

/**
 * SSA-009: Fix Authentication Headers.
 * Ensures the agent script sends X-Agent-Token header for compatibility with backend.
 */
export function hotfixAuthHeaders(ctx: HotfixContext) {
  if (ctx.content.includes('HOTFIX-AUTH-HEADERS')) return;

  const oldHeaders = `            $headers = @{
                "Authorization" = "Bearer $($script:Config.AgentToken)"
                "Content-Type"  = "application/json"
                "X-Agent-Id"    = $script:Config.AgentId
                "X-Trace-ID"    = $traceId
                "X-Request-ID"  = $traceId
            }`;

  const newHeaders = `            $headers = @{
                "X-Agent-Token" = $script:Config.AgentToken # <# HOTFIX-AUTH-HEADERS #>
                "Authorization" = "Bearer $($script:Config.AgentToken)"
                "Content-Type"  = "application/json"
                "X-Agent-Id"    = $script:Config.AgentId
                "X-Trace-ID"    = $traceId
                "X-Request-ID"  = $traceId
            }`;

  if (ctx.content.includes(oldHeaders)) {
    ctx.content = ctx.content.replace(oldHeaders, newHeaders);
    ctx.reasons.push('fixed_auth_headers');
  }
}
