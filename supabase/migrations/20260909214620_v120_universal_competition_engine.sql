-- NEXUS V1.2A — Universal Competition Engine
-- Canonical architecture: NEXUS owns engines; organizations own configuration/data.
-- Additive: keeps all existing camarillo_* and tdt.* tables intact.

create extension if not exists pgcrypto;

-- Camarillo Darts is an organization operated on NEXUS, not the platform itself.
update public.nexus_organizations
set organization_type = 'business',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('operates_nexus', true),
    updated_at = now()
where slug = 'camarillo-darts';

-- Expand permissions without changing the seven canonical roles.
insert into public.nexus_permissions(code, description) values
  ('venues.view','View venue information'),
  ('venues.manage','Create and manage organization-linked venues'),
  ('competitions.view','View competitions available to the organization'),
  ('registrations.view_self','View own competition registrations'),
  ('registrations.manage','Review and manage competition registrations'),
  ('matches.view','View competition match schedules and results'),
  ('standings.view','View competition standings and rankings')
on conflict (code) do update set description = excluded.description;

insert into public.nexus_role_permissions(role_code, permission_code)
select 'owner', code from public.nexus_permissions
on conflict do nothing;

insert into public.nexus_role_permissions(role_code, permission_code) values
  ('admin','venues.view'),('admin','venues.manage'),('admin','competitions.view'),('admin','registrations.view_self'),('admin','registrations.manage'),('admin','matches.view'),('admin','standings.view'),
  ('league_director','venues.view'),('league_director','competitions.view'),('league_director','registrations.view_self'),('league_director','registrations.manage'),('league_director','matches.view'),('league_director','standings.view'),
  ('tournament_director','venues.view'),('tournament_director','competitions.view'),('tournament_director','registrations.view_self'),('tournament_director','registrations.manage'),('tournament_director','matches.view'),('tournament_director','standings.view'),
  ('captain','venues.view'),('captain','competitions.view'),('captain','registrations.view_self'),('captain','matches.view'),('captain','standings.view'),
  ('player','venues.view'),('player','competitions.view'),('player','registrations.view_self'),('player','matches.view'),('player','standings.view'),
  ('member','venues.view'),('member','competitions.view'),('member','matches.view'),('member','standings.view')
on conflict do nothing;

create table if not exists public.nexus_platforms (
  key text primary key,
  display_name text not null,
  category text not null default 'other'
    check (category in ('soft_tip_network','steel_tip','scoring','manual','other')),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nexus_venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country_code text not null default 'US',
  latitude numeric,
  longitude numeric,
  website_url text,
  maps_url text,
  status text not null default 'active'
    check (status in ('active','inactive','archived')),
  is_public boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nexus_venue_source_links (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.nexus_venues(id) on delete cascade,
  source_key text not null,
  source_id text not null,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_key, source_id)
);

create table if not exists public.nexus_organization_venues (
  organization_id uuid not null references public.nexus_organizations(id) on delete cascade,
  venue_id uuid not null references public.nexus_venues(id) on delete cascade,
  relationship text not null default 'listed'
    check (relationship in ('home','host','partner','listed','owned','other')),
  is_public boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, venue_id)
);

