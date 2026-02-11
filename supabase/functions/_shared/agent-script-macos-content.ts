/* eslint-disable no-useless-escape */
/**
 * CyberShield Agent macOS Script - AUTO-LOADED FROM FILE
 * DO NOT EDIT MANUALLY.
 * Source: _shared/agent-scripts/cybershield-agent-macos-v5.sh
 * Version: v5.0.3-hotfix
 * Generated: 2026-02-11
 *
 * v5.0.3-hotfix FIXES:
 * - BUG-001: HMAC signature now generated even without body
 * - BUG-003: Poll-Jobs changed to POST; response parsed as direct array
 * - BUG-004: DNS Sync uses POST with body
 * - BUG-005: Heartbeat sends real FSM state
 * - LaunchDaemon health check in main loop
 *
 * ARCHITECTURE: Uses Deno.readTextFile() to load raw .sh at runtime,
 * eliminating template literal escaping issues permanently.
 */

const scriptUrl = new URL('./agent-scripts/cybershield-agent-macos-v5.sh', import.meta.url);
export const AGENT_SCRIPT_MACOS_SH = await Deno.readTextFile(scriptUrl);

export function getAgentScriptMacos(): string {
  return AGENT_SCRIPT_MACOS_SH;
}
