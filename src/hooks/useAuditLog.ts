import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { logger } from "@/lib/logger";

type ResourceType = 'enrollment_key' | 'agent_token' | 'api_key' | 'agent_secret' | 'security_policy' | 'agent_group';
type ActionType = 'view' | 'copy' | 'export' | 'reveal' | 'list' | 'high_impact_confirm' | 'assign' | 'deactivate' | 'delete';

export interface HighImpactLogDetails {
  impactCount: number;
  impactType: 'computers' | 'agents' | 'groups';
  thresholdExceeded: boolean;
  targetResourceId?: string;
  targetResourceName?: string;
}

export const useAuditLog = () => {
  const logSensitiveAccess = async (
    resourceType: ResourceType,
    resourceId: string,
    action: ActionType,
    additionalDetails?: Record<string, unknown>
  ): Promise<void> => {
    try {
      await supabase.rpc('log_sensitive_access', {
        p_resource_type: resourceType,
        p_resource_id: resourceId,
        p_action: `${action}_${resourceType}`,
        p_details: {
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent,
          ...additionalDetails,
        },
      });
    } catch (error) {
      // Silent fail - don't break UI if audit fails
      logger.error('[AuditLog] Failed to log sensitive access', error instanceof Error ? error : undefined);
    }
  };

  const logHighImpactAction = async (
    resourceType: 'security_policy' | 'agent_group',
    resourceId: string,
    action: 'assign' | 'deactivate' | 'delete',
    details: HighImpactLogDetails
  ): Promise<void> => {
    try {
      await supabase.rpc('log_sensitive_access', {
        p_resource_type: resourceType,
        p_resource_id: resourceId,
        p_action: `high_impact_${action}_${resourceType}`,
        p_details: {
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent,
          impact_count: details.impactCount,
          impact_type: details.impactType,
          threshold_exceeded: details.thresholdExceeded,
          target_resource_id: details.targetResourceId,
          target_resource_name: details.targetResourceName,
          high_impact_confirmed: true,
        },
      });
    } catch (error) {
      // Silent fail - don't break UI if audit fails
      logger.error('[AuditLog] Failed to log high impact action', error instanceof Error ? error : undefined);
    }
  };

  /**
   * Log a state change with before/after tracking for compliance
   */
  const logStateChange = async (
    resourceType: string,
    resourceId: string,
    action: string,
    stateBefore: Json | null,
    stateAfter: Json | null,
    requestId?: string
  ): Promise<void> => {
    try {
      await supabase.rpc('log_state_change', {
        p_resource_type: resourceType,
        p_resource_id: resourceId,
        p_action: action,
        p_state_before: stateBefore,
        p_state_after: stateAfter,
        p_request_id: requestId || crypto.randomUUID(),
        p_details: {
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent,
        },
      });
    } catch (error) {
      console.error('[AuditLog] Failed to log state change:', error);
    }
  };

  return { logSensitiveAccess, logHighImpactAction, logStateChange };
};
