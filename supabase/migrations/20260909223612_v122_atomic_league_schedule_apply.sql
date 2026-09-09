-- NEXUS V1.2.2 — Atomic league schedule apply
-- Browser previews pairings; this RPC validates scope/permissions and writes the schedule atomically.

create or replace function public.nexus_apply_league_schedule(p_competition_id uuid, p_season_id uuid, p_rounds jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_type text;
  v_round jsonb;
  v_match jsonb;
  v_match_id uuid;
  v_round_count int := 0;
  v_match_count int := 0;
  v_team_count int := 0;
begin
  select organization_id, competition_type into v_org_id, v_type
  from public.nexus_competitions where id = p_competition_id;
  if v_org_id is null or v_type <> 'league' then raise exception 'League not found'; end if;
  if not nexus_private.user_has_org_permission(v_org_id, 'leagues.manage') then raise exception 'Not authorized'; end if;
  if p_season_id is not null and not exists (
    select 1 from public.nexus_seasons where id=p_season_id and competition_id=p_competition_id
  ) then raise exception 'Season is outside league'; end if;
  if exists (
    select 1 from public.nexus_matches
    where competition_id=p_competition_id
      and season_id is not distinct from p_season_id
      and status <> 'cancelled'
  ) then raise exception 'Schedule already exists for this scope'; end if;
  if jsonb_typeof(p_rounds) <> 'array' or jsonb_array_length(p_rounds)=0 then raise exception 'Rounds are required'; end if;

  for v_round in select value from jsonb_array_elements(p_rounds)
  loop
    v_round_count := v_round_count + 1;
    for v_match in select value from jsonb_array_elements(coalesce(v_round->'matches','[]'::jsonb))
    loop
      if not exists (
        select 1 from public.nexus_teams t
        where t.id=(v_match->>'homeTeamId')::uuid
          and t.competition_id=p_competition_id
          and t.season_id is not distinct from p_season_id
      ) or not exists (
        select 1 from public.nexus_teams t
        where t.id=(v_match->>'awayTeamId')::uuid
          and t.competition_id=p_competition_id
          and t.season_id is not distinct from p_season_id
      ) then raise exception 'Schedule contains a team outside selected league/season'; end if;

      if (v_match->>'homeTeamId')=(v_match->>'awayTeamId') then raise exception 'Team cannot play itself'; end if;

      insert into public.nexus_matches
        (competition_id, season_id, round_key, round_number, match_number, status, metadata)
      values
        (p_competition_id, p_season_id, 'R'||(v_round->>'roundNumber'),
         (v_round->>'roundNumber')::int, v_match_count+1, 'scheduled',
         jsonb_build_object('generator','round_robin_v122'))
      returning id into v_match_id;

      insert into public.nexus_match_sides (match_id, side_no, participant_type, team_id)
      values
        (v_match_id,1,'team',(v_match->>'homeTeamId')::uuid),
        (v_match_id,2,'team',(v_match->>'awayTeamId')::uuid);

      v_match_count := v_match_count + 1;
    end loop;
  end loop;

  select count(*) into v_team_count
  from public.nexus_teams
  where competition_id=p_competition_id
    and season_id is not distinct from p_season_id
    and status='active';

  insert into public.nexus_schedule_generation_runs
    (competition_id, season_id, generated_by_person_id, schedule_format,
     team_count, round_count, match_count, status, request, output_summary)
  select p_competition_id, p_season_id, p.id,
         coalesce((select schedule_format from public.nexus_league_configs where competition_id=p_competition_id),'single_round_robin'),
         v_team_count, v_round_count, v_match_count, 'applied',
         jsonb_build_object('rounds',p_rounds),
         jsonb_build_object('round_count',v_round_count,'match_count',v_match_count)
  from public.nexus_people p
  where p.auth_user_id=auth.uid()
  limit 1;

  return jsonb_build_object('round_count',v_round_count,'match_count',v_match_count,'team_count',v_team_count);
end;
$$;

revoke all on function public.nexus_apply_league_schedule(uuid,uuid,jsonb) from public;
grant execute on function public.nexus_apply_league_schedule(uuid,uuid,jsonb) to authenticated;
