// ============================================
// PROTECTED TARGETS - Single Source of Truth
// ============================================
// These lists define critical system processes and services
// that should NEVER be killed/stopped/disabled via remote commands.
// Used by: execute-playbook-action, ProcessControlDispatcher, agent

// Protected system processes that cannot be killed
export const PROTECTED_PROCESSES = [
  'csrss.exe', 
  'smss.exe', 
  'wininit.exe', 
  'winlogon.exe', 
  'services.exe', 
  'lsass.exe', 
  'svchost.exe', 
  'System',
  'dwm.exe', 
  'explorer.exe', 
  'taskmgr.exe', 
  'RuntimeBroker.exe',
  // Without .exe extension for matching flexibility
  'csrss', 
  'smss', 
  'wininit', 
  'winlogon', 
  'services', 
  'lsass', 
  'svchost',
  'dwm', 
  'explorer', 
  'taskmgr', 
  'RuntimeBroker',
];

// Protected system services that cannot be stopped/disabled
export const PROTECTED_SERVICES = [
  'eventlog', 
  'PlugPlay', 
  'Power', 
  'RpcSs', 
  'SENS', 
  'Schedule', 
  'Winmgmt', 
  'wuauserv', 
  'CryptSvc', 
  'DcomLaunch',
  'Dhcp', 
  'Dnscache', 
  'LanmanServer', 
  'LanmanWorkstation',
  'NlaSvc', 
  'Netman', 
  'WinDefend', 
  'MpsSvc',
  'Spooler', // Print Spooler (pode causar problemas em alguns sistemas)
  'W32Time', // Windows Time
  'Netlogon', // Network Logon
  'SamSs', // Security Accounts Manager
];

/**
 * Check if a process is protected and cannot be killed
 * @param name Process name (with or without .exe)
 * @returns true if protected
 */
export function isProcessProtected(name: string): boolean {
  const normalizedName = name.toLowerCase().replace('.exe', '');
  return PROTECTED_PROCESSES.some(p => 
    p.toLowerCase().replace('.exe', '') === normalizedName
  );
}

/**
 * Check if a service is protected and cannot be stopped/disabled
 * @param name Service name
 * @returns true if protected
 */
export function isServiceProtected(name: string): boolean {
  return PROTECTED_SERVICES.some(s => 
    s.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Validate that a target is not protected before creating a job
 * @throws Error if target is protected
 */
export function assertNotProtected(
  target: string, 
  type: 'process' | 'service'
): void {
  if (type === 'process' && isProcessProtected(target)) {
    throw new Error(`Protected process cannot be controlled: ${target}`);
  }
  if (type === 'service' && isServiceProtected(target)) {
    throw new Error(`Protected service cannot be controlled: ${target}`);
  }
}
