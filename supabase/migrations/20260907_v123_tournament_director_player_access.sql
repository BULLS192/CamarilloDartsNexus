-- NEXUS Tournament Director V0.12.3 player-capture access.
-- The browser never receives Supabase credentials or the Camarillo state token.
-- These policies only authorize server requests carrying the existing x-camarillo-key.

alter table public.camarillo_players enable row level security;

drop policy if exists camarillo_players_server_select on public.camarillo_players;
create policy camarillo_players_server_select
  on public.camarillo_players
  for select
  to anon
  using (public.camarillo_request_authorized());

drop policy if exists camarillo_players_server_insert on public.camarillo_players;
create policy camarillo_players_server_insert
  on public.camarillo_players
  for insert
  to anon
  with check (public.camarillo_request_authorized());

drop policy if exists camarillo_players_server_update on public.camarillo_players;
create policy camarillo_players_server_update
  on public.camarillo_players
  for update
  to anon
  using (public.camarillo_request_authorized())
  with check (public.camarillo_request_authorized());

create index if not exists camarillo_players_bullshooter_id_idx
  on public.camarillo_players (bullshooter_id)
  where bullshooter_id is not null and bullshooter_id <> '';
