import { useState, useEffect } from 'react';
import { AlertTriangle, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { Link } from 'react-router-dom';
import { logger } from '@/lib/logger';
import { useTranslation } from 'react-i18next';

interface OutdatedAgent {
  agent_name: string;
  agent_version: string | null;
}

export const OutdatedAgentsBanner = () => {
  const { t } = useTranslation();
  const { activeTenant: tenant, loading: tenantLoading } = useActiveTenant();
  const [outdatedAgents, setOutdatedAgents] = useState<OutdatedAgent[]>([]);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkOutdatedAgents = async () => {
      if (!tenant?.id || tenantLoading) return;
      
      try {
        // SECURITY: Use agent_releases_public view (Phase 3 hardening - column privileges block script_content)
        const { data: releases } = await supabase
          .from('agent_releases_public')
          .select('version')
          .eq('is_active', true)
          .eq('platform', 'windows')
          .eq('channel', 'stable')
          .order('created_at', { ascending: false })
          .limit(1);

        const latest = releases?.[0]?.version;
        setLatestVersion(latest);

        if (!latest) {
          setLoading(false);
          return;
        }

        // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
        const { data: agentsRaw } = await supabase.rpc('get_agents_list', {
          p_tenant_id: tenant.id,
          p_include_archived: false
        });
        const agents = ((agentsRaw || []) as Array<Record<string, unknown>>)
          .filter((a: Record<string, unknown>) => a.status === 'active' && a.agent_version)
          .map((a: Record<string, unknown>) => ({ agent_name: String(a.agent_name), agent_version: String(a.agent_version) }));

        // Filter agents that need manual reinstallation (v3.10.21 and below have bootstrap problem)
        const outdated = (agents || []).filter(agent => {
          if (!agent.agent_version) return false;
          
          // Extract version number for comparison
          const versionMatch = agent.agent_version.match(/v?(\d+)\.(\d+)\.(\d+)/);
          if (!versionMatch) return false;
          
          const [, major, minor, patch] = versionMatch.map(Number);
          
          // v3.10.21 and below have the bootstrap problem requiring manual reinstall
          if (major < 3) return true;
          if (major === 3 && minor < 10) return true;
          if (major === 3 && minor === 10 && patch <= 21) return true;
          
          return false;
        });

        setOutdatedAgents(outdated);
      } catch (error) {
        logger.error('Error checking outdated agents:', error);
      } finally {
        setLoading(false);
      }
    };

    checkOutdatedAgents();
  }, [tenant?.id, tenantLoading]);

  if (loading || dismissed || outdatedAgents.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 p-5 rounded-xl border border-warning/30 bg-warning/5 backdrop-blur-md flex items-start gap-4 shadow-sm">
      <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-warning-foreground">
          {t('adminPages.outdatedBanner.title', { 
            count: outdatedAgents.length,
            plural: outdatedAgents.length > 1 ? 's' : '',
            verb: outdatedAgents.length > 1 ? 'm' : ''
          })}
        </h4>
        <p className="text-sm text-muted-foreground mt-1">
          {t('adminPages.outdatedBanner.description')}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {outdatedAgents.slice(0, 5).map(agent => (
            <span 
              key={agent.agent_name}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-warning/10 border border-warning/20 text-[10px] font-bold uppercase tracking-wider text-warning-foreground"
            >
              {agent.agent_name}
              <span className="text-muted-foreground">({agent.agent_version})</span>
            </span>
          ))}
          {outdatedAgents.length > 5 && (
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-muted text-xs font-medium">
              +{outdatedAgents.length - 5} {t('common.more')}
            </span>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <Button asChild size="sm" variant="outline" className="gap-1">
            <Link to="/admin/agent-installer">
              <RefreshCw className="h-3 w-3" />
              {t('adminPages.outdatedBanner.generateKey')}
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="gap-1 text-xs">
            <a href="https://github.com/your-repo/docs/REINSTALL_PROCEDURE_V3.md" target="_blank" rel="noopener noreferrer">
              {t('adminPages.outdatedBanner.viewProcedure')}
            </a>
          </Button>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 h-6 w-6"
        onClick={() => setDismissed(true)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
