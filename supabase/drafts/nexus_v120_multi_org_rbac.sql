-- NEXUS V1 multi-organization + RBAC foundation.
-- Draft only. Promote with Supabase CLI after review/test.
-- Additive: does not alter/delete existing Camarillo player/stat tables.

create extension if not exists pgcrypto;

create table if not exists public.nexus_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  organization_type text not null default 'club'
    check (organization_type in ('platform','club','league','venue','association','business','other')),
  status text not null default 'active'
    check (status in ('active','inactive','archived')),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists public.nexus_person_number_seq start with 1;

create table if not exists public.nexus_people (
  id uuid primary key default gen_random_uuid(),
  nexus_id text not null unique
    default ('NX-' || lpad(nextval('public.nexus_person_number_seq')::text, 7, '0')),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  player_id text unique references public.camarillo_players(player_id) on delete set null,
  display_name text not null,
  nickname text,
  city text,
  state text,
  status text not null default 'active'
    check (status in ('active','inactive','suspended','archived')),
  is_test boolean not null default false,
  force_password_change boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nexus_organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.nexus_organizations(id) on delete cascade,
  person_id uuid not null references public.nexus_people(id) on delete cascade,
  status text not null default 'active'
    check (status in ('invited','active','inactive','suspended')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, person_id)
);

create table if not exists public.nexus_roles (
  code text primary key,
  name text not null,
  rank integer not null,
  description text not null,
  is_active boolean not null default true
);

create table if not exists public.nexus_permissions (
  code text primary key,
  description text not null
);

