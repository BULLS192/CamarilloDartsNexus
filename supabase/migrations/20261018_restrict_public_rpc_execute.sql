-- Defense-in-depth for the shared Camarillo/Nexus Supabase project.
-- Supabase project: lgefivcocbjrjpfzwfmy
--
-- The backend intentionally uses the anon API role together with a private,
-- server-supplied x-camarillo-key. Keep explicit EXECUTE grants for anon,
-- authenticated and service_role: revoking anon would break the live RPC path.
--
-- All functions below already have explicit grants to those three roles.
-- Removing the implicit PUBLIC grant prevents every *other* database role
-- from executing these routines. It does not by itself resolve Supabase's
-- anon/authenticated SECURITY DEFINER advisor findings.
--
-- Reversible: to restore the previous ACLs, GRANT EXECUTE ON FUNCTION
-- [each exact signature below] TO PUBLIC; see the pre-migration ACL snapshot.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.camarillo_clear_toc_sync_checkpoint(text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.camarillo_create_backup(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.camarillo_get_toc_sync_checkpoint(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.camarillo_nexus_rating_index() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.camarillo_player_metrics_index() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.camarillo_save_toc_sync_checkpoint(text,text,text,jsonb,bigint,bigint,bigint,bigint,bigint,bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.camarillo_compact_toc_player_raw_data() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.camarillo_try_acquire_sync_lease(text,text,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.camarillo_release_sync_lease(text,text) FROM PUBLIC;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
    'camarillo_clear_toc_sync_checkpoint',
    'camarillo_create_backup',
    'camarillo_get_toc_sync_checkpoint',
    'camarillo_nexus_rating_index',
    'camarillo_player_metrics_index',
    'camarillo_save_toc_sync_checkpoint',
    'camarillo_compact_toc_player_raw_data',
    'camarillo_try_acquire_sync_lease',
    'camarillo_release_sync_lease'
  )
  AND NOT has_function_privilege('anon',p.oid,'EXECUTE');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Migration would interrupt the Nexus anon RPC client: % functions lost EXECUTE', v_count;
  END IF;
END $$;

COMMIT;
