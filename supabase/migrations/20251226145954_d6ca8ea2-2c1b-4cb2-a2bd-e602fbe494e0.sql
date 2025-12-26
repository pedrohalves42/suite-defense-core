-- Add group_id column to blocked_websites for group-based blocking
ALTER TABLE blocked_websites
ADD COLUMN group_id uuid REFERENCES agent_groups(id) ON DELETE CASCADE;

-- Create index for efficient querying
CREATE INDEX idx_blocked_websites_group_id ON blocked_websites(group_id);

-- Add comment for documentation
COMMENT ON COLUMN blocked_websites.group_id IS 
  'If NULL, block applies to all agents in tenant. If set, applies only to agents in this group.';