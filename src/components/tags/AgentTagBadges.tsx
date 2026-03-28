import { useAgentTagAssignments } from '@/hooks/useAgentTags';
import { Badge } from '@/components/ui/badge';
import { Tag } from 'lucide-react';

interface AgentTagBadgesProps {
  agentId: string;
  maxVisible?: number;
}

export const AgentTagBadges = ({ agentId, maxVisible = 3 }: AgentTagBadgesProps) => {
  const { data: assignments } = useAgentTagAssignments(agentId);

  if (!assignments || assignments.length === 0) return null;

  const visible = assignments.slice(0, maxVisible);
  const remaining = assignments.length - maxVisible;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((a: Record<string, unknown>) => (
        <Badge
          key={a.id}
          variant="secondary"
          className="text-[10px] px-1.5 py-0"
          style={{
            backgroundColor: (a.agent_tags?.color || '#3b82f6') + '20',
            color: a.agent_tags?.color || '#3b82f6',
          }}
        >
          {a.agent_tags?.name || 'Tag'}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          +{remaining}
        </Badge>
      )}
    </div>
  );
};
