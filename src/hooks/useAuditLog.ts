import { supabase } from "@/integrations/supabase/client";

type ResourceType = 'enrollment_key' | 'agent_token' | 'api_key' | 'agent_secret';
type ActionType = 'view' | 'copy' | 'export' | 'reveal' | 'list';

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
      console.error('[AuditLog] Failed to log sensitive access:', error);
    }
  };

  return { logSensitiveAccess };
};
