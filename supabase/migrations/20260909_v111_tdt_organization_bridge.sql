-- NEXUS V1.1.1 — Texas Double Top organization bridge
-- Bridge-first migration: preserve tdt.* as the operational source while NEXUS becomes
-- the shared identity, membership, role, and organization shell.

alter table public.nexus_membership_roles
  add column if not exists assignment_source text not null default 'nexus';

create table if not exists public.nexus_organization_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.nexus_organizations(id) on delete cascade,
  integration_key text not null,
  source_schema text,
  mode text not null default 'legacy_bridge'
    check (mode in ('legacy_bridge','native','external')),
  status text not null default 'active'
    check (status in ('active','paused','retired')),
  migration_stage integer not null default 0 check (migration_stage >= 0),
  launch_url text,
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, integration_key)
);

create table if not exists public.nexus_external_identity_links (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.nexus_people(id) on delete cascade,
  organization_id uuid references public.nexus_organizations(id) on delete cascade,
  source_key text not null,
  source_user_id text not null,
  source_player_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_key, source_user_id)
);

create index if not exists nexus_org_integrations_org_idx
  on public.nexus_organization_integrations(organization_id);
create index if not exists nexus_external_links_person_idx
  on public.nexus_external_identity_links(person_id);
create index if not exists nexus_external_links_org_idx
  on public.nexus_external_identity_links(organization_id);

insert into public.nexus_organization_integrations(
  organization_id, integration_key, source_schema, mode, status,
  migration_stage, launch_url, capabilities, metadata
)
select
  o.id,
  'texas-double-top-v1',
  'tdt',
  'legacy_bridge',
  'active',
  1,
  'https://texas-double-top-app.onrender.com',
  jsonb_build_object(
    'profiles', true,
    'leagues', true,
    'seasons', true,
    'teams', true,
    'registrations', true,
    'schedules', true,
    'results', true,
    'standings', true,
    'notifications', true,
    'messages', true,
    'venues', true
  ),
  jsonb_build_object(
    'strategy', 'strangler',
    'read_path', 'tdt schema',
    'write_path', 'legacy app until each NEXUS module reaches parity'
  )
from public.nexus_organizations o
where o.slug = 'texas-double-top'
on conflict (organization_id, integration_key) do update
set source_schema = excluded.source_schema,
    mode = excluded.mode,
    status = excluded.status,
    migration_stage = excluded.migration_stage,
    launch_url = excluded.launch_url,
    capabilities = excluded.capabilities,
    metadata = excluded.metadata,
    updated_at = now();

