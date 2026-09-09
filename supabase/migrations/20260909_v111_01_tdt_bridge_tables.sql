-- NEXUS V1.1.1 bridge metadata and external identity links.

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
