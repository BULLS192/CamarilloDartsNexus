-- NEXUS V1.2.1 — Universal League Builder
-- Shared by every organization; no organization-specific league tables.

create table if not exists public.nexus_league_configs (
  competition_id uuid primary key references public.nexus_competitions(id) on delete cascade,
  roster_min integer not null default 1 check (roster_min >= 1),
  roster_max integer check (roster_max is null or roster_max >= roster_min),
  starters_per_match integer not null default 1 check (starters_per_match >= 1),
  allow_substitutes boolean not null default true,
  max_substitutes integer check (max_substitutes is null or max_substitutes >= 0),
  schedule_format text not null default 'single_round_robin'
    check (schedule_format in ('single_round_robin','double_round_robin','custom')),
  points_win numeric not null default 3,
  points_draw numeric not null default 1,
  points_loss numeric not null default 0,
  standings_tiebreakers text[] not null default array['points','leg_diff','legs_for','wins','id']::text[],
  match_format jsonb not null default '{}'::jsonb,
  registration_config jsonb not null default '{}'::jsonb,
  playoff_config jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nexus_league_divisions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.nexus_competitions(id) on delete cascade,
  season_id uuid references public.nexus_seasons(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists nexus_league_division_name_unique
  on public.nexus_league_divisions(
    competition_id,
    coalesce(season_id,'00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

create index if not exists nexus_league_divisions_comp_idx
  on public.nexus_league_divisions(competition_id, season_id, sort_order);

create table if not exists public.nexus_team_divisions (
  team_id uuid primary key references public.nexus_teams(id) on delete cascade,
  division_id uuid not null references public.nexus_league_divisions(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists nexus_team_divisions_division_idx
  on public.nexus_team_divisions(division_id);

create table if not exists public.nexus_schedule_generation_runs (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.nexus_competitions(id) on delete cascade,
  season_id uuid references public.nexus_seasons(id) on delete cascade,
  generated_by_person_id uuid references public.nexus_people(id) on delete set null,
  schedule_format text not null,
  team_count integer not null default 0,
  round_count integer not null default 0,
  match_count integer not null default 0,
  status text not null default 'generated' check (status in ('generated','applied','superseded','cancelled')),
  request jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists nexus_schedule_runs_comp_idx
  on public.nexus_schedule_generation_runs(competition_id, season_id, created_at desc);

-- Guard league config rows so they can only point at league competitions.
create or replace function nexus_private.enforce_league_competition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.nexus_competitions c
    where c.id = new.competition_id and c.competition_type = 'league'
  ) then
    raise exception 'League configuration requires a league competition';
  end if;
  return new;
end;
$$;

revoke all on function nexus_private.enforce_league_competition() from public;

drop trigger if exists nexus_league_configs_type_guard on public.nexus_league_configs;
create trigger nexus_league_configs_type_guard
before insert or update of competition_id on public.nexus_league_configs
for each row execute function nexus_private.enforce_league_competition();

drop trigger if exists nexus_league_divisions_type_guard on public.nexus_league_divisions;
create trigger nexus_league_divisions_type_guard
before insert or update of competition_id on public.nexus_league_divisions
for each row execute function nexus_private.enforce_league_competition();

alter table public.nexus_league_configs enable row level security;
alter table public.nexus_league_divisions enable row level security;
alter table public.nexus_team_divisions enable row level security;
alter table public.nexus_schedule_generation_runs enable row level security;

revoke all on public.nexus_league_configs from anon, authenticated;
revoke all on public.nexus_league_divisions from anon, authenticated;
revoke all on public.nexus_team_divisions from anon, authenticated;
revoke all on public.nexus_schedule_generation_runs from anon, authenticated;

grant select on public.nexus_league_configs to anon, authenticated;
grant insert, update, delete on public.nexus_league_configs to authenticated;
grant select on public.nexus_league_divisions to anon, authenticated;
grant insert, update, delete on public.nexus_league_divisions to authenticated;
grant select on public.nexus_team_divisions to anon, authenticated;
grant insert, update, delete on public.nexus_team_divisions to authenticated;
grant select, insert, update on public.nexus_schedule_generation_runs to authenticated;

create policy nexus_league_configs_read
on public.nexus_league_configs for select to anon, authenticated
using (nexus_private.competition_visible(competition_id));

create policy nexus_league_configs_manage
on public.nexus_league_configs for all to authenticated
using (nexus_private.user_can_manage_competition(competition_id))
with check (nexus_private.user_can_manage_competition(competition_id));

create policy nexus_league_divisions_read
on public.nexus_league_divisions for select to anon, authenticated
using (nexus_private.competition_visible(competition_id));

create policy nexus_league_divisions_manage
on public.nexus_league_divisions for all to authenticated
using (nexus_private.user_can_manage_competition(competition_id))
with check (nexus_private.user_can_manage_competition(competition_id));

create policy nexus_team_divisions_read
on public.nexus_team_divisions for select to anon, authenticated
using (
  exists (
    select 1 from public.nexus_teams t
    where t.id = team_id
      and nexus_private.competition_visible(t.competition_id)
  )
);

create policy nexus_team_divisions_manage
on public.nexus_team_divisions for all to authenticated
using (
  exists (
    select 1 from public.nexus_teams t
    where t.id = team_id
      and nexus_private.user_can_manage_competition(t.competition_id)
  )
)
with check (
  exists (
    select 1 from public.nexus_teams t
    join public.nexus_league_divisions d on d.id = division_id
    where t.id = team_id
      and t.competition_id = d.competition_id
      and (t.season_id is null or d.season_id is null or t.season_id = d.season_id)
      and nexus_private.user_can_manage_competition(t.competition_id)
  )
);

create policy nexus_schedule_runs_read
on public.nexus_schedule_generation_runs for select to authenticated
using (nexus_private.user_can_manage_competition(competition_id));

create policy nexus_schedule_runs_insert
on public.nexus_schedule_generation_runs for insert to authenticated
with check (nexus_private.user_can_manage_competition(competition_id));

create policy nexus_schedule_runs_update
on public.nexus_schedule_generation_runs for update to authenticated
using (nexus_private.user_can_manage_competition(competition_id))
with check (nexus_private.user_can_manage_competition(competition_id));