create table if not exists public.nexus_venue_platforms (
  venue_id uuid not null references public.nexus_venues(id) on delete cascade,
  platform_key text not null references public.nexus_platforms(key),
  board_count integer check (board_count is null or board_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (venue_id, platform_key)
);

create table if not exists public.nexus_venue_boards (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.nexus_venues(id) on delete cascade,
  label text not null,
  board_type text not null check (board_type in ('steel','soft','hybrid','other')),
  platform_key text references public.nexus_platforms(key),
  status text not null default 'active' check (status in ('active','inactive','maintenance','retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, label)
);

create table if not exists public.nexus_organization_modules (
  organization_id uuid not null references public.nexus_organizations(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id, module_key)
);

create table if not exists public.nexus_competition_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.nexus_organizations(id) on delete cascade,
  name text not null,
  competition_type text not null
    check (competition_type in ('league','tournament','weekly_event','sling','special_event')),
  competition_mode text not null default 'singles'
    check (competition_mode in ('singles','doubles','team','mixed')),
  dart_type text not null default 'mixed'
    check (dart_type in ('steel','soft','mixed')),
  platform_key text references public.nexus_platforms(key),
  is_public boolean not null default true,
  active boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  source_key text,
  source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_key, source_id)
);

create table if not exists public.nexus_competitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.nexus_organizations(id) on delete cascade,
  template_id uuid references public.nexus_competition_templates(id) on delete set null,
  venue_id uuid references public.nexus_venues(id) on delete set null,
  parent_competition_id uuid references public.nexus_competitions(id) on delete set null,
  name text not null,
  description text,
  competition_type text not null
    check (competition_type in ('league','tournament','weekly_event','sling','special_event')),
  competition_mode text not null default 'singles'
    check (competition_mode in ('singles','doubles','team','mixed')),
  dart_type text not null default 'mixed'
    check (dart_type in ('steel','soft','mixed')),
  platform_key text references public.nexus_platforms(key),
  status text not null default 'draft'
    check (status in ('draft','published','registration_open','active','completed','cancelled','archived')),
  schedule_type text not null default 'flexible'
    check (schedule_type in ('one_time','recurring','seasonal','flexible')),
  starts_at timestamptz,
  ends_at timestamptz,
  day_of_week smallint check (day_of_week is null or (day_of_week >= 0 and day_of_week <= 6)),
  start_time time,
  recurrence_rule text,
  registration_open boolean not null default false,
  is_public boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_by_person_id uuid references public.nexus_people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nexus_seasons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.nexus_competitions(id) on delete cascade,
  name text not null,
  starts_on date,
  ends_on date,
  registration_deadline timestamptz,
  status text not null default 'upcoming'
    check (status in ('upcoming','registration_open','active','playoffs','completed','archived')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, name)
);

