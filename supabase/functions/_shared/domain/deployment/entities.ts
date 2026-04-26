
export interface Release {
  id: string;
  version: string;
  script_content: string;
  sha256: string | null;
  signature_base64: string | null;
  signed_at: string | null;
  signed_by: string | null;
  platform: string;
  is_active: boolean;
}

export interface Agent {
  id: string;
  agent_name: string;
  platform: string;
  state: string | null;
  force_update_version: string | null;
  force_update_reason: string | null;
  force_update_at: string | null;
  force_update_delivered_count: number;
  force_update_first_delivered_at: string | null;
  force_update_override_safe_mode: boolean;
  force_update_override_safe_mode_expires_at: string | null;
  last_forced_update_applied: string | null;
  skip_firewall_remediation: boolean;
}

export interface ForceUpdateOptions {
  omitPayloadSignature?: boolean;
  overrideSafeMode?: boolean;
  overrideSafeModeExpiresAt?: string | null;
}
