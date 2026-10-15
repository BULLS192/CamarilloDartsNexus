-- A SECURITY DEFINER trigger is not a public RPC.
-- The existing database trigger remains owned by postgres and executes on data
-- changes; users have no legitimate reason to invoke this helper directly.
-- Revoke the default EXECUTE grants without changing its logic or the trigger.
revoke execute on function public.camarillo_sync_normalized_state()
  from PUBLIC, anon, authenticated;
