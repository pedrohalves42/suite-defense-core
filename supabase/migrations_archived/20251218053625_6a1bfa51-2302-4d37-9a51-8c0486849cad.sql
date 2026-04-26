-- P1 Security Fix: Remove plaintext token column
-- All 16 tokens have token_hash populated (verified via audit)
-- Authentication uses token_hash exclusively

ALTER TABLE public.agent_tokens DROP COLUMN IF EXISTS token;