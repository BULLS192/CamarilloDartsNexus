-- Camarillo Darts Nexus V0.9.22
-- Safe, normalized server input for Nexus Rating V2. The scoring formula remains in tested JS.

create or replace function public.camarillo_nexus_rating_v2_inputs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.camarillo_request_authorized() then
    raise exception 'Unauthorized Nexus rating read.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'playerId', p.player_id,
      'name', p.display_name,
      'bullshooterId', p.bullshooter_id,
      'bullshooter', coalesce(p.raw_data->'bullshooter','{}'::jsonb),
      'edc', coalesce(p.raw_data->'edc','{}'::jsonb),
      'camarillo', coalesce(p.raw_data->'camarillo','{}'::jsonb),
      'toc', case when l.player_id is not null and t.toc_id is not null then jsonb_build_object(
        'tocId', t.toc_id,
        'ppd', t.ppd,
        'mpr', t.mpr,
        'rating', t.rating,
        'ppdSource', t.ppd_source,
        'mprSource', t.mpr_source,
        'vendor', t.vendor,
        'vendorState', t.vendor_state,
        'updatedAt', t.updated_at,
        'lastSeenAt', t.last_seen_at
      ) else null end
    ) order by p.display_name
  ), '[]'::jsonb)
  into v_result
  from public.camarillo_players p
  left join public.camarillo_player_toc_links l
    on l.player_id = p.player_id and l.confirmed is true
  left join public.camarillo_toc_players t
    on t.toc_id = l.toc_id and t.active is true;

  return v_result;
end;
$$;

revoke all on function public.camarillo_nexus_rating_v2_inputs() from public;
grant execute on function public.camarillo_nexus_rating_v2_inputs() to anon, authenticated;
