
-- Temporarily drop the constraint to allow placeholder content
-- (codebase is now the authoritative source for all platforms)
ALTER TABLE agent_releases DROP CONSTRAINT chk_script_content_min_size;

-- Re-add with a more lenient check (allow 'CODEBASE_AUTHORITATIVE' marker)
ALTER TABLE agent_releases ADD CONSTRAINT chk_script_content_min_size 
  CHECK (length(script_content) > 10000 OR script_content = 'CODEBASE_AUTHORITATIVE');
