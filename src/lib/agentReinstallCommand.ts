interface BuildAgentReinstallCommandParams {
  serverUrl: string;
  fallbackServerUrl?: string;
  agentToken: string;
  hmacSecret: string;
  agentName: string;
}

const escapeForSingleQuotedPowerShell = (value: string) => value.replace(/'/g, "''");

/**
 * Builds the PowerShell one-liner used to reinstall a CyberShield agent.
 * 
 * v6.2 Optimization:
 * Moves all complex logic to a centralized launcher script served by the backend.
 * This keeps the one-liner tiny (< 300 chars) while maintaining all hardening features.
 */
export function buildAgentReinstallCommand({
  serverUrl,
  fallbackServerUrl,
  agentToken,
  hmacSecret,
  agentName,
}: BuildAgentReinstallCommandParams): string {
  const u = escapeForSingleQuotedPowerShell(serverUrl);
  const f = escapeForSingleQuotedPowerShell(fallbackServerUrl ?? '');
  const t = escapeForSingleQuotedPowerShell(agentToken);
  const s = escapeForSingleQuotedPowerShell(hmacSecret);
  const n = escapeForSingleQuotedPowerShell(agentName);

  // loader script
  const parts = [
    `$u='${u}';$f='${f}';$t='${t}';$s='${s}';$n='${n}';`,
    `$r=iwr -useb "$u/functions/v1/public-gateway?action=public:get-reinstall-script";`,
    `&([scriptblock]::Create($r.Content)) -agentToken $t -hmacSecret $s -agentName $n -serverUrl $u -fallbackServerUrl $f`
  ];

  return parts.join('');
}
