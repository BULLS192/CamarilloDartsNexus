-- Camarillo Darts Nexus V0.9
-- PPD / TOC Best-Known intelligence cache, history, identity links and sync audit.

create extension if not exists pg_trgm with schema extensions;

create or replace function public.camarillo_request_authorized()
returns boolean
language sql
stable
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      coalesce((current_setting('request.headers', true)::jsonb ->> 'x-camarillo-key'), ''),
      'sha256'
    ),
    'hex'
  ) = '4e410e6ff099e9b73e989e78e3d63c3dd3a411f37956a0acc959d5efd9d50210';
$$;

revoke all on function public.camarillo_request_authorized() from public;
grant execute on function public.camarillo_request_authorized() to anon;

create table if not exists public.camarillo_toc_players (
  toc_id text primary key,
  mpid text,
  player_name text not null,
  normalized_name text not null,
  sex text,
  rating numeric,
  ppd numeric,
  ppd_source text,
  ppd_source_url text,
  mpr numeric,
  mpr_source text,
  mpr_source_url text,
  vendor text,
  vendor_state text,
  showdown boolean,
  toc_eligible boolean,
  toc_header text,
  toc_season text,
  player_url text,
  signature text not null,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists public.camarillo_toc_snapshots (
  snapshot_id text primary key,
  toc_id text not null references public.camarillo_toc_players(toc_id) on delete cascade,
  captured_at timestamptz not null default now(),
  signature text not null,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists public.camarillo_player_toc_links (
  player_id text primary key,
  toc_id text not null references public.camarillo_toc_players(toc_id) on delete restrict,
  mpid text,
  confirmed boolean not null default true,
  match_method text not null default 'manual',
  confidence text not null default 'confirmed',
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.camarillo_external_sync_runs (
  run_id text primary key,
  source text not null,
  status text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  pages integer not null default 0,
  rows_seen integer not null default 0,
  unique_rows integer not null default 0,
  changed_rows integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists camarillo_toc_players_name_idx on public.camarillo_toc_players (normalized_name);
create index if not exists camarillo_toc_players_state_idx on public.camarillo_toc_players (vendor_state);
create index if not exists camarillo_toc_players_rating_idx on public.camarillo_toc_players (rating desc nulls last);
create index if not exists camarillo_toc_players_active_idx on public.camarillo_toc_players (active, player_name);
create index if not exists camarillo_toc_players_name_trgm_idx on public.camarillo_toc_players using gin (player_name extensions.gin_trgm_ops);
create index if not exists camarillo_toc_players_vendor_trgm_idx on public.camarillo_toc_players using gin (vendor extensions.gin_trgm_ops);
create index if not exists camarillo_toc_snapshots_toc_time_idx on public.camarillo_toc_snapshots (toc_id, captured_at desc);
create index if not exists camarillo_external_sync_runs_source_time_idx on public.camarillo_external_sync_runs (source, started_at desc);

alter table public.camarillo_toc_players enable row level security;
alter table public.camarillo_toc_snapshots enable row level security;
alter table public.camarillo_player_toc_links enable row level security;
alter table public.camarillo_external_sync_runs enable row level security;

revoke all on public.camarillo_toc_players from anon;
revoke all on public.camarillo_toc_snapshots from anon;
revoke all on public.camarillo_player_toc_links from anon;
revoke all on public.camarillo_external_sync_runs from anon;
grant select, insert, update, delete on public.camarillo_toc_players to anon;
grant select, insert, update, delete on public.camarillo_toc_snapshots to anon;
grant select, insert, update, delete on public.camarillo_player_toc_links to anon;
grant select, insert, update, delete on public.camarillo_external_sync_runs to anon;

drop policy if exists camarillo_toc_players_access on public.camarillo_toc_players;
create policy camarillo_toc_players_access on public.camarillo_toc_players
  for all to anon
  using (public.camarillo_request_authorized())
  with check (public.camarillo_request_authorized());

drop policy if exists camarillo_toc_snapshots_access on public.camarillo_toc_snapshots;
create policy camarillo_toc_snapshots_access on public.camarillo_toc_snapshots
  for all to anon
  using (public.camarillo_request_authorized())
  with check (public.camarillo_request_authorized());

drop policy if exists camarillo_player_toc_links_access on public.camarillo_player_toc_links;
create policy camarillo_player_toc_links_access on public.camarillo_player_toc_links
  for all to anon
  using (public.camarillo_request_authorized())
  with check (public.camarillo_request_authorized());

drop policy if exists camarillo_external_sync_runs_access on public.camarillo_external_sync_runs;
create policy camarillo_external_sync_runs_access on public.camarillo_external_sync_runs
  for all to anon
  using (public.camarillo_request_authorized())
  with check (public.camarillo_request_authorized());
