-- Initial real-world NEXUS operating data seed.
-- Idempotent and deliberately conservative: all incomplete events remain draft + non-public.

-- Global starter templates.
insert into public.nexus_competition_templates
  (organization_id, name, competition_type, competition_mode, dart_type, platform_key, is_public, active, configuration, source_key, source_id)
select null, 'NEXUS — Steel Team League (Flexible)', 'league', 'team', 'steel', 'manual', false, true,
       jsonb_build_object('standings',jsonb_build_object('points_win',3,'points_draw',1,'points_loss',0),'schedule_format','single_round_robin','rules_confirmed',false,'description','Generic NEXUS steel-tip team league starter template'),
       'nexus_native','steel-team-league-flex'
where not exists (select 1 from public.nexus_competition_templates where source_key='nexus_native' and source_id='steel-team-league-flex');

insert into public.nexus_competition_templates
  (organization_id, name, competition_type, competition_mode, dart_type, platform_key, is_public, active, configuration, source_key, source_id)
select null, 'NEXUS — Soft Team League (Flexible)', 'league', 'team', 'soft', null, false, true,
       jsonb_build_object('standings',jsonb_build_object('points_win',2,'points_draw',1,'points_loss',0),'schedule_format','single_round_robin','rules_confirmed',false,'description','Generic NEXUS soft-tip team league starter template; platform selected per league'),
       'nexus_native','soft-team-league-flex'
where not exists (select 1 from public.nexus_competition_templates where source_key='nexus_native' and source_id='soft-team-league-flex');

insert into public.nexus_competition_templates
  (organization_id, name, competition_type, competition_mode, dart_type, platform_key, is_public, active, configuration, source_key, source_id)
select null, 'NEXUS — Weekly Blind Draw (Flexible)', 'weekly_event', 'doubles', 'mixed', null, false, true,
       jsonb_build_object('draw_method','blind_draw','team_generation','random_pairs','bracket_format','double_elimination','rules_confirmed',false,'description','Generic recurring blind-draw starter template; bracket format remains configurable'),
       'nexus_native','weekly-blind-draw-flex'
where not exists (select 1 from public.nexus_competition_templates where source_key='nexus_native' and source_id='weekly-blind-draw-flex');

-- Known Space City venues. Location/detail fields stay partial until confirmed.
insert into public.nexus_venues (name, city, state, postal_code, country_code, status, is_public, metadata)
select 'JJ''s Bar','Houston','TX','77084','US','active',false,jsonb_build_object('seed_source','known_space_city_context','details_confirmed',false)
where not exists (select 1 from public.nexus_venues where lower(name)=lower('JJ''s Bar'));

insert into public.nexus_venues (name, city, state, country_code, status, is_public, metadata)
select 'JB''s Pub & Grill','Houston','TX','US','active',false,jsonb_build_object('seed_source','known_space_city_context','details_confirmed',false)
where not exists (select 1 from public.nexus_venues where lower(name)=lower('JB''s Pub & Grill'));

insert into public.nexus_venues (name, city, state, country_code, status, is_public, metadata)
select 'Hot Dog Shop','Houston','TX','US','active',false,jsonb_build_object('seed_source','known_space_city_context','details_confirmed',false)
where not exists (select 1 from public.nexus_venues where lower(name)=lower('Hot Dog Shop'));

insert into public.nexus_organization_venues (organization_id,venue_id,relationship,is_public,metadata)
select o.id,v.id,'host',false,jsonb_build_object('seed_source','known_space_city_context','details_confirmed',false)
from public.nexus_organizations o
join public.nexus_venues v on v.name in ('JJ''s Bar','JB''s Pub & Grill','Hot Dog Shop')
where o.slug='space-city-darts'
on conflict (organization_id,venue_id) do nothing;

-- Draft leagues.
with org as (select id from public.nexus_organizations where slug='space-city-darts'),
     tpl as (select id from public.nexus_competition_templates where source_key='nexus_native' and source_id='steel-team-league-flex' limit 1)
insert into public.nexus_competitions
  (organization_id,template_id,name,description,competition_type,competition_mode,dart_type,platform_key,status,schedule_type,registration_open,is_public,settings)
select org.id,tpl.id,'Space City Steel League','Draft NEXUS league shell for Space City Darts. Schedule, roster, scoring and season details require confirmation.','league','team','steel','manual','draft','seasonal',false,false,
       jsonb_build_object('seed_key','space-city-steel-league','configuration_state','needs_details','rules_confirmed',false,'source','known_space_city_context')
from org,tpl
where not exists (select 1 from public.nexus_competitions where settings->>'seed_key'='space-city-steel-league');

with org as (select id from public.nexus_organizations where slug='texas-double-top'),
     tpl as (select id from public.nexus_competition_templates where source_key='nexus_native' and source_id='soft-team-league-flex' limit 1)
