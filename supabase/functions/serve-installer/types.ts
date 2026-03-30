/**
 * Types for serve-installer Edge Function
 */

export interface AgentData {
  agent_name: string;
  os_type: string | null;
  hmac_secret: string;
}

export interface EnrollmentData {
  agent_id: string | null;
  is_active: boolean;
  expires_at: string;
  tenant_id: string;
}

export interface InstallerContext {
  requestId: string;
  origin: string | null;
  clientIp: string;
  mode: 'args' | 'envvars';
  enrollmentKey: string;
  enrollmentKeyHash: string;
}
