import React from 'react';
import { Hash, Link2, Server, Globe, FileWarning, AlertTriangle } from 'lucide-react';

export const severityColors: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  unknown: 'bg-muted text-muted-foreground border-border',
};

export const typeIcons: Record<string, React.ReactNode> = {
  file_hash_sha256: <Hash className="h-4 w-4" />,
  file_hash_md5: <Hash className="h-4 w-4" />,
  file_hash_sha1: <Hash className="h-4 w-4" />,
  url: <Link2 className="h-4 w-4" />,
  ip_address: <Server className="h-4 w-4" />,
  domain: <Globe className="h-4 w-4" />,
  email: <FileWarning className="h-4 w-4" />,
  cve: <AlertTriangle className="h-4 w-4" />,
};

export const sourceLabels: Record<string, string> = {
  abuse_ch_malwarebazaar: 'MalwareBazaar',
  abuse_ch_urlhaus: 'URLhaus',
  abuse_ch_feodotracker: 'Feodo Tracker',
  alienvault_otx: 'AlienVault OTX',
  virustotal: 'VirusTotal',
  manual: 'Manual',
  internal: 'Internal',
};
