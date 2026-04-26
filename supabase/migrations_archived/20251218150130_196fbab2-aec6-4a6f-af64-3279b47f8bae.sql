-- Add agent_token column to enrollment_keys for installer generation
-- Token is stored temporarily until enrollment key is used

ALTER TABLE public.enrollment_keys 
ADD COLUMN IF NOT EXISTS agent_token TEXT;

-- Add comment explaining purpose
COMMENT ON COLUMN public.enrollment_keys.agent_token IS 'Plaintext agent token for installer generation. Cleared after first use for security.';