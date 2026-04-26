
-- Grant execute on all agent management RPCs to authenticated users
GRANT EXECUTE ON FUNCTION public.archive_agent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_agent(uuid, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_agent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_hard_delete_agent(uuid) TO authenticated;
