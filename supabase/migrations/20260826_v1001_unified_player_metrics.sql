create or replace function public.camarillo_player_metrics_index()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','extensions'
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

  select coalesce(jsonb_object_agg(r.key,
    r.value || jsonb_build_object('robustness',v_robust->'byBullshooterId'->r.key)
  ),'{}'::jsonb)
  into v_bs
  from jsonb_each(coalesce(v_rating->'byBullshooterId','{}'::jsonb)) r;

  select coalesce(jsonb_object_agg(r.key,
    r.value || jsonb_build_object('robustness',v_robust->'byPlayerId'->r.key)
  ),'{}'::jsonb)
  into v_player
  from jsonb_each(coalesce(v_rating->'byPlayerId','{}'::jsonb)) r;

  return v_rating || jsonb_build_object(
    'formulaVersion','1.0.1',
    'metricsSource','camarillo_player_metrics_index',
    'robustnessFormulaVersion',v_robust->'formulaVersion',
    'robustnessGeneratedAt',v_robust->'generatedAt',
    'byBullshooterId',v_bs,
    'byPlayerId',v_player
  );
end;
$function$;

grant execute on function public.camarillo_player_metrics_index() to anon, authenticated;
