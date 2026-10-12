-- Nexus privileged RPC hardening (2026-10-12)
-- Preserve the existing server-side x-camarillo-key authorization contract.
-- Do not revoke anon/authenticated globally: the server uses a publishable key.
-- This hardens the four RPCs that previously did not validate that key.
CREATE OR REPLACE FUNCTION public.camarillo_create_backup(p_reason text DEFAULT 'manual'::text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare new_id bigint;
begin
  if not public.camarillo_request_authorized() then
    raise exception 'Unauthorized Nexus backup operation.' using errcode='42501';
  end if;
  insert into public.camarillo_state_backups(reason,state)
  select coalesce(nullif(p_reason,''),'manual'),state
  from public.camarillo_app_state where id='main'
  returning backup_id into new_id;
  return new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.camarillo_get_toc_sync_checkpoint(p_source text DEFAULT 'dartstoc-best-known'::text)
RETURNS TABLE(source text, owner text, strategy text, resume_queue jsonb, pages bigint, rows_seen bigint, unique_rows bigint, persisted_rows bigint, queued_shards bigint, failed_shards bigint, heartbeat timestamptz, updated_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select c.source,c.owner,c.strategy,c.resume_queue,c.pages,c.rows_seen,c.unique_rows,
         c.persisted_rows,c.queued_shards,c.failed_shards,c.heartbeat,c.updated_at
  from public.camarillo_toc_sync_checkpoint c
  where c.source=p_source
    and public.camarillo_request_authorized()
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.camarillo_clear_toc_sync_checkpoint(p_source text, p_owner text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not public.camarillo_request_authorized() then
    raise exception 'Unauthorized Nexus checkpoint clear.' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.camarillo_sync_leases l
    where l.source=p_source and l.owner=p_owner and l.lease_until>now()
  ) then
    return false;
  end if;
  update public.camarillo_toc_sync_checkpoint
  set owner=p_owner,resume_queue='[]'::jsonb,queued_shards=0,failed_shards=0,
      heartbeat=now(),updated_at=now()
  where source=p_source;
  return found;
end;
$function$;

CREATE OR REPLACE FUNCTION public.camarillo_save_toc_sync_checkpoint(
  p_source text, p_owner text, p_strategy text, p_resume_queue jsonb,
  p_pages bigint DEFAULT 0, p_rows_seen bigint DEFAULT 0, p_unique_rows bigint DEFAULT 0,
  p_persisted_rows bigint DEFAULT 0, p_queued_shards bigint DEFAULT 0,
  p_failed_shards bigint DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not public.camarillo_request_authorized() then
    raise exception 'Unauthorized Nexus checkpoint save.' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.camarillo_sync_leases l
    where l.source=p_source and l.owner=p_owner and l.lease_until>now()
  ) then
    return false;
  end if;
  insert into public.camarillo_toc_sync_checkpoint(
    source,owner,strategy,resume_queue,pages,rows_seen,unique_rows,persisted_rows,
    queued_shards,failed_shards,heartbeat,updated_at
  ) values (
    p_source,p_owner,p_strategy,coalesce(p_resume_queue,'[]'::jsonb),coalesce(p_pages,0),
    coalesce(p_rows_seen,0),coalesce(p_unique_rows,0),coalesce(p_persisted_rows,0),
    coalesce(p_queued_shards,0),coalesce(p_failed_shards,0),now(),now()
  )
  on conflict (source) do update set
    owner=excluded.owner,
    strategy=excluded.strategy,
    resume_queue=excluded.resume_queue,
    pages=excluded.pages,
    rows_seen=excluded.rows_seen,
    unique_rows=excluded.unique_rows,
    persisted_rows=excluded.persisted_rows,
    queued_shards=excluded.queued_shards,
    failed_shards=excluded.failed_shards,
    heartbeat=excluded.heartbeat,
    updated_at=excluded.updated_at;
  return true;
end;
$function$;