create table if not exists public.nexus_role_permissions (
  role_code text not null references public.nexus_roles(code) on delete cascade,
  permission_code text not null references public.nexus_permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

create table if not exists public.nexus_membership_roles (
  membership_id uuid not null references public.nexus_organization_memberships(id) on delete cascade,
  role_code text not null references public.nexus_roles(code),
  assigned_at timestamptz not null default now(),
  primary key (membership_id, role_code)
);

create index if not exists nexus_people_auth_user_id_idx on public.nexus_people(auth_user_id);
create index if not exists nexus_people_player_id_idx on public.nexus_people(player_id);
create index if not exists nexus_memberships_org_idx on public.nexus_organization_memberships(organization_id);
create index if not exists nexus_memberships_person_idx on public.nexus_organization_memberships(person_id);
create index if not exists nexus_membership_roles_role_idx on public.nexus_membership_roles(role_code);

insert into public.nexus_roles(code,name,rank,description) values
  ('owner','Owner',100,'Full organization control, including ownership-level settings.'),
  ('admin','Admin',90,'Broad organization administration without ownership transfer/delete authority.'),
  ('league_director','League Director',70,'Runs leagues, seasons, schedules, standings and league results.'),
  ('tournament_director','Tournament Director',70,'Runs tournaments, brackets, check-in, boards and results.'),
  ('captain','Captain',50,'Manages a team roster, lineups and team match actions.'),
  ('player','Player',30,'Competes, submits permitted scores and views player-facing competition data.'),
  ('member','Member',10,'Community membership with basic organization access.')
on conflict (code) do update
set name=excluded.name, rank=excluded.rank, description=excluded.description, is_active=true;

insert into public.nexus_permissions(code,description) values
  ('organization.view','View organization information'),
  ('organization.manage','Edit organization settings and configuration'),
  ('organization.delete','Archive/delete an organization'),
  ('ownership.transfer','Transfer organization ownership'),
  ('members.view','View organization membership directory'),
  ('members.manage','Invite, activate, suspend and remove organization members'),
  ('roles.assign','Assign and remove organization roles'),
  ('leagues.view','View league information'),
  ('leagues.create','Create leagues and seasons'),
  ('leagues.manage','Manage league schedules, divisions, standings and results'),
  ('tournaments.view','View tournament information'),
  ('tournaments.create','Create tournaments'),
  ('tournaments.manage','Manage brackets, check-in, boards and tournament results'),
  ('teams.view','View teams and rosters'),
  ('teams.manage','Manage team roster and lineup'),
  ('scores.submit','Submit match or game scores where eligible'),
  ('scores.confirm','Confirm or approve submitted scores'),
  ('stats.view_self','View own player statistics and history'),
  ('stats.view_org','View organization-level statistics and reporting')
on conflict (code) do update set description=excluded.description;

insert into public.nexus_role_permissions(role_code, permission_code)
select 'owner', code from public.nexus_permissions
on conflict do nothing;

insert into public.nexus_role_permissions(role_code, permission_code) values
  ('admin','organization.view'),('admin','organization.manage'),('admin','members.view'),('admin','members.manage'),('admin','roles.assign'),
  ('admin','leagues.view'),('admin','leagues.create'),('admin','leagues.manage'),('admin','tournaments.view'),('admin','tournaments.create'),('admin','tournaments.manage'),
  ('admin','teams.view'),('admin','teams.manage'),('admin','scores.submit'),('admin','scores.confirm'),('admin','stats.view_self'),('admin','stats.view_org'),
  ('league_director','organization.view'),('league_director','members.view'),('league_director','leagues.view'),('league_director','leagues.create'),('league_director','leagues.manage'),
  ('league_director','teams.view'),('league_director','scores.submit'),('league_director','scores.confirm'),('league_director','stats.view_self'),('league_director','stats.view_org'),
  ('tournament_director','organization.view'),('tournament_director','members.view'),('tournament_director','tournaments.view'),('tournament_director','tournaments.create'),('tournament_director','tournaments.manage'),
  ('tournament_director','teams.view'),('tournament_director','scores.submit'),('tournament_director','scores.confirm'),('tournament_director','stats.view_self'),('tournament_director','stats.view_org'),
  ('captain','organization.view'),('captain','members.view'),('captain','leagues.view'),('captain','tournaments.view'),('captain','teams.view'),('captain','teams.manage'),('captain','scores.submit'),('captain','stats.view_self'),
  ('player','organization.view'),('player','members.view'),('player','leagues.view'),('player','tournaments.view'),('player','teams.view'),('player','scores.submit'),('player','stats.view_self'),
  ('member','organization.view'),('member','leagues.view'),('member','tournaments.view'),('member','teams.view')
on conflict do nothing;

insert into public.nexus_organizations(slug,name,organization_type,description) values
  ('camarillo-darts','Camarillo Darts','platform','Parent organization and operator of NEXUS.'),
  ('space-city-darts','Space City Darts','club','Steel-tip leagues, tournaments and community operations in Greater Houston.'),
  ('texas-double-top','Texas Double Top','league','League organization operating inside the NEXUS multi-organization model.')
on conflict (slug) do update
set name=excluded.name,
    organization_type=excluded.organization_type,
    description=excluded.description,
    status='active',
    updated_at=now();

create schema if not exists nexus_private;

create or replace function nexus_private.user_is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.nexus_people p
    join public.nexus_organization_memberships m on m.person_id = p.id
    where p.auth_user_id = (select auth.uid())
      and m.organization_id = p_org_id
      and m.status = 'active'
  );
$$;

create or replace function nexus_private.user_has_org_role(p_org_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.nexus_people p
    join public.nexus_organization_memberships m on m.person_id = p.id
    join public.nexus_membership_roles mr on mr.membership_id = m.id
    where p.auth_user_id = (select auth.uid())
      and m.organization_id = p_org_id
      and m.status = 'active'
      and mr.role_code = any(p_roles)
  );
$$;

create or replace function nexus_private.user_has_org_permission(p_org_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.nexus_people p
    join public.nexus_organization_memberships m on m.person_id = p.id
    join public.nexus_membership_roles mr on mr.membership_id = m.id
    join public.nexus_role_permissions rp on rp.role_code = mr.role_code
    where p.auth_user_id = (select auth.uid())
      and m.organization_id = p_org_id
      and m.status = 'active'
      and rp.permission_code = p_permission
  );
$$;

create or replace function nexus_private.user_shares_org_with_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.nexus_people me
    join public.nexus_organization_memberships mine on mine.person_id = me.id and mine.status = 'active'
    join public.nexus_organization_memberships theirs on theirs.organization_id = mine.organization_id and theirs.status = 'active'
    where me.auth_user_id = (select auth.uid())
      and theirs.person_id = p_person_id
  );
$$;

