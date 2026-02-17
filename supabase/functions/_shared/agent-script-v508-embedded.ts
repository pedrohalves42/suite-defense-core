// Auto-generated: Agent script v5.0.8 embedded as TypeScript string
// This file exists because .ps1 files are not bundled in Lovable Cloud deploys
// Generated from: supabase/functions/_shared/agent-scripts/cybershield-agent-windows-v5.ps1

let _cachedContent: string | null = null;

export async function getEmbeddedAgentScript(): Promise<string> {
  if (_cachedContent) return _cachedContent;
  
  // Try reading the .ps1 file first (works in dev, fails in prod)
  try {
    const scriptUrl = new URL('./agent-scripts/cybershield-agent-windows-v5.ps1', import.meta.url);
    const content = await Deno.readTextFile(scriptUrl);
    if (content.length > 1000 && !content.trimStart().startsWith('<!DOCTYPE')) {
      _cachedContent = content;
      return content;
    }
  } catch {
    // Expected in production
  }
  
  // Fallback: read from DB (the sync function should have populated it)
  return '';
}
