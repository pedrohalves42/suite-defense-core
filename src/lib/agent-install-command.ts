export type AgentInstallPlatform = 'windows' | 'linux' | 'macos';

interface BuildAgentInstallCommandParams {
  installUrl: string;
  platform: AgentInstallPlatform;
  useSudo?: boolean;
}

const quotePowerShellString = (value: string) => `'${value.replace(/'/g, "''")}'`;
const quoteShellString = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

/**
 * Builds the one-click installer command used by every dashboard/wizard.
 * Keeping this centralized prevents Windows/Linux/macOS command drift.
 */
export function buildAgentInstallCommand({
  installUrl,
  platform,
  useSudo = true,
}: BuildAgentInstallCommandParams): string {
  if (platform === 'windows') {
    const url = quotePowerShellString(installUrl);
    return [
      '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
      `$u=${url}`,
      '$sp="$env:TEMP\\cs-install-$(Get-Random).ps1"',
      'Invoke-WebRequest -Uri $u -OutFile $sp -UseBasicParsing',
      '& $sp',
      'Remove-Item $sp -Force',
    ].join('; ');
  }

  const sudoPrefix = useSudo ? 'sudo ' : '';
  return `curl -fsSL ${quoteShellString(installUrl)} | ${sudoPrefix}bash`;
}

export function getPlatformLabel(platform: AgentInstallPlatform): string {
  if (platform === 'windows') return 'Windows';
  if (platform === 'linux') return 'Linux';
  return 'macOS';
}