create table if not exists public.nexus_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.nexus_organizations(id) on delete cascade,
  competition_id uuid not null references public.nexus_competitions(id) on delete cascade,
  season_id uuid references public.nexus_seasons(id) on delete cascade,
  name text not null,
  captain_person_id uuid references public.nexus_people(id) on delete set null,
  status text not null default 'active'
    check (status in ('pending','active','inactive','withdrawn','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nexus_team_members (
  team_id uuid not null references public.nexus_teams(id) on delete cascade,
  person_id uuid not null references public.nexus_people(id) on delete cascade,
  member_role text not null default 'player'
    check (member_role in ('captain','player','alternate','coach','manager')),
  status text not null default 'active'
    check (status in ('active','inactive','removed')),
  joined_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (team_id, person_id)
);

create table if not exists public.nexus_competition_participants (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.nexus_competitions(id) on delete cascade,
  season_id uuid references public.nexus_seasons(id) on delete cascade,
  participant_type text not null check (participant_type in ('person','team')),
  person_id uuid references public.nexus_people(id) on delete cascade,
  team_id uuid references public.nexus_teams(id) on delete cascade,
  seed integer check (seed is null or seed > 0),
  status text not null default 'active'
    check (status in ('pending','active','withdrawn','eliminated','completed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (participant_type = 'person' and person_id is not null and team_id is null)
    or (participant_type = 'team' and team_id is not null and person_id is null)
  )
);

create table if not exists public.nexus_registrations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.nexus_competitions(id) on delete cascade,
  season_id uuid references public.nexus_seasons(id) on delete cascade,
  person_id uuid not null references public.nexus_people(id) on delete cascade,
  team_id uuid references public.nexus_teams(id) on delete set null,
  registration_type text not null default 'individual'
    check (registration_type in ('individual','free_agent','team','captain','substitute')),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','waitlist','withdrawn','cancelled')),
  note text,
  reviewed_by_person_id uuid references public.nexus_people(id) on delete set null,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nexus_matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.nexus_competitions(id) on delete cascade,
  season_id uuid references public.nexus_seasons(id) on delete cascade,
  venue_id uuid references public.nexus_venues(id) on delete set null,
  board_id uuid references public.nexus_venue_boards(id) on delete set null,
  round_key text,
  round_number integer,
  match_number integer,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('pending','scheduled','ready','live','pending_confirmation','final','cancelled','disputed','bye')),
  winner_side smallint check (winner_side is null or winner_side in (1,2)),
  format jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nexus_match_sides (
  match_id uuid not null references public.nexus_matches(id) on delete cascade,
  side_no smallint not null check (side_no in (1,2)),
  participant_type text not null default 'tbd' check (participant_type in ('person','team','bye','tbd')),
  person_id uuid references public.nexus_people(id) on delete set null,
  team_id uuid references public.nexus_teams(id) on delete set null,
  seed integer,
  score numeric,
  is_winner boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  primary key (match_id, side_no),
  check (
    (participant_type = 'person' and person_id is not null and team_id is null)
    or (participant_type = 'team' and team_id is not null and person_id is null)
    or (participant_type in ('bye','tbd') and person_id is null and team_id is null)
  )
);

create table if not exists public.nexus_standings (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.nexus_competitions(id) on delete cascade,
  season_id uuid references public.nexus_seasons(id) on delete cascade,
  entity_type text not null check (entity_type in ('person','team')),
  person_id uuid references public.nexus_people(id) on delete cascade,
  team_id uuid references public.nexus_teams(id) on delete cascade,
  rank integer check (rank is null or rank > 0),
  played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  points numeric not null default 0,
  legs_for integer not null default 0,
  legs_against integer not null default 0,
  tiebreak_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (
    (entity_type = 'person' and person_id is not null and team_id is null)
    or (entity_type = 'team' and team_id is not null and person_id is null)
  )
);

create index if not exists nexus_venues_location_idx on public.nexus_venues(state, city);
create index if not exists nexus_org_venues_venue_idx on public.nexus_organization_venues(venue_id);
create index if not exists nexus_venue_source_links_venue_idx on public.nexus_venue_source_links(venue_id);
create index if not exists nexus_venue_boards_venue_idx on public.nexus_venue_boards(venue_id);
create index if not exists nexus_competitions_org_idx on public.nexus_competitions(organization_id, status);
create index if not exists nexus_competitions_venue_idx on public.nexus_competitions(venue_id);
create index if not exists nexus_competitions_type_idx on public.nexus_competitions(competition_type, status);
create index if not exists nexus_seasons_competition_idx on public.nexus_seasons(competition_id, status);
create index if not exists nexus_teams_competition_idx on public.nexus_teams(competition_id, season_id);
create index if not exists nexus_team_members_person_idx on public.nexus_team_members(person_id);
create index if not exists nexus_participants_competition_idx on public.nexus_competition_participants(competition_id, season_id);
create unique index if not exists nexus_participant_person_unique on public.nexus_competition_participants(competition_id, coalesce(season_id,'00000000-0000-0000-0000-000000000000'::uuid), person_id) where person_id is not null;
create unique index if not exists nexus_participant_team_unique on public.nexus_competition_participants(competition_id, coalesce(season_id,'00000000-0000-0000-0000-000000000000'::uuid), team_id) where team_id is not null;
create index if not exists nexus_registrations_person_idx on public.nexus_registrations(person_id, status);
create index if not exists nexus_registrations_comp_idx on public.nexus_registrations(competition_id, season_id, status);
create index if not exists nexus_matches_comp_idx on public.nexus_matches(competition_id, season_id, status);
create index if not exists nexus_matches_schedule_idx on public.nexus_matches(scheduled_at) where scheduled_at is not null;
create index if not exists nexus_standings_comp_idx on public.nexus_standings(competition_id, season_id, rank);
create unique index if not exists nexus_standings_person_unique on public.nexus_standings(competition_id, coalesce(season_id,'00000000-0000-0000-0000-000000000000'::uuid), person_id) where person_id is not null;
create unique index if not exists nexus_standings_team_unique on public.nexus_standings(competition_id, coalesce(season_id,'00000000-0000-0000-0000-000000000000'::uuid), team_id) where team_id is not null;

-- Private authorization helpers used by RLS. Keep out of exposed schemas.
create or replace function nexus_private.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.nexus_people p
  where (select auth.uid()) is not null
    and p.auth_user_id = (select auth.uid())
  limit 1;
$$;

create or replace function nexus_private.user_has_any_org_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.nexus_people p
    join public.nexus_organization_memberships m on m.person_id = p.id and m.status='active'
    join public.nexus_membership_roles mr on mr.membership_id = m.id
    join public.nexus_role_permissions rp on rp.role_code = mr.role_code
    where p.auth_user_id = (select auth.uid())
      and rp.permission_code = p_permission
  );
