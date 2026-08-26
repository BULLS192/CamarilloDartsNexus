create or replace function public.camarillo_nexus_rating_index()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','extensions'
as $function$
declare v_result jsonb;
begin
  if not public.camarillo_request_authorized() then
    raise exception 'Unauthorized Nexus rating read.' using errcode='42501';
  end if;

  with base as (
    select p.player_id,p.display_name,p.bullshooter_id,p.raw_data,
      tp.ppd::numeric as toc_ppd,tp.mpr::numeric as toc_mpr,
      (l.player_id is not null and l.confirmed is true) as toc_linked
    from public.camarillo_players p
    left join public.camarillo_player_toc_links l on l.player_id=p.player_id and l.confirmed is true
    left join public.camarillo_toc_players tp on tp.toc_id=l.toc_id
  ), raw as (
    select *,
      nullif(raw_data#>>'{bullshooter,ppd}','')::numeric as bs_current_ppd,
      nullif(raw_data#>>'{bullshooter,mpr}','')::numeric as bs_current_mpr,
      nullif(raw_data#>>'{bullshooter,last50PPD}','')::numeric as bs50_ppd,
      nullif(raw_data#>>'{bullshooter,last20PPD}','')::numeric as bs20_ppd,
      nullif(raw_data#>>'{bullshooter,last10PPD}','')::numeric as bs10_ppd,
      nullif(raw_data#>>'{bullshooter,last50MPR}','')::numeric as bs50_mpr,
      nullif(raw_data#>>'{bullshooter,last20MPR}','')::numeric as bs20_mpr,
      nullif(raw_data#>>'{bullshooter,last10MPR}','')::numeric as bs10_mpr,
      coalesce(nullif(raw_data#>>'{bullshooter,currentStatsDiagnostics,x01Count}','')::numeric,0) as bs_x01_games,
      coalesce(nullif(raw_data#>>'{bullshooter,currentStatsDiagnostics,cricketCount}','')::numeric,0) as bs_cricket_games,
      coalesce((raw_data#>>'{edc,confirmed}')::boolean,false) as edc_confirmed,
      nullif(raw_data#>>'{edc,ppd}','')::numeric as edc_ppd,
      nullif(raw_data#>>'{edc,mpr}','')::numeric as edc_mpr,
      nullif(raw_data#>>'{edc,games}','')::numeric as edc_games,
      nullif(raw_data#>>'{camarillo,last30PPD}','')::numeric as cd_ppd,
      nullif(raw_data#>>'{camarillo,last30MPR}','')::numeric as cd_mpr,
      coalesce(nullif(raw_data#>>'{camarillo,games01}','')::numeric,0) as cd_01_games,
      coalesce(nullif(raw_data#>>'{camarillo,gamesCricket}','')::numeric,0) as cd_cricket_games
    from base
  ), established as (
    select *,
      case when ((bs50_ppd is not null)::int*.5+(bs20_ppd is not null)::int*.3+(bs10_ppd is not null)::int*.2)>0
        then (coalesce(bs50_ppd*.5,0)+coalesce(bs20_ppd*.3,0)+coalesce(bs10_ppd*.2,0))/((bs50_ppd is not null)::int*.5+(bs20_ppd is not null)::int*.3+(bs10_ppd is not null)::int*.2)
        else bs_current_ppd end as bs_ppd,
      case when ((bs50_mpr is not null)::int*.5+(bs20_mpr is not null)::int*.3+(bs10_mpr is not null)::int*.2)>0
        then (coalesce(bs50_mpr*.5,0)+coalesce(bs20_mpr*.3,0)+coalesce(bs10_mpr*.2,0))/((bs50_mpr is not null)::int*.5+(bs20_mpr is not null)::int*.3+(bs10_mpr is not null)::int*.2)
        else bs_current_mpr end as bs_mpr
    from raw
  ), weighted as (
    select *,
      case when bs_ppd is not null then least(bs_x01_games,50)/50*20 else 0 end as w_bs_ppd,
      case when bs_mpr is not null then least(bs_cricket_games,50)/50*20 else 0 end as w_bs_mpr,
      case when edc_confirmed and edc_ppd is not null then case when edc_games is null then 5 else least(edc_games,80)/80*15 end else 0 end as w_edc_ppd,
      case when edc_confirmed and edc_mpr is not null then case when edc_games is null then 5 else least(edc_games,80)/80*15 end else 0 end as w_edc_mpr,
      case when toc_linked and toc_ppd is not null then 10 else 0 end as w_toc_ppd,
      case when toc_linked and toc_mpr is not null then 10 else 0 end as w_toc_mpr,
      case when cd_ppd is not null then least(cd_01_games,30)/30*10 else 0 end as w_cd_ppd,
      case when cd_mpr is not null then least(cd_cricket_games,30)/30*10 else 0 end as w_cd_mpr
    from established
  ), consensus as (
    select *,
      case when (w_bs_ppd+w_edc_ppd+w_toc_ppd+w_cd_ppd)>0 then
        (coalesce(bs_ppd,0)*w_bs_ppd+coalesce(edc_ppd,0)*w_edc_ppd+coalesce(toc_ppd,0)*w_toc_ppd+coalesce(cd_ppd,0)*w_cd_ppd)/(w_bs_ppd+w_edc_ppd+w_toc_ppd+w_cd_ppd) end as nexus_ppd,
      case when (w_bs_mpr+w_edc_mpr+w_toc_mpr+w_cd_mpr)>0 then
        (coalesce(bs_mpr,0)*w_bs_mpr+coalesce(edc_mpr,0)*w_edc_mpr+coalesce(toc_mpr,0)*w_toc_mpr+coalesce(cd_mpr,0)*w_cd_mpr)/(w_bs_mpr+w_edc_mpr+w_toc_mpr+w_cd_mpr) end as nexus_mpr,
      w_bs_ppd+w_bs_mpr as w_bs,w_edc_ppd+w_edc_mpr as w_edc,w_toc_ppd+w_toc_mpr as w_toc,w_cd_ppd+w_cd_mpr as w_cd
    from weighted
  ), final as (
    select *,
      case when nexus_ppd is not null and nexus_mpr is not null then round(nexus_ppd+10*nexus_mpr,1) end as nexus_rating,
      case when bs_ppd is not null and bs_mpr is not null then round(bs_ppd+10*bs_mpr,1) end as bs_rating,
      case when edc_confirmed and edc_ppd is not null and edc_mpr is not null then round(edc_ppd+10*edc_mpr,1) end as edc_rating,
      case when toc_linked and toc_ppd is not null and toc_mpr is not null then round(toc_ppd+10*toc_mpr,1) end as toc_rating_value,
      case when cd_ppd is not null and cd_mpr is not null then round(cd_ppd+10*cd_mpr,1) end as cd_rating
    from consensus
  )
  select jsonb_build_object(
    'generatedAt',now(),'formulaVersion','1.1.1','ratingScaleMax',150,'formula','PPD + 10*MPR','ratingWeights',jsonb_build_object('bullshooter',40,'edc',30,'toc',20,'camarillo',20),'count',count(*),
    'byBullshooterId',coalesce(jsonb_object_agg(bullshooter_id,jsonb_build_object(
      'playerId',player_id,'bullshooterId',bullshooter_id,'name',display_name,'rating',nexus_rating,'nexusPPD',round(nexus_ppd,2),'nexusMPR',round(nexus_mpr,2),
      'evidenceWeight',round(w_bs+w_edc+w_toc+w_cd,1),'sourceWeights',jsonb_build_object('bullshooter',round(w_bs,1),'edc',round(w_edc,1),'toc',round(w_toc,1),'camarillo',round(w_cd,1)),
      'sourceRatings',jsonb_build_object('bullshooter',bs_rating,'edc',edc_rating,'toc',toc_rating_value,'camarillo',cd_rating),
      'flags',jsonb_build_object('bs',w_bs>0,'edc',w_edc>0,'toc',w_toc>0,'cd',w_cd>0),
      'evidence',jsonb_build_object('bs501Games',bs_x01_games,'bsCricketGames',bs_cricket_games,'edcGames',edc_games,'cd501Games',cd_01_games,'cdCricketGames',cd_cricket_games)
    )) filter (where bullshooter_id is not null and bullshooter_id<>''),'{}'::jsonb),
    'byPlayerId',coalesce(jsonb_object_agg(player_id,jsonb_build_object(
      'playerId',player_id,'bullshooterId',bullshooter_id,'name',display_name,'rating',nexus_rating,'nexusPPD',round(nexus_ppd,2),'nexusMPR',round(nexus_mpr,2),
      'evidenceWeight',round(w_bs+w_edc+w_toc+w_cd,1),'sourceWeights',jsonb_build_object('bullshooter',round(w_bs,1),'edc',round(w_edc,1),'toc',round(w_toc,1),'camarillo',round(w_cd,1)),
      'sourceRatings',jsonb_build_object('bullshooter',bs_rating,'edc',edc_rating,'toc',toc_rating_value,'camarillo',cd_rating),
      'flags',jsonb_build_object('bs',w_bs>0,'edc',w_edc>0,'toc',w_toc>0,'cd',w_cd>0),
      'evidence',jsonb_build_object('bs501Games',bs_x01_games,'bsCricketGames',bs_cricket_games,'edcGames',edc_games,'cd501Games',cd_01_games,'cdCricketGames',cd_cricket_games)
    )),'{}'::jsonb)
  ) into v_result from final;
  return v_result;
end;
$function$;

grant execute on function public.camarillo_nexus_rating_index() to anon, authenticated;
