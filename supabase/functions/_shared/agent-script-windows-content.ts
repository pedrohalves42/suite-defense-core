import { logger } from "./logger.ts";
/* eslint-disable no-useless-escape */
/**
 * CyberShield Agent Windows Script - Deno Deploy Compatible Loader
 * 
 * PROBLEM: .ps1 files are NOT bundled in Deno Deploy.
 * SOLUTION: The authoritative source is the agent_releases table in the DB.
 * This loader is a SECONDARY fallback for local dev only.
 * 
 * In production, edge functions (heartbeat, serve-agent-update) should
 * ALWAYS use DB content from agent_releases as the primary source.
 * The codebase script files are for reference and upload tooling only.
 */

let _content = '';

try {
  const scriptUrl = new URL('./agent-scripts/cybershield-agent-windows-v5.ps1', import.meta.url);
  _content = await Deno.readTextFile(scriptUrl);
  logger.info(`[agent-script-loader] Loaded Windows v5 script from file: ${_content.length} chars`);
} catch {
  // Expected in Deno Deploy - .ps1 not bundled
  // Edge functions will use DB content from agent_releases table
  _content = '';
  logger.info('[agent-script-loader] Windows v5 script not available from file (expected in Deploy)');
}

export const AGENT_SCRIPT_WINDOWS_CONTENT = _content;

export function getAgentScriptWindows(): string {
  return AGENT_SCRIPT_WINDOWS_CONTENT;
}