revoke all on function nexus_private.user_is_org_member(uuid) from public;
revoke all on function nexus_private.user_has_org_role(uuid,text[]) from public;
revoke all on function nexus_private.user_has_org_permission(uuid,text) from public;
revoke all on function nexus_private.user_shares_org_with_person(uuid) from public;
grant usage on schema nexus_private to authenticated;
grant execute on function nexus_private.user_is_org_member(uuid) to authenticated;
grant execute on function nexus_private.user_has_org_role(uuid,text[]) to authenticated;
grant execute on function nexus_private.user_has_org_permission(uuid,text) to authenticated;
grant execute on function nexus_private.user_shares_org_with_person(uuid) to authenticated;

alter table public.nexus_organizations enable row level security;
alter table public.nexus_people enable row level security;
alter table public.nexus_organization_memberships enable row level security;
alter table public.nexus_roles enable row level security;
alter table public.nexus_permissions enable row level security;
alter table public.nexus_role_permissions enable row level security;
alter table public.nexus_membership_roles enable row level security;

revoke all on public.nexus_organizations from anon, authenticated;
revoke all on public.nexus_people from anon, authenticated;
revoke all on public.nexus_organization_memberships from anon, authenticated;
revoke all on public.nexus_roles from anon, authenticated;
revoke all on public.nexus_permissions from anon, authenticated;
revoke all on public.nexus_role_permissions from anon, authenticated;
revoke all on public.nexus_membership_roles from anon, authenticated;

grant select on public.nexus_organizations to anon, authenticated;
grant update on public.nexus_organizations to authenticated;
grant select, update on public.nexus_people to authenticated;
grant select, insert, update, delete on public.nexus_organization_memberships to authenticated;
grant select on public.nexus_roles to authenticated;
grant select on public.nexus_permissions to authenticated;
grant select on public.nexus_role_permissions to authenticated;
grant select, insert, delete on public.nexus_membership_roles to authenticated;

create policy nexus_orgs_public_read on public.nexus_organizations
for select to anon, authenticated
using (status = 'active');

create policy nexus_orgs_owner_admin_update on public.nexus_organizations
for update to authenticated
using (nexus_private.user_has_org_role(id, array['owner','admin']))
with check (nexus_private.user_has_org_role(id, array['owner','admin']));

create policy nexus_people_shared_org_read on public.nexus_people
for select to authenticated
using (
  auth_user_id = (select auth.uid())
  or nexus_private.user_shares_org_with_person(id)
);

create policy nexus_people_self_update on public.nexus_people
for update to authenticated
using (auth_user_id = (select auth.uid()))
with check (auth_user_id = (select auth.uid()));

create policy nexus_memberships_org_read on public.nexus_organization_memberships
for select to authenticated
using (nexus_private.user_is_org_member(organization_id));

create policy nexus_memberships_admin_insert on public.nexus_organization_memberships
for insert to authenticated
with check (nexus_private.user_has_org_permission(organization_id,'members.manage'));

create policy nexus_memberships_admin_update on public.nexus_organization_memberships
for update to authenticated
using (nexus_private.user_has_org_permission(organization_id,'members.manage'))
with check (nexus_private.user_has_org_permission(organization_id,'members.manage'));

create policy nexus_memberships_admin_delete on public.nexus_organization_memberships
for delete to authenticated
using (nexus_private.user_has_org_permission(organization_id,'members.manage'));

create policy nexus_roles_read on public.nexus_roles
for select to authenticated using (is_active = true);

create policy nexus_permissions_read on public.nexus_permissions
for select to authenticated using (true);

create policy nexus_role_permissions_read on public.nexus_role_permissions
for select to authenticated using (true);

create policy nexus_membership_roles_org_read on public.nexus_membership_roles
for select to authenticated
using (
  exists (
    select 1 from public.nexus_organization_memberships m
    where m.id = membership_id
      and nexus_private.user_is_org_member(m.organization_id)
  )
);

create policy nexus_membership_roles_admin_insert on public.nexus_membership_roles
for insert to authenticated
with check (
  exists (
    select 1 from public.nexus_organization_memberships m
    where m.id = membership_id
      and nexus_private.user_has_org_permission(m.organization_id,'roles.assign')
  )
);

create policy nexus_membership_roles_admin_delete on public.nexus_membership_roles
for delete to authenticated
using (
  exists (
    select 1 from public.nexus_organization_memberships m
    where m.id = membership_id
      and nexus_private.user_has_org_permission(m.organization_id,'roles.assign')
  )
);
