/**
 * Installer Template Version Tracker
 * 
 * Este arquivo rastreia as versoes do installer template para facilitar
 * debugging e validacao de deploys.
 * 
 * IMPORTANTE: Atualizar este arquivo sempre que modificar installer-template.ts
 */

export const INSTALLER_VERSION = '3.1.1-PARSERERROR-FIX';
export const LAST_UPDATED = '2025-11-20T20:00:00Z';

export const CHANGES = [
  'Corrigido InvalidVariableReferenceWithDrive em 6 blocos catch',
  'Substituido ": $_" por ": $($_.Exception.Message)" para compatibilidade PowerShell 5.1',
  'Validacao completa de sintaxe PowerShell 5.1',
  'Garantia de parsing correto em ambientes Windows Server 2016+',
];

export const KNOWN_ISSUES_FIXED = [
  'ParserError: A drive name cannot be used as the name for a variable',
  'Scheduled Task LastTaskResult = 4294770688 (malformed arguments)',
  'Instalador terminava sem criar agent script valido',
];

/**
 * Retorna string formatada para logs
 */
export function getVersionInfo(): string {
  return `Installer v${INSTALLER_VERSION} (${LAST_UPDATED})`;
}
