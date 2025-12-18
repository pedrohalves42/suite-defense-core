/**
 * CyberShield Agent Windows Script Content
 * 
 * O conteúdo do script é buscado do storage bucket em runtime.
 * Esta constante existe apenas para compatibilidade com código existente.
 * 
 * Para sincronizar scripts, use: npm run sync:agent:all-platforms
 * Fonte: public/agent-scripts/cybershield-agent-windows-v4.ps1
 */

// Versão atual do agente Windows  
export const AGENT_WINDOWS_VERSION = "v4.0.6-SAFE-ROLLBACK";

/**
 * @deprecated Script content is now fetched from storage at runtime.
 * This constant is empty for backward compatibility.
 * The serve-agent-update function fetches from storage or agent_releases table.
 */
export const AGENT_SCRIPT_WINDOWS_CONTENT = "";

/**
 * @deprecated Use fetchAgentScriptFromStorage instead.
 * Returns empty string - script must be fetched from storage.
 */
export function getAgentScriptWindows(): string {
  return "";
}
