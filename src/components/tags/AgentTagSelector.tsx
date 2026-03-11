import { useState } from 'react';
import { useAgentTags, useAgentTagAssignments, useAssignTag, useRemoveTagAssignment } from '@/hooks/useAgentTags';
import { useTenant } from '@/hooks/useTenant';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tag, Plus, X, Check } from 'lucide-react';

interface AgentTagSelectorProps {
  agentId: string;
}

export const AgentTagSelector = ({ agentId }: AgentTagSelectorProps) => {
  const { data: allTags } = useAgentTags();
  const { data: assignments } = useAgentTagAssignments(agentId);
  const assignTag = useAssignTag();
  const removeTag = useRemoveTagAssignment();
  const { tenant } = useTenant();
  const [open, setOpen] = useState(false);

  const assignedTagIds = new Set(assignments?.map((a: any) => a.tag_id) || []);

  const handleToggle = async (tagId: string) => {
    if (assignedTagIds.has(tagId)) {
      await removeTag.mutateAsync({ agentId, tagId });
    } else {
      await assignTag.mutateAsync({ agentId, tagId, tenantId: tenant?.id ?? '' });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {assignments?.map((a: any) => (
        <Badge
          key={a.id}
          variant="secondary"
          className="text-xs gap-1 pr-1"
          style={{
            backgroundColor: (a.agent_tags?.color || '#3b82f6') + '20',
            color: a.agent_tags?.color || '#3b82f6',
          }}
        >
          {a.agent_tags?.name}
          <button
            onClick={() => removeTag.mutate({ agentId, tagId: a.tag_id })}
            className="hover:bg-black/10 rounded-full p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground">
            <Plus className="h-3 w-3 mr-1" />
            Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="start">
          <div className="space-y-1">
            {allTags?.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2 text-center">
                Nenhuma tag criada
              </p>
            ) : (
              allTags?.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => handleToggle(tag.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors"
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="flex-1 text-left truncate">{tag.name}</span>
                  {assignedTagIds.has(tag.id) && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
