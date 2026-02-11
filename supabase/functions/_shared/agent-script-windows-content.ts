/* eslint-disable no-useless-escape */
/**
 * CyberShield Agent Windows Script - AUTO-LOADED FROM FILE
 * DO NOT EDIT MANUALLY.
 * Source: _shared/agent-scripts/cybershield-agent-windows-v5.ps1
 * Version: v5.0.3-hotfix
 * Generated: 2026-02-11
 *
 * v5.0.3-hotfix FIXES:
 * - BUG-001: HMAC signature now generated even without body (fixes 401 on GET/empty requests)
 * - BUG-002: ECDSA P-256 fallback for .NET < 4.7 via CngKey.Create
 * - BUG-003: Poll-Jobs changed to POST with body; response parsed as direct array
 * - BUG-004: DNS Sync changed to POST with body for HMAC compatibility
 * - BUG-005: Heartbeat sends real FSM state + ecdsa_enabled flag
 * - Log flood suppression (poll errors logged every 10th failure)
 * - Assert-TaskHealth in main loop
 *
 * ARCHITECTURE: Uses Deno.readTextFile() to load raw .ps1 at runtime,
 * eliminating template literal escaping issues permanently.
 */

const scriptUrl = new URL('./agent-scripts/cybershield-agent-windows-v5.ps1', import.meta.url);
export const AGENT_SCRIPT_WINDOWS_CONTENT = await Deno.readTextFile(scriptUrl);

export function getAgentScriptWindows(): string {
  return AGENT_SCRIPT_WINDOWS_CONTENT;
}