create or replace function nexus_private.ensure_tdt_nexus_identity(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_person_id uuid;
  v_membership_id uuid;
  v_profile record;
begin
  select id into v_org_id
  from public.nexus_organizations
  where slug = 'texas-double-top';

  if v_org_id is null then
    raise exception 'Texas Double Top NEXUS organization is missing';
  end if;

  select p.id, p.tdt_player_id, p.display_name, p.nickname, p.city, p.state
    into v_profile
  from tdt.profiles p
  where p.id = p_user_id;

  if not found then
    return null;
  end if;

  insert into public.nexus_people(
    auth_user_id, display_name, nickname, city, state, status, metadata
  ) values (
    p_user_id,
    coalesce(nullif(v_profile.display_name,''), 'TDT Player'),
    v_profile.nickname,
    v_profile.city,
    v_profile.state,
    'active',
    jsonb_build_object('tdt_player_id', v_profile.tdt_player_id, 'identity_source', 'tdt')
  )
  on conflict (auth_user_id) do update
  set display_name = coalesce(nullif(public.nexus_people.display_name,''), excluded.display_name),
      nickname = coalesce(public.nexus_people.nickname, excluded.nickname),
      city = coalesce(public.nexus_people.city, excluded.city),
      state = coalesce(public.nexus_people.state, excluded.state),
      metadata = public.nexus_people.metadata || excluded.metadata,
      updated_at = now()
  returning id into v_person_id;

  insert into public.nexus_organization_memberships(
    organization_id, person_id, status, joined_at
  ) values (v_org_id, v_person_id, 'active', now())
  on conflict (organization_id, person_id) do update
  set status = 'active', updated_at = now()
  returning id into v_membership_id;

  insert into public.nexus_external_identity_links(
    person_id, organization_id, source_key, source_user_id, source_player_id,
    metadata
  ) values (
    v_person_id, v_org_id, 'tdt', p_user_id::text, v_profile.tdt_player_id,
    jsonb_build_object('schema','tdt')
  )
  on conflict (source_key, source_user_id) do update
  set person_id = excluded.person_id,
      organization_id = excluded.organization_id,
      source_player_id = excluded.source_player_id,
      metadata = excluded.metadata,
      updated_at = now();

  insert into public.nexus_membership_roles(membership_id, role_code, assignment_source)
  values (v_membership_id, 'player', 'tdt')
  on conflict (membership_id, role_code) do nothing;

  return v_person_id;
end;
$$;

create or replace function nexus_private.tdt_profile_to_nexus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform nexus_private.ensure_tdt_nexus_identity(new.id);
  return new;
end;
$$;

drop trigger if exists nexus_tdt_profile_bridge on tdt.profiles;
create trigger nexus_tdt_profile_bridge
after insert or update of display_name, nickname, city, state, tdt_player_id
on tdt.profiles
for each row execute function nexus_private.tdt_profile_to_nexus();

create or replace function nexus_private.tdt_role_to_nexus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tdt_role text;
  v_nexus_role text;
  v_org_id uuid;
  v_person_id uuid;
  v_membership_id uuid;
begin
  v_user_id := coalesce(new.user_id, old.user_id);
  v_tdt_role := coalesce(new.role, old.role);
  v_nexus_role := case v_tdt_role
    when 'owner' then 'owner'
    when 'admin' then 'admin'
    when 'captain' then 'captain'
    when 'player' then 'player'
    else null
  end;

  if v_nexus_role is null then
    return coalesce(new, old);
  end if;

  v_person_id := nexus_private.ensure_tdt_nexus_identity(v_user_id);
  if v_person_id is null then
    return coalesce(new, old);
  end if;

  select id into v_org_id from public.nexus_organizations where slug='texas-double-top';
  select id into v_membership_id
  from public.nexus_organization_memberships
  where organization_id=v_org_id and person_id=v_person_id;

  if tg_op = 'DELETE' then
    delete from public.nexus_membership_roles
    where membership_id=v_membership_id
      and role_code=v_nexus_role
      and assignment_source='tdt';
  else
    insert into public.nexus_membership_roles(membership_id, role_code, assignment_source)
    values (v_membership_id, v_nexus_role, 'tdt')
    on conflict (membership_id, role_code) do nothing;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists nexus_tdt_role_bridge on tdt.user_roles;
create trigger nexus_tdt_role_bridge
after insert or delete or update of role
on tdt.user_roles
for each row execute function nexus_private.tdt_role_to_nexus();

-- Backfill every existing TDT profile into the shared NEXUS identity graph.
do $$
declare r record;
begin
  for r in select id from tdt.profiles loop
    perform nexus_private.ensure_tdt_nexus_identity(r.id);
  end loop;
end;
$$;

-- Backfill existing TDT roles as source-managed NEXUS roles.
insert into public.nexus_membership_roles(membership_id, role_code, assignment_source)
select
  m.id,
  case ur.role
    when 'owner' then 'owner'
    when 'admin' then 'admin'
    when 'captain' then 'captain'
    else 'player'
  end,
  'tdt'
from tdt.user_roles ur
join public.nexus_people p on p.auth_user_id=ur.user_id
join public.nexus_organizations o on o.slug='texas-double-top'
join public.nexus_organization_memberships m
  on m.person_id=p.id and m.organization_id=o.id
where ur.role in ('owner','admin','captain','player')
on conflict (membership_id, role_code) do nothing;

-- Give two fictional NEXUS personas a TDT context so organization switching can
-- be tested without touching any real player's access.
insert into tdt.profiles(id, display_name, state)
select u.id, 'NEXUS Owner Test', 'TX'
from auth.users u
where lower(u.email)=lower('owner.test@nexus.invalid')
on conflict (id) do nothing;

insert into tdt.user_roles(user_id, role)
select u.id, 'owner'
from auth.users u
where lower(u.email)=lower('owner.test@nexus.invalid')
on conflict (user_id, role) do nothing;

insert into tdt.profiles(id, display_name, state)
select u.id, 'NEXUS Player Test', 'TX'
from auth.users u
where lower(u.email)=lower('player.test@nexus.invalid')
on conflict (id) do nothing;

insert into tdt.user_roles(user_id, role)
select u.id, 'player'
from auth.users u
where lower(u.email)=lower('player.test@nexus.invalid')
on conflict (user_id, role) do nothing;

alter table public.nexus_organization_integrations enable row level security;
alter table public.nexus_external_identity_links enable row level security;

revoke all on public.nexus_organization_integrations from anon, authenticated;
revoke all on public.nexus_external_identity_links from anon, authenticated;
grant select, insert, update, delete on public.nexus_organization_integrations to authenticated;
grant select on public.nexus_external_identity_links to authenticated;

drop policy if exists nexus_org_integrations_read on public.nexus_organization_integrations;
create policy nexus_org_integrations_read
on public.nexus_organization_integrations
for select to authenticated
using ((select nexus_private.user_is_org_member(organization_id)));

drop policy if exists nexus_org_integrations_manage on public.nexus_organization_integrations;
create policy nexus_org_integrations_manage
on public.nexus_organization_integrations
for all to authenticated
using ((select nexus_private.user_has_org_permission(organization_id,'organization.manage')))
with check ((select nexus_private.user_has_org_permission(organization_id,'organization.manage')));

drop policy if exists nexus_external_links_read on public.nexus_external_identity_links;
create policy nexus_external_links_read
on public.nexus_external_identity_links
for select to authenticated
using (
  person_id in (
    select p.id from public.nexus_people p
    where p.auth_user_id=(select auth.uid())
  )
  or (
    organization_id is not null
    and (select nexus_private.user_has_org_permission(organization_id,'members.view'))
  )
);
