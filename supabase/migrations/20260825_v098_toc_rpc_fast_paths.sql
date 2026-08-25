create or replace function public.camarillo_toc_active_count()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.camarillo_request_authorized() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  return (select count(*) from public.camarillo_toc_players where active is true);
end;
$$;

revoke all on function public.camarillo_toc_active_count() from public;
grant execute on function public.camarillo_toc_active_count() to anon;

create or replace function public.camarillo_toc_search(
  p_query text default '',
  p_state text default '',
  p_vendor text default '',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  toc_id text, mpid text, player_name text, normalized_name text, sex text,
  rating numeric, ppd numeric, ppd_source text, ppd_source_url text,
  mpr numeric, mpr_source text, mpr_source_url text, vendor text, vendor_state text,
  showdown boolean, toc_eligible boolean, toc_header text, toc_season text,
  player_url text, signature text, active boolean, last_seen_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  q text := btrim(coalesce(p_query,''));
  st text := upper(btrim(coalesce(p_state,'')));
  ven text := btrim(coalesce(p_vendor,''));
  lim integer := greatest(1, least(coalesce(p_limit,50), 250));
  offv integer := greatest(0, coalesce(p_offset,0));
begin
  if not public.camarillo_request_authorized() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if q ~ '^[0-9]+$' then
    return query
    select t.toc_id,t.mpid,t.player_name,t.normalized_name,t.sex,t.rating,t.ppd,t.ppd_source,t.ppd_source_url,
           t.mpr,t.mpr_source,t.mpr_source_url,t.vendor,t.vendor_state,t.showdown,t.toc_eligible,t.toc_header,
           t.toc_season,t.player_url,t.signature,t.active,t.last_seen_at,t.updated_at
      from public.camarillo_toc_players t
     where t.active is true and t.mpid = q
       and (st = '' or t.vendor_state = st)
       and (ven = '' or t.vendor ilike ('%' || ven || '%'))
     order by t.player_name asc limit lim offset offv;
  elsif q <> '' then
    return query
    select t.toc_id,t.mpid,t.player_name,t.normalized_name,t.sex,t.rating,t.ppd,t.ppd_source,t.ppd_source_url,
           t.mpr,t.mpr_source,t.mpr_source_url,t.vendor,t.vendor_state,t.showdown,t.toc_eligible,t.toc_header,
           t.toc_season,t.player_url,t.signature,t.active,t.last_seen_at,t.updated_at
      from public.camarillo_toc_players t
     where t.active is true
       and (t.player_name ilike ('%' || q || '%') or t.vendor ilike ('%' || q || '%'))
       and (st = '' or t.vendor_state = st)
       and (ven = '' or t.vendor ilike ('%' || ven || '%'))
     order by t.player_name asc limit lim offset offv;
  else
    return query
    select t.toc_id,t.mpid,t.player_name,t.normalized_name,t.sex,t.rating,t.ppd,t.ppd_source,t.ppd_source_url,
           t.mpr,t.mpr_source,t.mpr_source_url,t.vendor,t.vendor_state,t.showdown,t.toc_eligible,t.toc_header,
           t.toc_season,t.player_url,t.signature,t.active,t.last_seen_at,t.updated_at
      from public.camarillo_toc_players t
     where t.active is true
       and (st = '' or t.vendor_state = st)
       and (ven = '' or t.vendor ilike ('%' || ven || '%'))
     order by t.player_name asc limit lim offset offv;
  end if;
end;
$$;

revoke all on function public.camarillo_toc_search(text,text,text,integer,integer) from public;
grant execute on function public.camarillo_toc_search(text,text,text,integer,integer) to anon;
