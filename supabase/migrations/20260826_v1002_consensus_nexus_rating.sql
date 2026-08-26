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
      tp.ppd::numeric toc_ppd,tp.mpr::numeric toc_mpr,tp.rating::numeric toc_rating,
      tp.ppd_source,tp.mpr_source,(l.player_id is not null and l.confirmed=true) toc_linked
    from public.camarillo_players p
    left join public.camarillo_player_toc_links l on l.player_id=p.player_id and l.confirmed=true
    left join public.camarillo_toc_players tp on tp.toc_id=l.toc_id
  ), raw as (
    select *,
      nullif(raw_data#>>'{bullshooter,ppd}','')::numeric bs_current_ppd,
      nullif(raw_data#>>'{bullshooter,mpr}','')::numeric bs_current_mpr,
      nullif(raw_data#>>'{bullshooter,last50PPD}','')::numeric bs50_ppd,
      nullif(raw_data#>>'{bullshooter,last20PPD}','')::numeric bs20_ppd,
      nullif(raw_data#>>'{bullshooter,last10PPD}','')::numeric bs10_ppd,
      nullif(raw_data#>>'{bullshooter,last50MPR}','')::numeric bs50_mpr,
      nullif(raw_data#>>'{bullshooter,last20MPR}','')::numeric bs20_mpr,
      nullif(raw_data#>>'{bullshooter,last10MPR}','')::numeric bs10_mpr,
      coalesce(nullif(raw_data#>>'{bullshooter,currentStatsDiagnostics,x01Count}','')::numeric,0) bs_x01,
      coalesce(nullif(raw_data#>>'{bullshooter,currentStatsDiagnostics,cricketCount}','')::numeric,0) bs_crk,
      coalesce((raw_data#>>'{edc,confirmed}')::boolean,false) edc_confirmed,
      nullif(raw_data#>>'{edc,ppd}','')::numeric edc_ppd,
      nullif(raw_data#>>'{edc,mpr}','')::numeric edc_mpr,
      nullif(raw_data#>>'{edc,games}','')::numeric edc_games,
      nullif(raw_data#>>'{camarillo,last30PPD}','')::numeric cd_ppd,
      nullif(raw_data#>>'{camarillo,last30MPR}','')::numeric cd_mpr,
      coalesce(nullif(raw_data#>>'{camarillo,games01}','')::numeric,0) cd_01,
      coalesce(nullif(raw_data#>>'{camarillo,gamesCricket}','')::numeric,0) cd_crk
    from base
  ), est as (
    select *,
      case when ((bs50_ppd is not null)::int*.5+(bs20_ppd is not null)::int*.3+(bs10_ppd is not null)::int*.2)>0
        then (coalesce(bs50_ppd*.5,0)+coalesce(bs20_ppd*.3,0)+coalesce(bs10_ppd*.2,0))/((bs50_ppd is not null)::int*.5+(bs20_ppd is not null)::int*.3+(bs10_ppd is not null)::int*.2) else bs_current_ppd end bs_ppd,
      case when ((bs50_mpr is not null)::int*.5+(bs20_mpr is not null)::int*.3+(bs10_mpr is not null)::int*.2)>0
        then (coalesce(bs50_mpr*.5,0)+coalesce(bs20_mpr*.3,0)+coalesce(bs10_mpr*.2,0))/((bs50_mpr is not null)::int*.5+(bs20_mpr is not null)::int*.3+(bs10_mpr is not null)::int*.2) else bs_current_mpr end bs_mpr
    from raw
  ), src as (
    select *,
      case when bs_ppd is not null and bs_mpr is not null then bs_ppd+10*bs_mpr end bs_rating,
      case when edc_confirmed and edc_ppd is not null and edc_mpr is not null then edc_ppd+10*edc_mpr end edc_rating,
      case when toc_linked and toc_ppd is not null and toc_mpr is not null then toc_ppd+10*toc_mpr end toc_rating_value,
      case when cd_ppd is not null and cd_mpr is not null then cd_ppd+10*cd_mpr end cd_rating,
      least(bs_x01,50)/50*20 + least(bs_crk,50)/50*20 bs_weight,
      case when edc_confirmed and edc_ppd is not null and edc_mpr is not null then case when edc_games is null then 10 else least(edc_games,80)/80*30 end else 0 end edc_weight,
      case when toc_linked and toc_ppd is not null and toc_mpr is not null then 20 else 0 end toc_weight,
      case when cd_ppd is not null and cd_mpr is not null then least(cd_01,30)/30*10 + least(cd_crk,30)/30*10 else 0 end cd_weight,
      case when lower(coalesce(ppd_source,'')||' '||coalesce(mpr_source,'')) ~ '(bull[ -]?shooter|bullshooter\.live|arachnid)' then .35 else 1 end toc_independence
    from est
  ), rows as (
    select player_id,display_name,bullshooter_id,'bullshooter'::text source,bs_ppd ppd,bs_mpr mpr,bs_rating rating,bs_weight base_weight,1.0::numeric independence,null::text ppd_source,null::text mpr_source from src where bs_rating is not null and bs_weight>0
    union all select player_id,display_name,bullshooter_id,'edc',edc_ppd,edc_mpr,edc_rating,edc_weight,1.0,null,null from src where edc_rating is not null and edc_weight>0
    union all select player_id,display_name,bullshooter_id,'toc',toc_ppd,toc_mpr,toc_rating_value,toc_weight*toc_independence,toc_independence,ppd_source,mpr_source from src where toc_rating_value is not null and toc_weight>0
    union all select player_id,display_name,bullshooter_id,'camarillo',cd_ppd,cd_mpr,cd_rating,cd_weight,1.0,null,null from src where cd_rating is not null and cd_weight>0
  ), med as (
    select player_id,count(*) filter(where independence>=.75) independent_source_count,
      percentile_cont(.5) within group(order by rating) filter(where independence>=.75) median_rating from rows group by player_id
  ), factors as (
    select r.*,m.independent_source_count,m.median_rating,
      case
        when r.independence>=.75 and exists(select 1 from rows o where o.player_id=r.player_id and o.source<>r.source and o.independence>=.75 and abs(o.rating-r.rating)<=2.0) then 1.25
        when r.independence>=.75 and exists(select 1 from rows o where o.player_id=r.player_id and o.source<>r.source and o.independence>=.75 and abs(o.rating-r.rating)<=5.0) then 1.10
        else 1.0 end agreement_factor,
      case when m.independent_source_count>=3 and abs(r.rating-m.median_rating)>12 then .60 when m.independent_source_count>=3 and abs(r.rating-m.median_rating)>8 then .80 else 1.0 end outlier_factor
    from rows r join med m using(player_id)
  ), weighted as (
    select *,base_weight*agreement_factor*outlier_factor final_weight from factors
  ), grouped as (
    select player_id,max(display_name) display_name,max(bullshooter_id) bullshooter_id,
      round(sum(rating*final_weight)/nullif(sum(final_weight),0),1) nexus_rating,
      round((sum(ppd*final_weight)/nullif(sum(final_weight),0))::numeric,2) nexus_ppd,
      round((sum(mpr*final_weight)/nullif(sum(final_weight),0))::numeric,2) nexus_mpr,
      round(sum(base_weight),1) evidence_weight,round(sum(final_weight),1) effective_weight,count(*) source_count,
      max(independent_source_count) independent_source_count,round(max(median_rating)::numeric,1) consensus_median,
      jsonb_object_agg(source,round(rating,1)) source_ratings,jsonb_object_agg(source,round(base_weight,1)) source_base_weights,
      jsonb_object_agg(source,round(final_weight,1)) source_weights,jsonb_object_agg(source,round(agreement_factor,2)) agreement_factors,
      jsonb_object_agg(source,round(outlier_factor,2)) outlier_factors,jsonb_object_agg(source,round(independence,2)) independence_factors,
      max(ppd_source) filter(where source='toc') toc_ppd_source,max(mpr_source) filter(where source='toc') toc_mpr_source
    from weighted group by player_id
  ), enriched as (
    select g.*,s.bs_x01,s.bs_crk,s.edc_games,s.cd_01,s.cd_crk,
      (g.source_ratings ? 'bullshooter') has_bs,(g.source_ratings ? 'edc') has_edc,(g.source_ratings ? 'toc') has_toc,(g.source_ratings ? 'camarillo') has_cd
    from grouped g join src s using(player_id)
  )
  select jsonb_build_object(
    'generatedAt',now(),'formulaVersion','1.2.0','ratingScaleMax',150,'formula','weighted source consensus; source rating = PPD + 10*MPR',
    'ratingWeights',jsonb_build_object('bullshooter',40,'edc',30,'toc',20,'camarillo',20),'count',count(*),
    'byBullshooterId',coalesce(jsonb_object_agg(bullshooter_id,jsonb_build_object(
      'playerId',player_id,'bullshooterId',bullshooter_id,'name',display_name,'rating',nexus_rating,'nexusPPD',nexus_ppd,'nexusMPR',nexus_mpr,
      'sourceCount',source_count,'independentSourceCount',independent_source_count,'consensusMedian',consensus_median,'evidenceWeight',evidence_weight,'effectiveWeight',effective_weight,
      'sourceRatings',source_ratings,'sourceBaseWeights',source_base_weights,'sourceWeights',source_weights,'agreementFactors',agreement_factors,'outlierFactors',outlier_factors,'independenceFactors',independence_factors,
      'flags',jsonb_build_object('bs',has_bs,'edc',has_edc,'toc',has_toc,'cd',has_cd),
      'evidence',jsonb_build_object('bs501Games',bs_x01,'bsCricketGames',bs_crk,'edcGames',edc_games,'cd501Games',cd_01,'cdCricketGames',cd_crk,'tocPPDSource',toc_ppd_source,'tocMPRSource',toc_mpr_source)
    )) filter(where bullshooter_id is not null and bullshooter_id<>''),'{}'::jsonb),
    'byPlayerId',coalesce(jsonb_object_agg(player_id,jsonb_build_object(
      'playerId',player_id,'bullshooterId',bullshooter_id,'name',display_name,'rating',nexus_rating,'nexusPPD',nexus_ppd,'nexusMPR',nexus_mpr,
      'sourceCount',source_count,'independentSourceCount',independent_source_count,'consensusMedian',consensus_median,'evidenceWeight',evidence_weight,'effectiveWeight',effective_weight,
      'sourceRatings',source_ratings,'sourceBaseWeights',source_base_weights,'sourceWeights',source_weights,'agreementFactors',agreement_factors,'outlierFactors',outlier_factors,'independenceFactors',independence_factors,
      'flags',jsonb_build_object('bs',has_bs,'edc',has_edc,'toc',has_toc,'cd',has_cd),
      'evidence',jsonb_build_object('bs501Games',bs_x01,'bsCricketGames',bs_crk,'edcGames',edc_games,'cd501Games',cd_01,'cdCricketGames',cd_crk,'tocPPDSource',toc_ppd_source,'tocMPRSource',toc_mpr_source)
    )),'{}'::jsonb)
  ) into v_result from enriched;
  return v_result;
end;
$function$;

grant execute on function public.camarillo_nexus_rating_index() to anon, authenticated;