insert into public.nexus_competitions
  (organization_id,template_id,name,description,competition_type,competition_mode,dart_type,platform_key,status,schedule_type,registration_open,is_public,settings)
select org.id,tpl.id,'Texas Double Top League','Draft universal NEXUS league shell derived from the TDT league-management model. Platform and final rules require selection.','league','team','soft',null,'draft','seasonal',false,false,
       jsonb_build_object('seed_key','tdt-universal-league','configuration_state','needs_details','rules_confirmed',false,'source','tdt_migration')
from org,tpl
where not exists (select 1 from public.nexus_competitions where settings->>'seed_key'='tdt-universal-league');

-- Draft recurring events, intentionally not public until confirmed.
with org as (select id from public.nexus_organizations where slug='space-city-darts'),
     tpl as (select id from public.nexus_competition_templates where source_key='nexus_native' and source_id='weekly-blind-draw-flex' limit 1),
     v as (select id from public.nexus_venues where lower(name)=lower('JJ''s Bar') limit 1)
insert into public.nexus_competitions
  (organization_id,template_id,venue_id,name,description,competition_type,competition_mode,dart_type,status,schedule_type,day_of_week,recurrence_rule,registration_open,is_public,settings)
select org.id,tpl.id,v.id,'JJ''s Tuesday Darts','Draft recurring weekly event shell; start time, entry fee, dart type and bracket rules require confirmation.','weekly_event','doubles','mixed','draft','recurring',2,'FREQ=WEEKLY;BYDAY=TU',false,false,
       jsonb_build_object('seed_key','space-city-jjs-tuesday','configuration_state','needs_details','rules_confirmed',false,'source','known_space_city_context')
from org,tpl,v where not exists (select 1 from public.nexus_competitions where settings->>'seed_key'='space-city-jjs-tuesday');

with org as (select id from public.nexus_organizations where slug='space-city-darts'),
     tpl as (select id from public.nexus_competition_templates where source_key='nexus_native' and source_id='weekly-blind-draw-flex' limit 1),
     v as (select id from public.nexus_venues where lower(name)=lower('JJ''s Bar') limit 1)
insert into public.nexus_competitions
  (organization_id,template_id,venue_id,name,description,competition_type,competition_mode,dart_type,status,schedule_type,day_of_week,recurrence_rule,registration_open,is_public,settings)
select org.id,tpl.id,v.id,'JJ''s Sunday Darts','Draft recurring weekly event shell; start time, entry fee, dart type and bracket rules require confirmation.','weekly_event','doubles','mixed','draft','recurring',0,'FREQ=WEEKLY;BYDAY=SU',false,false,
       jsonb_build_object('seed_key','space-city-jjs-sunday','configuration_state','needs_details','rules_confirmed',false,'source','known_space_city_context')
from org,tpl,v where not exists (select 1 from public.nexus_competitions where settings->>'seed_key'='space-city-jjs-sunday');

with org as (select id from public.nexus_organizations where slug='space-city-darts'),
     tpl as (select id from public.nexus_competition_templates where source_key='nexus_native' and source_id='weekly-blind-draw-flex' limit 1),
     v as (select id from public.nexus_venues where lower(name)=lower('Hot Dog Shop') limit 1)
insert into public.nexus_competitions
  (organization_id,template_id,venue_id,name,description,competition_type,competition_mode,dart_type,status,schedule_type,day_of_week,recurrence_rule,registration_open,is_public,settings)
select org.id,tpl.id,v.id,'Hot Dog Shop Wednesday Blind Draw','Draft recurring weekly blind-draw shell; start time, scoring format and dart type require confirmation.','weekly_event','doubles','mixed','draft','recurring',3,'FREQ=WEEKLY;BYDAY=WE',false,false,
       jsonb_build_object('seed_key','space-city-hot-dog-wednesday','configuration_state','needs_details','rules_confirmed',false,'source','known_space_city_context','known_entry_fee_usd',10)
from org,tpl,v where not exists (select 1 from public.nexus_competitions where settings->>'seed_key'='space-city-hot-dog-wednesday');

insert into public.nexus_league_configs
  (competition_id,roster_min,roster_max,starters_per_match,allow_substitutes,max_substitutes,schedule_format,points_win,points_draw,points_loss,standings_tiebreakers,match_format,registration_config,playoff_config,settings)
select c.id,1,null,1,true,null,'single_round_robin',case when c.dart_type='soft' then 2 else 3 end,1,0,
       array['points','leg_diff','legs_for','wins','id']::text[],
       jsonb_build_object('confirmed',false),jsonb_build_object('confirmed',false),jsonb_build_object('confirmed',false),
       jsonb_build_object('configuration_state','needs_details','rules_confirmed',false)
from public.nexus_competitions c
where c.settings->>'seed_key' in ('space-city-steel-league','tdt-universal-league')
  and not exists (select 1 from public.nexus_league_configs lc where lc.competition_id=c.id);
