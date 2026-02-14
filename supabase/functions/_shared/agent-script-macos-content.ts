/* eslint-disable no-useless-escape */
/**
 * CyberShield Agent macOS Script - Runtime Loader
 * Tries Deno.readTextFile first, falls back to empty string.
 * serve-agent-update will use DB content as fallback.
 */

let _content = '';

try {
  const scriptUrl = new URL('./agent-scripts/cybershield-agent-macos-v5.sh', import.meta.url);
  _content = await Deno.readTextFile(scriptUrl);
} catch {
  // File not available in deployed environment - serve-agent-update uses DB fallback
  _content = '';
}

export const AGENT_SCRIPT_MACOS_SH = _content;

export function getAgentScriptMacos(): string {
  return AGENT_SCRIPT_MACOS_SH;
}
