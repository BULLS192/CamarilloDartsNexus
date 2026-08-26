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
      tp.ppd::numeric toc_ppd,tp.mpr::numeric toc_mpr,
      tp.ppd_source,tp.mpr_source,
      (l.player_id is not null and l.confirmed=true) toc_linked
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
  ), form0 as (
    select *,
      (case when bs50_ppd is not null and bs50_mpr is not null then .70 else 0 end
       + case when bs20_ppd is not null and bs20_mpr is not null then .20 else 0 end
       + case when bs10_ppd is not null and bs10_mpr is not null then .10 else 0 end)::numeric bs_den,
      case when bs_current_ppd is not null and bs_current_mpr is not null then bs_current_ppd+10*bs_current_mpr end bs_current_rating,
      case when bs50_ppd is not null and bs50_mpr is not null then bs50_ppd+10*bs50_mpr end bs50_rating,
      case when bs20_ppd is not null and bs20_mpr is not null then bs20_ppd+10*bs20_mpr end bs20_rating,
      case when bs10_ppd is not null and bs10_mpr is not null then bs10_ppd+10*bs10_mpr end bs10_rating
    from raw
  ), form as (
    select *,
      case when bs_den>0 then
        (coalesce(case when bs50_ppd is not null and bs50_mpr is not null then bs50_ppd*.70 end,0)
        +coalesce(case when bs20_ppd is not null and bs20_mpr is not null then bs20_ppd*.20 end,0)
        +coalesce(case when bs10_ppd is not null and bs10_mpr is not null then bs10_ppd*.10 end,0))/bs_den
        when bs_current_rating is not null then bs_current_ppd end bs_ppd,
      case when bs_den>0 then
        (coalesce(case when bs50_ppd is not null and bs50_mpr is not null then bs50_mpr*.70 end,0)
        +coalesce(case when bs20_ppd is not null and bs20_mpr is not null then bs20_mpr*.20 end,0)
        +coalesce(case when bs10_ppd is not null and bs10_mpr is not null then bs10_mpr*.10 end,0))/bs_den
        when bs_current_rating is not null then bs_current_mpr end bs_mpr
    from form0
  ), src0 as (
    select *,
      case when bs_ppd is not null and bs_mpr is not null then bs_ppd+10*bs_mpr end bs_rating,
      case when edc_confirmed and edc_ppd is not null and edc_mpr is not null then edc_ppd+10*edc_mpr end edc_rating,
      case when toc_linked and toc_ppd is not null and toc_mpr is not null then toc_ppd+10*toc_mpr end toc_rating,
      case when (cd_01+cd_crk)>0 and cd_ppd is not null and cd_mpr is not null then cd_ppd+10*cd_mpr end cd_rating,
      case when lower(coalesce(ppd_source,'')||' '||coalesce(mpr_source,'')) ~ '(bull[ -]?shooter|bullshooter\\.live|arachnid)' then .35::numeric else 1::numeric end toc_independence
    from form
  ), src as (
    select *,
      case when bs_rating is null then 0::numeric
        when bs_x01>0 and bs_crk>0 then greatest(.25::numeric,sqrt((least(bs_x01,50)/50)*(least(bs_crk,50)/50)))
        else .25::numeric end bs_reliability,
      case when edc_rating is null then 0::numeric
        when edc_games is null then .65::numeric
        else greatest(.40::numeric,sqrt(least(greatest(edc_games,0),100)/100)) end edc_reliability,
      case when toc_rating is null then 0::numeric else .75::numeric end toc_reliability,
      case when cd_rating is null then 0::numeric
        else greatest(.25::numeric,sqrt(greatest(.01::numeric,least(cd_01,30)/30)*greatest(.01::numeric,least(cd_crk,30)/30))) end cd_reliability
    from src0
  ), rows as (
    select player_id,display_name,bullshooter_id,'bullshooter'::text source,bs_ppd ppd,bs_mpr mpr,bs_rating rating,
      40::numeric priority,bs_reliability reliability,40*bs_reliability base_weight,1::numeric independence,
      null::text ppd_source,null::text mpr_source
    from src where bs_rating is not null
    union all
    select player_id,display_name,bullshooter_id,'edc',edc_ppd,edc_mpr,edc_rating,
      30,edc_reliability,30*edc_reliability,1,null,null
    from src where edc_rating is not null
    union all
    select player_id,display_name,bullshooter_id,'toc',toc_ppd,toc_mpr,toc_rating,
      20,toc_reliability,20*toc_reliability*toc_independence,toc_independence,ppd_source,mpr_source
    from src where toc_rating is not null
    union all
    select player_id,display_name,bullshooter_id,'camarillo',cd_ppd,cd_mpr,cd_rating,
      50,cd_reliability,50*cd_reliability,1,null,null
    from src where cd_rating is not null
  ), med as (
    select player_id,count(*) filter(where independence>=.75) independent_source_count,
      percentile_cont(.5) within group(order by rating) filter(where independence>=.75) median_rating
    from rows group by player_id
  ), factors as (
    select r.*,m.independent_source_count,m.median_rating,
      1::numeric agreement_factor,
      case when m.independent_source_count>=3 and abs(r.rating-m.median_rating)>12 then .50::numeric
           when m.independent_source_count>=3 and abs(r.rating-m.median_rating)>8 then .75::numeric
           else 1::numeric end outlier_factor
    from rows r join med m using(player_id)
  ), weighted as (
    select *,base_weight*outlier_factor final_weight from factors
  ), grouped as (
    select player_id,max(display_name) display_name,max(bullshooter_id) bullshooter_id,
      round(sum(rating*final_weight)/nullif(sum(final_weight),0),1) nexus_rating,
      round((sum(ppd*final_weight)/nullif(sum(final_weight),0))::numeric,2) nexus_ppd,
      round((sum(mpr*final_weight)/nullif(sum(final_weight),0))::numeric,2) nexus_mpr,
      round(sum(base_weight),1) evidence_weight,round(sum(final_weight),1) effective_weight,
      count(*) source_count,max(independent_source_count) independent_source_count,round(max(median_rating)::numeric,1) consensus_median,
      jsonb_build_object(
        'bullshooter',round(max(rating) filter(where source='bullshooter'),1),
        'edc',round(max(rating) filter(where source='edc'),1),
        'toc',round(max(rating) filter(where source='toc'),1),
        'camarillo',coalesce(round(max(rating) filter(where source='camarillo'),1),0)
      ) source_ratings,
      jsonb_build_object(
        'bullshooter',coalesce(max(priority) filter(where source='bullshooter'),0),
        'edc',coalesce(max(priority) filter(where source='edc'),0),
        'toc',coalesce(max(priority) filter(where source='toc'),0),
        'camarillo',coalesce(max(priority) filter(where source='camarillo'),0)
      ) source_priorities,
      jsonb_build_object(
        'bullshooter',coalesce(round(max(reliability) filter(where source='bullshooter'),2),0),
        'edc',coalesce(round(max(reliability) filter(where source='edc'),2),0),
        'toc',coalesce(round(max(reliability) filter(where source='toc'),2),0),
        'camarillo',coalesce(round(max(reliability) filter(where source='camarillo'),2),0)
      ) source_reliability,
      jsonb_build_object(
        'bullshooter',coalesce(round(max(base_weight) filter(where source='bullshooter'),1),0),
        'edc',coalesce(round(max(base_weight) filter(where source='edc'),1),0),
        'toc',coalesce(round(max(base_weight) filter(where source='toc'),1),0),
        'camarillo',coalesce(round(max(base_weight) filter(where source='camarillo'),1),0)
      ) source_base_weights,
      jsonb_build_object(
        'bullshooter',coalesce(round(max(final_weight) filter(where source='bullshooter'),1),0),
        'edc',coalesce(round(max(final_weight) filter(where source='edc'),1),0),
        'toc',coalesce(round(max(final_weight) filter(where source='toc'),1),0),
        'camarillo',coalesce(round(max(final_weight) filter(where source='camarillo'),1),0)
      ) source_weights,
      jsonb_build_object('bullshooter',1,'edc',1,'toc',1,'camarillo',1) agreement_factors,
      jsonb_build_object(
        'bullshooter',coalesce(round(max(outlier_factor) filter(where source='bullshooter'),2),1),
        'edc',coalesce(round(max(outlier_factor) filter(where source='edc'),2),1),
        'toc',coalesce(round(max(outlier_factor) filter(where source='toc'),2),1),
        'camarillo',coalesce(round(max(outlier_factor) filter(where source='camarillo'),2),1)
      ) outlier_factors,
      jsonb_build_object(
        'bullshooter',coalesce(round(max(independence) filter(where source='bullshooter'),2),1),
        'edc',coalesce(round(max(independence) filter(where source='edc'),2),1),
        'toc',coalesce(round(max(independence) filter(where source='toc'),2),1),
        'camarillo',coalesce(round(max(independence) filter(where source='camarillo'),2),1)
      ) independence_factors,
      max(ppd_source) filter(where source='toc') toc_ppd_source,
      max(mpr_source) filter(where source='toc') toc_mpr_source
    from weighted group by player_id
  ), enriched as (
    select g.*,s.bs_x01,s.bs_crk,s.edc_games,s.cd_01,s.cd_crk,s.cd_rating,
      s.bs_current_rating,s.bs50_rating,s.bs20_rating,s.bs10_rating,
      (g.source_ratings->'bullshooter') is not null and (g.source_ratings->>'bullshooter') is not null has_bs,
      (g.source_ratings->'edc') is not null and (g.source_ratings->>'edc') is not null has_edc,
      (g.source_ratings->'toc') is not null and (g.source_ratings->>'toc') is not null has_toc,
      coalesce((g.source_weights->>'camarillo')::numeric,0)>0 has_cd
    from grouped g join src s using(player_id)
  ), entries as (
    select *,jsonb_build_object(
      'playerId',player_id,'bullshooterId',bullshooter_id,'name',display_name,
      'rating',nexus_rating,'nexusPPD',nexus_ppd,'nexusMPR',nexus_mpr,
      'bullshooterWindowRatings',jsonb_build_object('current',round(bs_current_rating,1),'bs50',round(bs50_rating,1),'bs20',round(bs20_rating,1),'bs10',round(bs10_rating,1)),
      'camarilloRating',coalesce(round(cd_rating,1),0),
      'sourceCount',source_count,'independentSourceCount',independent_source_count,'consensusMedian',consensus_median,
      'evidenceWeight',evidence_weight,'effectiveWeight',effective_weight,
      'sourceRatings',source_ratings,'sourcePriorities',source_priorities,'sourceReliability',source_reliability,
      'sourceBaseWeights',source_base_weights,'sourceWeights',source_weights,
      'agreementFactors',agreement_factors,'outlierFactors',outlier_factors,'independenceFactors',independence_factors,
      'flags',jsonb_build_object('bs',has_bs,'edc',has_edc,'toc',has_toc,'cd',has_cd),
      'evidence',jsonb_build_object('bs501Games',bs_x01,'bsCricketGames',bs_crk,'edcGames',edc_games,'cd501Games',cd_01,'cdCricketGames',cd_crk,'tocPPDSource',toc_ppd_source,'tocMPRSource',toc_mpr_source)
    ) payload
    from enriched
  )
  select jsonb_build_object(
    'generatedAt',now(),'formulaVersion','2.0.0','ratingScaleMax',150,
    'formula','Nexus v2: BS form anchor (BS50 70%, BS20 20%, BS10 10%) plus evidence-weighted EDC/TOC/Camarillo; source rating = PPD + 10*MPR; robustness is separate',
    'ratingWeights',jsonb_build_object('bullshooter',40,'edc',30,'toc',20,'camarillo',50),
    'windowWeights',jsonb_build_object('bs50',.70,'bs20',.20,'bs10',.10),
    'camarilloZeroUntilGames',true,
    'count',count(*),
    'byBullshooterId',coalesce(jsonb_object_agg(bullshooter_id,payload) filter(where bullshooter_id is not null and bullshooter_id<>''),'{}'::jsonb),
    'byPlayerId',coalesce(jsonb_object_agg(player_id,payload),'{}'::jsonb)
  ) into v_result from entries;
  return v_result;
end;
$function$;

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
    'metricsVersion','2.0.0',
    'metricsSource','camarillo_player_metrics_index',
    'robustnessFormulaVersion',v_robust->'formulaVersion',
    'robustnessGeneratedAt',v_robust->'generatedAt',
    'robustnessCount',v_robust->'count',
    'byBullshooterId',v_bs,
    'byPlayerId',v_player
  );
end;
$function$;
