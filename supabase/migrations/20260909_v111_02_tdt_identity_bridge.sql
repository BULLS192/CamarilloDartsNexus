-- NEXUS V1.1.1 identity and role bridge for Texas Double Top.

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

  if not found then return null; end if;

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
  set nickname = coalesce(public.nexus_people.nickname, excluded.nickname),
      city = coalesce(public.nexus_people.city, excluded.city),
      state = coalesce(public.nexus_people.state, excluded.state),
      metadata = public.nexus_people.metadata || excluded.metadata,
      updated_at = now()
  returning id into v_person_id;

  insert into public.nexus_organization_memberships(
    organization_id, person_id, status, joined_at
  ) values (v_org_id, v_person_id, 'active', now())
  on conflict (organization_id, person_id) do update
  set status='active', updated_at=now()
  returning id into v_membership_id;

  insert into public.nexus_external_identity_links(
    person_id, organization_id, source_key, source_user_id, source_player_id, metadata
  ) values (
    v_person_id, v_org_id, 'tdt', p_user_id::text, v_profile.tdt_player_id,
    jsonb_build_object('schema','tdt')
  )
  on conflict (source_key, source_user_id) do update
  set person_id=excluded.person_id,
      organization_id=excluded.organization_id,
      source_player_id=excluded.source_player_id,
      metadata=excluded.metadata,
      updated_at=now();

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
  if tg_op='DELETE' then
    v_user_id := old.user_id;
    v_tdt_role := old.role;
  else
    v_user_id := new.user_id;
    v_tdt_role := new.role;
  end if;

  v_nexus_role := case v_tdt_role
    when 'owner' then 'owner'
    when 'admin' then 'admin'
    when 'captain' then 'captain'
    when 'player' then 'player'
    else null
  end;

  if v_nexus_role is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  v_person_id := nexus_private.ensure_tdt_nexus_identity(v_user_id);
  if v_person_id is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  select id into v_org_id from public.nexus_organizations where slug='texas-double-top';
  select id into v_membership_id
  from public.nexus_organization_memberships
  where organization_id=v_org_id and person_id=v_person_id;

  if tg_op='DELETE' then
    delete from public.nexus_membership_roles
    where membership_id=v_membership_id
      and role_code=v_nexus_role
      and assignment_source='tdt';
    return old;
  end if;

  insert into public.nexus_membership_roles(membership_id, role_code, assignment_source)
  values (v_membership_id, v_nexus_role, 'tdt')
  on conflict (membership_id, role_code) do nothing;
  return new;
end;
$$;

drop trigger if exists nexus_tdt_role_bridge on tdt.user_roles;
create trigger nexus_tdt_role_bridge
after insert or delete or update of role
on tdt.user_roles
for each row execute function nexus_private.tdt_role_to_nexus();

-- Existing TDT profiles become NEXUS people and TDT organization members.
do $$
declare r record;
begin
  for r in select id from tdt.profiles loop
    perform nexus_private.ensure_tdt_nexus_identity(r.id);
  end loop;
end;
$$;

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

-- Fictional accounts for multi-organization testing only.
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
