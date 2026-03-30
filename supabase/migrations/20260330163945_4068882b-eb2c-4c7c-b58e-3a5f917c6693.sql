-- Phase 2: Enable Realtime on high-traffic polled tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.decision_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.security_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_global_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_safe_mode_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.approval_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.antivirus_status;