import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Monitor, Apple, Terminal } from "lucide-react";
import type { RolloutPolicy } from "./types";

const PLATFORM_ICONS = { windows: Monitor, linux: Terminal, macos: Apple } as const;
const PLATFORMS = [
  { id: 'windows' as const, label: 'Windows' },
  { id: 'linux' as const, label: 'Linux' },
  { id: 'macos' as const, label: 'macOS' },
];

interface AgentRolloutSimulatorProps {
  policies: RolloutPolicy[];
}

export function AgentRolloutSimulator({ policies }: AgentRolloutSimulatorProps) {
  const { data: agents } = useQuery({
    queryKey: ['agents-for-rollout'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents_safe')
        .select('id, agent_name, os_type, agent_version, status')
        .eq('status', 'active')
        .is('archived_at', null);
      if (error) throw error;
      return data;
    }
  });

  const [buckets, setBuckets] = useState<Record<string, number>>({});

  const calculateBucket = async (agentId: string) => {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(agentId));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return ((hashArray[0] << 8) | hashArray[1]) % 100;
  };

  // Calculate buckets on mount
  useState(() => {
    if (agents) {
      Promise.all(
        agents.map(async (agent) => ({ id: agent.id, bucket: await calculateBucket(agent.id) }))
      ).then((results) => {
        const bucketsMap: Record<string, number> = {};
        results.forEach((r) => { bucketsMap[r.id] = r.bucket; });
        setBuckets(bucketsMap);
      });
    }
  });

  const getAgentsInRollout = (platform: string) => {
    const policy = policies.find(p => p.platform === platform && p.enabled);
    if (!policy || !agents) return { inRollout: 0, total: 0 };
    const platformAgents = agents.filter(a => (a.os_type?.toLowerCase() || 'windows') === platform);
    const inRollout = platformAgents.filter(a => (buckets[a.id] ?? 100) < policy.rollout_percentage);
    return { inRollout: inRollout.length, total: platformAgents.length };
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {PLATFORMS.map((platform) => {
        const { inRollout, total } = getAgentsInRollout(platform.id);
        const policy = policies.find(p => p.platform === platform.id);
        const Icon = PLATFORM_ICONS[platform.id];

        return (
          <div key={platform.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium">{platform.label}</p>
              <p className="text-sm text-muted-foreground">
                {policy?.enabled ? (
                  <><span className="text-green-500 font-bold">{inRollout}</span> de {total} receberão update</>
                ) : 'Rollout desativado'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
