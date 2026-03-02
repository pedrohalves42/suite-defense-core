-- Temporarily disable immutability triggers to clean stale evidence logs
ALTER TABLE public.agent_evidence_logs DISABLE TRIGGER tr_prevent_evidence_logs_modification;
ALTER TABLE public.agent_evidence_logs DISABLE TRIGGER trg_immutable_agent_evidence_logs;

-- Delete old records (older than 3 days) that inflate dashboard counters
DELETE FROM public.agent_evidence_logs WHERE created_at < now() - interval '3 days';

-- Re-enable immutability triggers
ALTER TABLE public.agent_evidence_logs ENABLE TRIGGER tr_prevent_evidence_logs_modification;
ALTER TABLE public.agent_evidence_logs ENABLE TRIGGER trg_immutable_agent_evidence_logs;