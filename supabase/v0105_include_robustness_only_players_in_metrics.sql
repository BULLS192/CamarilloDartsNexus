-- Applied to production Supabase as migration: v0105_include_robustness_only_players_in_metrics
-- Formula behavior is unchanged; this only unions Rating and Robustness index keys
-- so Robustness-only players remain available to the unified Players-table payload.

create or replace function public.camarillo_player_metrics_index()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_rating jsonb;
  v_robust jsonb;
  v_bs jsonb;
  v_player jsonb;
begin
  if not public.camarillo_request_authorized() then
    raise exception 'Unauthorized Nexus player metrics read.' using errcode='42501';
  end if;

  v_rating := public.camarillo_nexus_rating_index();
  v_robust := public.camarillo_robustness_index();

  with keys as (
    select jsonb_object_keys(coalesce(v_rating->'byBullshooterId','{}'::jsonb)) as key
    union
    select jsonb_object_keys(coalesce(v_robust->'byBullshooterId','{}'::jsonb)) as key
  )
  select coalesce(jsonb_object_agg(
    key,
    coalesce(v_rating->'byBullshooterId'->key,'{}'::jsonb)
      || jsonb_build_object('robustness',v_robust->'byBullshooterId'->key)
  ),'{}'::jsonb)
  into v_bs
  from keys;

  with keys as (
    select jsonb_object_keys(coalesce(v_rating->'byPlayerId','{}'::jsonb)) as key
    union
    select jsonb_object_keys(coalesce(v_robust->'byPlayerId','{}'::jsonb)) as key
  )
  select coalesce(jsonb_object_agg(
    key,
    coalesce(v_rating->'byPlayerId'->key,'{}'::jsonb)
      || jsonb_build_object('robustness',v_robust->'byPlayerId'->key)
  ),'{}'::jsonb)
  into v_player
  from keys;

  return v_rating || jsonb_build_object(
    'metricsVersion','1.0.2',
    'metricsSource','camarillo_player_metrics_index',
    'robustnessFormulaVersion',v_robust->'formulaVersion',
    'robustnessGeneratedAt',v_robust->'generatedAt',
    'robustnessCount',v_robust->'count',
    'byBullshooterId',v_bs,
    'byPlayerId',v_player
  );
end;
$function$;
