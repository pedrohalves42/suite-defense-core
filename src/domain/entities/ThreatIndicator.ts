// ── Threat Intelligence Domain Entity ──

export type ThreatIndicatorType =
  | 'ip_address'
  | 'domain'
  | 'url'
  | 'file_hash_md5'
  | 'file_hash_sha1'
  | 'file_hash_sha256'
  | 'email'
  | 'cve';

export type ThreatSeverity = 'unknown' | 'low' | 'medium' | 'high' | 'critical';

export type ThreatFeedSource =
  | 'abuse_ch_malwarebazaar'
  | 'abuse_ch_urlhaus'
  | 'abuse_ch_feodotracker'
  | 'alienvault_otx'
  | 'virustotal'
  | 'manual'
  | 'internal';

export interface ThreatIndicatorProps {
  id: string;
  tenantId: string;
  indicatorType: ThreatIndicatorType;
  indicatorValue: string;
  severity: ThreatSeverity;
  source: ThreatFeedSource;
  sourceReference?: string;
  tags: string[];
  confidenceScore: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  metadata: Record<string, unknown>;
}

export interface ThreatMatchProps {
  id: string;
  tenantId: string;
  agentId: string;
  indicatorId: string;
  matchContext: string;
  matchDetails: Record<string, unknown>;
  severity: ThreatSeverity;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  respondedAt?: Date;
  responseAction?: string;
  createdAt: Date;
}

export interface ThreatFeedSyncResult {
  feedSource: ThreatFeedSource;
  syncCompletedAt?: Date;
  indicatorsFetched: number;
  indicatorsNew: number;
  indicatorsUpdated: number;
  status: 'running' | 'completed' | 'failed';
  errorMessage?: string;
}

export interface ThreatIntelStats {
  total_indicators: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  by_source: Record<string, number>;
  open_matches: number;
  total_matches_24h: number;
  last_sync?: {
    source: string;
    completed_at: string;
    status: string;
    new_indicators: number;
  };
}
