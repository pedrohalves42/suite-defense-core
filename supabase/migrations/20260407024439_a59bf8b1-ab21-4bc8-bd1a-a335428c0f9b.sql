-- Bug #1: Remove redundant trigger that conflicts with trg_audit_log_integrity
-- Both triggers set previous_log_hash on BEFORE INSERT, causing non-determinism.
-- calculate_audit_log_hash() (used by trg_audit_log_integrity) is the canonical one
-- because it also computes integrity_hash.

DROP TRIGGER IF EXISTS trg_audit_log_hash_chain ON public.audit_logs;

DROP FUNCTION IF EXISTS public.audit_log_hash_chain();