$$;

create or replace function nexus_private.user_can_create_competition(p_org_id uuid, p_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    nexus_private.user_has_org_permission(p_org_id,'organization.manage')
    or (p_type='league' and nexus_private.user_has_org_permission(p_org_id,'leagues.create'))
    or (p_type in ('tournament','weekly_event','sling','special_event') and nexus_private.user_has_org_permission(p_org_id,'tournaments.create'))
  );
$$;

create or replace function nexus_private.user_can_manage_competition(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.nexus_competitions c
    where c.id = p_competition_id
      and (
        nexus_private.user_has_org_permission(c.organization_id,'organization.manage')
        or (c.competition_type='league' and nexus_private.user_has_org_permission(c.organization_id,'leagues.manage'))
        or (c.competition_type in ('tournament','weekly_event','sling','special_event') and nexus_private.user_has_org_permission(c.organization_id,'tournaments.manage'))
      )
  );
$$;

create or replace function nexus_private.competition_visible(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.nexus_competitions c
    where c.id = p_competition_id
      and (
        (c.is_public and c.status <> 'draft')
        or ((select auth.uid()) is not null and nexus_private.user_is_org_member(c.organization_id))
      )
  );
$$;

create or replace function nexus_private.user_can_manage_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.nexus_teams t
    where t.id = p_team_id
      and (
        nexus_private.user_can_manage_competition(t.competition_id)
        or t.captain_person_id = nexus_private.current_person_id()
      )
  );
$$;

create or replace function nexus_private.venue_visible(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.nexus_venues v
    where v.id = p_venue_id
      and (
        (v.is_public and v.status='active')
        or ((select auth.uid()) is not null and exists (
          select 1 from public.nexus_organization_venues ov
          where ov.venue_id=v.id and nexus_private.user_is_org_member(ov.organization_id)
        ))
      )
  );
$$;

create or replace function nexus_private.user_can_manage_venue(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.nexus_organization_venues ov
    where ov.venue_id = p_venue_id
      and nexus_private.user_has_org_permission(ov.organization_id,'organization.manage')
  );
$$;

