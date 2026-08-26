create or replace function public.camarillo_robustness_index()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_result jsonb;
begin
  if not public.camarillo_request_authorized() then
    raise exception 'Unauthorized Nexus robustness read.' using errcode = '42501';
  end if;

  with base as (
    select
      p.player_id,
      p.display_name,
      p.bullshooter_id,
      coalesce((p.raw_data#>>'{bullshooter,currentStatsDiagnostics,x01Count}')::numeric,0) as x01_games,
      coalesce((p.raw_data#>>'{bullshooter,currentStatsDiagnostics,cricketCount}')::numeric,0) as cricket_games,
      case when coalesce((p.raw_data#>>'{edc,confirmed}')::boolean,false)
        then coalesce((p.raw_data#>>'{edc,games}')::numeric,0)
        else 0 end as edc_games,
      coalesce((p.raw_data#>>'{edc,confirmed}')::boolean,false) as edc_confirmed,
      exists(
        select 1 from public.camarillo_player_toc_links l
        where l.player_id=p.player_id and l.confirmed is true
      ) as toc_linked,
      coalesce((p.raw_data#>>'{camarillo,games01}')::numeric,0) +
      coalesce((p.raw_data#>>'{camarillo,gamesCricket}')::numeric,0) as cd_games
    from public.camarillo_players p
  ), scored as (
    select *,
      round(least(edc_games,80)/80*30,1) as edc_points,
      case when toc_linked then 30::numeric else 0::numeric end as toc_points,
      round(least(x01_games,50)/50*20,1) as bs501_points,
      round(least(cricket_games,50)/50*20,1) as bscricket_points
    from base
  ), final as (
    select *,
      round(least(edc_points+toc_points+bs501_points+bscricket_points,100))::int as score
    from scored
  ), entries as (
    select *,
      case
        when score>=85 then 'Verified'
        when score>=70 then 'Strong'
        when score>=50 then 'Solid'
        when score>=25 then 'Developing'
        else 'Thin'
      end as label
    from final
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'formulaVersion', '0.9.21-sql',
    'count', count(*),
    'byBullshooterId', coalesce(jsonb_object_agg(
      bullshooter_id,
      jsonb_build_object(
        'playerId', player_id,
        'bullshooterId', bullshooter_id,
        'name', display_name,
        'score', score,
        'label', label,
        'sources', ((x01_games>0 or cricket_games>0)::int + toc_linked::int + edc_confirmed::int + (cd_games>0)::int),
        'flags', jsonb_build_object('bs',(x01_games>0 or cricket_games>0),'toc',toc_linked,'edc',edc_confirmed,'cd',(cd_games>0)),
        'components', jsonb_build_object('edc',edc_points,'toc',toc_points,'bullshooter501',bs501_points,'bullshooterCricket',bscricket_points),
        'evidence', jsonb_build_object('edcGames',edc_games,'bs501Games',x01_games,'bsCricketGames',cricket_games)
      )
    ) filter (where bullshooter_id is not null and bullshooter_id<>''), '{}'::jsonb),
    'byPlayerId', coalesce(jsonb_object_agg(
      player_id,
      jsonb_build_object(
        'playerId', player_id,
        'bullshooterId', bullshooter_id,
        'name', display_name,
        'score', score,
        'label', label,
        'sources', ((x01_games>0 or cricket_games>0)::int + toc_linked::int + edc_confirmed::int + (cd_games>0)::int),
        'flags', jsonb_build_object('bs',(x01_games>0 or cricket_games>0),'toc',toc_linked,'edc',edc_confirmed,'cd',(cd_games>0)),
        'components', jsonb_build_object('edc',edc_points,'toc',toc_points,'bullshooter501',bs501_points,'bullshooterCricket',bscricket_points),
        'evidence', jsonb_build_object('edcGames',edc_games,'bs501Games',x01_games,'bsCricketGames',cricket_games)
      )
    ), '{}'::jsonb),
    'diagnostics', jsonb_build_object('source','sql-normalized-mirror','playerCount',count(*),'indexedBullshooterCount',count(*) filter (where bullshooter_id is not null and bullshooter_id<>''))
  ) into v_result
  from entries;

  return v_result;
end;
$$;

revoke all on function public.camarillo_robustness_index() from public;
grant execute on function public.camarillo_robustness_index() to anon, authenticated;
