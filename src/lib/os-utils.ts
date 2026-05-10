/**
 * Converts Windows build numbers to friendly OS names
 */
export function getWindowsVersion(buildNumber: string): string {
  // Common Windows version mappings based on build numbers
  const versionMap: Record<string, string> = {
    // Windows 11
    '10.0.26100': 'Windows 11 24H2',
    '10.0.26200': 'Windows 11 24H2',
    '10.0.22631': 'Windows 11 23H2',
    '10.0.22621': 'Windows 11 22H2',
    '10.0.22000': 'Windows 11 21H2',
    // Windows 10
    '10.0.19045': 'Windows 10 22H2',
    '10.0.19044': 'Windows 10 21H2',
    '10.0.19043': 'Windows 10 21H1',
    '10.0.19042': 'Windows 10 20H2',
    '10.0.19041': 'Windows 10 2004',
    '10.0.18363': 'Windows 10 1909',
    '10.0.18362': 'Windows 10 1903',
    '10.0.17763': 'Windows 10 1809',
    '10.0.17134': 'Windows 10 1803',
    // Windows Server (modern)
    '10.0.20348': 'Windows Server 2022',
    '10.0.14393': 'Windows Server 2016',
    // Windows 8.1 / Server 2012 R2
    '6.3.9600': 'Windows Server 2012 R2',
    '6.3.9200': 'Windows 8.1',
    // Windows 8 / Server 2012
    '6.2.9200': 'Windows Server 2012',
    // Windows 7 / Server 2008 R2
    '6.1.7601': 'Windows 7 SP1',
    '6.1.7600': 'Windows Server 2008 R2',
  };

  // Direct match
  if (versionMap[buildNumber]) {
    return versionMap[buildNumber];
  }

  // Try partial match (major.minor.build)
  const parts = buildNumber.split('.');
  if (parts.length >= 3) {
    const majorMinorBuild = `${parts[0]}.${parts[1]}.${parts[2]}`;
    if (versionMap[majorMinorBuild]) {
      return versionMap[majorMinorBuild];
    }

    // Detect Windows version based on major.minor
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    const build = parseInt(parts[2], 10);
    
    if (!isNaN(build)) {
      // Windows 10/11 (10.0.x)
      if (major === 10 && minor === 0) {
        if (build >= 22000) {
          return `Windows 11 (Build ${build})`;
        } else if (build >= 10240) {
          return `Windows 10 (Build ${build})`;
        }
      }
      // Windows 8.1 / Server 2012 R2 (6.3.x)
      if (major === 6 && minor === 3) {
        return `Windows Server 2012 R2 (Build ${build})`;
      }
      // Windows 8 / Server 2012 (6.2.x)
      if (major === 6 && minor === 2) {
        return `Windows Server 2012 (Build ${build})`;
      }
      // Windows 7 / Server 2008 R2 (6.1.x)
      if (major === 6 && minor === 1) {
        return `Windows 7/Server 2008 R2 (Build ${build})`;
      }
    }
  }

  // Return original if we can't determine
  return buildNumber;
}

/**
 * Gets a friendly OS display name from os_type and os_version
 */
export function getOsDisplayName(osType: string | null, osVersion: string | null): string {
  if (!osType) return 'Desconhecido';
  
  const normalizedType = osType.toLowerCase();
  
  if (normalizedType === 'windows' || normalizedType.includes('win')) {
    if (osVersion) {
      return getWindowsVersion(osVersion);
    }
    return 'Windows';
  }
  
  if (normalizedType === 'linux' || normalizedType.includes('nix') || normalizedType.includes('nux')) {
    if (osVersion) {
      // Linux usually reports distribution name
      return osVersion;
    }
    return 'Linux';
  }
  
  if (normalizedType === 'macos' || normalizedType === 'darwin' || normalizedType.includes('apple') || normalizedType.includes('osx')) {
    if (osVersion) {
      // macOS version mapping
      const macVersions: Record<string, string> = {
        '15': 'macOS Sequoia',
        '14': 'macOS Sonoma',
        '13': 'macOS Ventura',
        '12': 'macOS Monterey',
        '11': 'macOS Big Sur',
        '10.15': 'macOS Catalina',
      };
      
      for (const [ver, name] of Object.entries(macVersions)) {
        if (osVersion.startsWith(ver)) {
          return `${name} ${osVersion}`;
        }
      }
      return `macOS ${osVersion}`;
    }
    return 'macOS';
  }
  
  return osVersion || osType;
}

/**
 * Gets the appropriate OS icon
 */
export function getOsIcon(osType: string | null): string {
  if (!osType) return '💻';
  
  const normalizedType = osType.toLowerCase();
  
  if (normalizedType === 'windows' || normalizedType.includes('win')) return '🪟';
  if (normalizedType === 'linux' || normalizedType.includes('nix') || normalizedType.includes('nux')) return '🐧';
  if (normalizedType === 'macos' || normalizedType === 'darwin' || normalizedType.includes('apple') || normalizedType.includes('osx')) return '🍎';
  
  return '💻';
}