create or replace function nexus_private.user_can_self_register(p_competition_id uuid, p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and p_person_id = nexus_private.current_person_id()
    and exists (
      select 1 from public.nexus_competitions c
      where c.id=p_competition_id
        and c.registration_open
        and c.status in ('published','registration_open','active')
        and (
          coalesce((c.settings->>'allow_public_registration')::boolean,false)
          or nexus_private.user_has_org_role(c.organization_id,array['owner','admin','league_director','tournament_director','captain','player'])
        )
    );
$$;

revoke all on function nexus_private.current_person_id() from public;
revoke all on function nexus_private.user_has_any_org_permission(text) from public;
revoke all on function nexus_private.user_can_create_competition(uuid,text) from public;
revoke all on function nexus_private.user_can_manage_competition(uuid) from public;
revoke all on function nexus_private.competition_visible(uuid) from public;
revoke all on function nexus_private.user_can_manage_team(uuid) from public;
revoke all on function nexus_private.venue_visible(uuid) from public;
revoke all on function nexus_private.user_can_manage_venue(uuid) from public;
revoke all on function nexus_private.user_can_self_register(uuid,uuid) from public;

grant usage on schema nexus_private to anon, authenticated;
grant execute on function nexus_private.competition_visible(uuid) to anon, authenticated;
grant execute on function nexus_private.venue_visible(uuid) to anon, authenticated;
grant execute on function nexus_private.current_person_id() to authenticated;
grant execute on function nexus_private.user_has_any_org_permission(text) to authenticated;
grant execute on function nexus_private.user_can_create_competition(uuid,text) to authenticated;
grant execute on function nexus_private.user_can_manage_competition(uuid) to authenticated;
grant execute on function nexus_private.user_can_manage_team(uuid) to authenticated;
grant execute on function nexus_private.user_can_manage_venue(uuid) to authenticated;
grant execute on function nexus_private.user_can_self_register(uuid,uuid) to authenticated;

-- RLS on every public table, with explicit grants for 2026 Data API defaults.
alter table public.nexus_platforms enable row level security;
alter table public.nexus_venues enable row level security;
alter table public.nexus_venue_source_links enable row level security;
alter table public.nexus_organization_venues enable row level security;
alter table public.nexus_venue_platforms enable row level security;
alter table public.nexus_venue_boards enable row level security;
alter table public.nexus_organization_modules enable row level security;
alter table public.nexus_competition_templates enable row level security;
alter table public.nexus_competitions enable row level security;
alter table public.nexus_seasons enable row level security;
alter table public.nexus_teams enable row level security;
alter table public.nexus_team_members enable row level security;
alter table public.nexus_competition_participants enable row level security;
alter table public.nexus_registrations enable row level security;
alter table public.nexus_matches enable row level security;
alter table public.nexus_match_sides enable row level security;
alter table public.nexus_standings enable row level security;

revoke all on public.nexus_platforms from anon, authenticated;
revoke all on public.nexus_venues from anon, authenticated;
revoke all on public.nexus_venue_source_links from anon, authenticated;
revoke all on public.nexus_organization_venues from anon, authenticated;
revoke all on public.nexus_venue_platforms from anon, authenticated;
revoke all on public.nexus_venue_boards from anon, authenticated;
revoke all on public.nexus_organization_modules from anon, authenticated;
revoke all on public.nexus_competition_templates from anon, authenticated;
revoke all on public.nexus_competitions from anon, authenticated;
revoke all on public.nexus_seasons from anon, authenticated;
revoke all on public.nexus_teams from anon, authenticated;
revoke all on public.nexus_team_members from anon, authenticated;
revoke all on public.nexus_competition_participants from anon, authenticated;
revoke all on public.nexus_registrations from anon, authenticated;
revoke all on public.nexus_matches from anon, authenticated;
revoke all on public.nexus_match_sides from anon, authenticated;
revoke all on public.nexus_standings from anon, authenticated;

grant select on public.nexus_platforms to anon, authenticated;
grant select, insert, update on public.nexus_venues to authenticated;
grant select on public.nexus_venues to anon;
grant select on public.nexus_venue_source_links to authenticated;
grant select, insert, update, delete on public.nexus_organization_venues to authenticated;
grant select on public.nexus_organization_venues to anon;
grant select, insert, update, delete on public.nexus_venue_platforms to authenticated;
grant select on public.nexus_venue_platforms to anon;
grant select, insert, update, delete on public.nexus_venue_boards to authenticated;
grant select on public.nexus_venue_boards to anon;
grant select, insert, update, delete on public.nexus_organization_modules to authenticated;
grant select on public.nexus_competition_templates to anon, authenticated;
grant insert, update, delete on public.nexus_competition_templates to authenticated;
grant select on public.nexus_competitions to anon, authenticated;
grant insert, update on public.nexus_competitions to authenticated;
grant select on public.nexus_seasons to anon, authenticated;
grant insert, update on public.nexus_seasons to authenticated;
grant select on public.nexus_teams to anon, authenticated;
grant insert, update on public.nexus_teams to authenticated;
grant select on public.nexus_team_members to anon, authenticated;
grant insert, update, delete on public.nexus_team_members to authenticated;
grant select on public.nexus_competition_participants to anon, authenticated;
grant insert, update, delete on public.nexus_competition_participants to authenticated;
grant select, insert, update, delete on public.nexus_registrations to authenticated;
grant select on public.nexus_matches to anon, authenticated;
grant insert, update on public.nexus_matches to authenticated;
grant select on public.nexus_match_sides to anon, authenticated;
grant insert, update, delete on public.nexus_match_sides to authenticated;
grant select on public.nexus_standings to anon, authenticated;
grant insert, update, delete on public.nexus_standings to authenticated;

create policy nexus_platforms_read on public.nexus_platforms
for select to anon, authenticated using (active);

create policy nexus_venues_read on public.nexus_venues
for select to anon, authenticated using (nexus_private.venue_visible(id));
create policy nexus_venues_insert on public.nexus_venues
for insert to authenticated with check (nexus_private.user_has_any_org_permission('organization.manage'));
create policy nexus_venues_update on public.nexus_venues
for update to authenticated using (nexus_private.user_can_manage_venue(id)) with check (nexus_private.user_can_manage_venue(id));

create policy nexus_venue_sources_read on public.nexus_venue_source_links
for select to authenticated using (nexus_private.venue_visible(venue_id));

create policy nexus_org_venues_read on public.nexus_organization_venues
for select to anon, authenticated using (is_public or nexus_private.user_is_org_member(organization_id));
create policy nexus_org_venues_insert on public.nexus_organization_venues
for insert to authenticated with check (nexus_private.user_has_org_permission(organization_id,'organization.manage'));
create policy nexus_org_venues_update on public.nexus_organization_venues
for update to authenticated using (nexus_private.user_has_org_permission(organization_id,'organization.manage')) with check (nexus_private.user_has_org_permission(organization_id,'organization.manage'));
create policy nexus_org_venues_delete on public.nexus_organization_venues
for delete to authenticated using (nexus_private.user_has_org_permission(organization_id,'organization.manage'));

create policy nexus_venue_platforms_read on public.nexus_venue_platforms
for select to anon, authenticated using (nexus_private.venue_visible(venue_id));
create policy nexus_venue_platforms_manage on public.nexus_venue_platforms
for all to authenticated using (nexus_private.user_can_manage_venue(venue_id)) with check (nexus_private.user_can_manage_venue(venue_id));

create policy nexus_venue_boards_read on public.nexus_venue_boards
for select to anon, authenticated using (nexus_private.venue_visible(venue_id));
create policy nexus_venue_boards_manage on public.nexus_venue_boards
for all to authenticated using (nexus_private.user_can_manage_venue(venue_id)) with check (nexus_private.user_can_manage_venue(venue_id));

create policy nexus_org_modules_read on public.nexus_organization_modules
for select to authenticated using (nexus_private.user_is_org_member(organization_id));
create policy nexus_org_modules_manage on public.nexus_organization_modules
for all to authenticated using (nexus_private.user_has_org_permission(organization_id,'organization.manage')) with check (nexus_private.user_has_org_permission(organization_id,'organization.manage'));

create policy nexus_templates_read on public.nexus_competition_templates
for select to anon, authenticated using (active and (is_public or (organization_id is not null and nexus_private.user_is_org_member(organization_id))));
create policy nexus_templates_insert on public.nexus_competition_templates
for insert to authenticated with check (organization_id is not null and nexus_private.user_has_org_permission(organization_id,'organization.manage'));
create policy nexus_templates_update on public.nexus_competition_templates
for update to authenticated using (organization_id is not null and nexus_private.user_has_org_permission(organization_id,'organization.manage')) with check (organization_id is not null and nexus_private.user_has_org_permission(organization_id,'organization.manage'));
create policy nexus_templates_delete on public.nexus_competition_templates
for delete to authenticated using (organization_id is not null and nexus_private.user_has_org_permission(organization_id,'organization.manage'));

create policy nexus_competitions_read on public.nexus_competitions
for select to anon, authenticated using ((is_public and status <> 'draft') or nexus_private.user_is_org_member(organization_id));
create policy nexus_competitions_insert on public.nexus_competitions
for insert to authenticated with check (nexus_private.user_can_create_competition(organization_id,competition_type));
create policy nexus_competitions_update on public.nexus_competitions
for update to authenticated using (nexus_private.user_can_manage_competition(id)) with check (nexus_private.user_can_manage_competition(id));

create policy nexus_seasons_read on public.nexus_seasons
for select to anon, authenticated using (nexus_private.competition_visible(competition_id));
create policy nexus_seasons_insert on public.nexus_seasons
for insert to authenticated with check (nexus_private.user_can_manage_competition(competition_id));
create policy nexus_seasons_update on public.nexus_seasons
for update to authenticated using (nexus_private.user_can_manage_competition(competition_id)) with check (nexus_private.user_can_manage_competition(competition_id));

create policy nexus_teams_read on public.nexus_teams
for select to anon, authenticated using (nexus_private.competition_visible(competition_id));
create policy nexus_teams_insert on public.nexus_teams
for insert to authenticated with check (nexus_private.user_can_manage_competition(competition_id));
create policy nexus_teams_update on public.nexus_teams
for update to authenticated using (nexus_private.user_can_manage_team(id)) with check (nexus_private.user_can_manage_team(id));

create policy nexus_team_members_read on public.nexus_team_members
for select to anon, authenticated using (exists (select 1 from public.nexus_teams t where t.id=team_id and nexus_private.competition_visible(t.competition_id)));
create policy nexus_team_members_manage on public.nexus_team_members
for all to authenticated using (nexus_private.user_can_manage_team(team_id)) with check (nexus_private.user_can_manage_team(team_id));

create policy nexus_participants_read on public.nexus_competition_participants
for select to anon, authenticated using (nexus_private.competition_visible(competition_id));
create policy nexus_participants_manage on public.nexus_competition_participants
for all to authenticated using (nexus_private.user_can_manage_competition(competition_id)) with check (nexus_private.user_can_manage_competition(competition_id));

create policy nexus_registrations_read on public.nexus_registrations
for select to authenticated using (person_id=nexus_private.current_person_id() or nexus_private.user_can_manage_competition(competition_id));
create policy nexus_registrations_insert on public.nexus_registrations
for insert to authenticated with check (nexus_private.user_can_manage_competition(competition_id) or nexus_private.user_can_self_register(competition_id,person_id));
create policy nexus_registrations_update on public.nexus_registrations
for update to authenticated using (nexus_private.user_can_manage_competition(competition_id) or (person_id=nexus_private.current_person_id() and status in ('pending','waitlist'))) with check (nexus_private.user_can_manage_competition(competition_id) or person_id=nexus_private.current_person_id());
create policy nexus_registrations_delete on public.nexus_registrations
for delete to authenticated using (nexus_private.user_can_manage_competition(competition_id) or (person_id=nexus_private.current_person_id() and status='pending'));

create policy nexus_matches_read on public.nexus_matches
for select to anon, authenticated using (nexus_private.competition_visible(competition_id));
create policy nexus_matches_insert on public.nexus_matches
for insert to authenticated with check (nexus_private.user_can_manage_competition(competition_id));
create policy nexus_matches_update on public.nexus_matches
for update to authenticated using (nexus_private.user_can_manage_competition(competition_id)) with check (nexus_private.user_can_manage_competition(competition_id));

create policy nexus_match_sides_read on public.nexus_match_sides
for select to anon, authenticated using (exists (select 1 from public.nexus_matches m where m.id=match_id and nexus_private.competition_visible(m.competition_id)));
create policy nexus_match_sides_manage on public.nexus_match_sides
for all to authenticated using (exists (select 1 from public.nexus_matches m where m.id=match_id and nexus_private.user_can_manage_competition(m.competition_id))) with check (exists (select 1 from public.nexus_matches m where m.id=match_id and nexus_private.user_can_manage_competition(m.competition_id)));

create policy nexus_standings_read on public.nexus_standings
for select to anon, authenticated using (nexus_private.competition_visible(competition_id));
create policy nexus_standings_manage on public.nexus_standings
for all to authenticated using (nexus_private.user_can_manage_competition(competition_id)) with check (nexus_private.user_can_manage_competition(competition_id));

-- Seed NEXUS-level platform catalogue.
insert into public.nexus_platforms(key,display_name,category,metadata) values
  ('bullshooter','BullShooter','soft_tip_network','{"source":"tdt"}'::jsonb),
  ('dartslive','DARTSLIVE','soft_tip_network','{"source":"tdt"}'::jsonb),
  ('phoenix','Phoenix','soft_tip_network','{"source":"tdt"}'::jsonb),
  ('steel_tip','Steel Tip','steel_tip','{}'::jsonb),
  ('manual','Manual / Unnetworked','manual','{}'::jsonb)
on conflict (key) do update set display_name=excluded.display_name, category=excluded.category, active=true, metadata=public.nexus_platforms.metadata||excluded.metadata, updated_at=now();

-- Import the current TDT venue directory as global NEXUS venues while preserving source provenance.
insert into public.nexus_venues(id,name,address_line1,address_line2,city,state,postal_code,website_url,maps_url,status,is_public,metadata)
select v.id,v.name,v.address_line1,v.address_line2,v.city,v.state,v.postal_code,v.website_url,v.google_maps_url,
       case when v.active then 'active' else 'inactive' end,true,
       jsonb_build_object('imported_from','tdt','legacy_tdt_venue_id',v.id::text)
from tdt.venues v
on conflict (id) do update
set name=excluded.name,address_line1=excluded.address_line1,address_line2=excluded.address_line2,city=excluded.city,state=excluded.state,postal_code=excluded.postal_code,website_url=excluded.website_url,maps_url=excluded.maps_url,status=excluded.status,metadata=public.nexus_venues.metadata||excluded.metadata,updated_at=now();

insert into public.nexus_venue_source_links(venue_id,source_key,source_id,source_url,metadata)
select v.id,'tdt',v.id::text,v.website_url,jsonb_build_object('legacy_table','tdt.venues')
from tdt.venues v
on conflict (source_key,source_id) do update set venue_id=excluded.venue_id,source_url=excluded.source_url,metadata=excluded.metadata,updated_at=now();

insert into public.nexus_organization_venues(organization_id,venue_id,relationship,is_public,metadata)
select o.id,v.id,'listed',true,jsonb_build_object('source','tdt')
from public.nexus_organizations o cross join tdt.venues v
where o.slug='texas-double-top'
on conflict (organization_id,venue_id) do update set relationship=excluded.relationship,is_public=excluded.is_public,metadata=public.nexus_organization_venues.metadata||excluded.metadata,updated_at=now();

insert into public.nexus_venue_platforms(venue_id,platform_key,metadata)
select vp.venue_id,
       case lower(vp.platform) when 'bullshooter' then 'bullshooter' when 'dartslive' then 'dartslive' when 'phoenix' then 'phoenix' end,
       jsonb_build_object('source','tdt')
from tdt.venue_platforms vp
where lower(vp.platform) in ('bullshooter','dartslive','phoenix')
on conflict (venue_id,platform_key) do update set metadata=public.nexus_venue_platforms.metadata||excluded.metadata,updated_at=now();

-- Promote TDT league-type presets into shared NEXUS templates.
insert into public.nexus_competition_templates(id,organization_id,name,competition_type,competition_mode,dart_type,platform_key,is_public,active,configuration,source_key,source_id)
select lt.id,null,
       lt.platform || ' — ' || lt.name,
       'league',lt.competition_mode,'soft',
       case lower(lt.platform) when 'bullshooter' then 'bullshooter' when 'dartslive' then 'dartslive' when 'phoenix' then 'phoenix' end,
       true,lt.active,
       jsonb_build_object(
         'description',lt.description,
         'min_roster',lt.min_roster,
         'max_roster',lt.max_roster,
         'players_per_match',lt.players_per_match,
         'rules_summary',lt.rules_summary,
         'handicap_method',lt.handicap_method,
         'standings',jsonb_build_object('points_win',lt.points_win,'points_draw',lt.points_draw,'points_loss',lt.points_loss)
       ),
       'tdt_league_type',lt.id::text
from tdt.league_types lt
on conflict (id) do update
set name=excluded.name,competition_mode=excluded.competition_mode,dart_type=excluded.dart_type,platform_key=excluded.platform_key,is_public=excluded.is_public,active=excluded.active,configuration=excluded.configuration,source_key=excluded.source_key,source_id=excluded.source_id,updated_at=now();

-- Enable the same core modules for all current organizations. Organizations configure data; NEXUS owns the engine.
insert into public.nexus_organization_modules(organization_id,module_key,enabled,settings)
select o.id,m.module_key,true,'{}'::jsonb
from public.nexus_organizations o
cross join (values
  ('people'),('venues'),('competitions'),('leagues'),('tournaments'),('teams'),('registrations'),('matches'),('standings'),('ratings'),('notifications')
) as m(module_key)
where o.status='active'
on conflict (organization_id,module_key) do nothing;

update public.nexus_organization_integrations
i
set migration_stage=2,
    metadata=coalesce(i.metadata,'{}'::jsonb)||jsonb_build_object('target','nexus_universal_competition_engine','legacy_write_path',true),
    updated_at=now()
from public.nexus_organizations o
where i.organization_id=o.id and o.slug='texas-double-top' and i.integration_key='texas-double-top-v1';
