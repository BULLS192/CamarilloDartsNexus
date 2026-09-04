-- NEXUS Tournament Director V0.12.1 operational persistence access.
-- Reuses the existing competition/match tables and the existing
-- x-camarillo-key authorization function. Browser clients never receive
-- database credentials; public tournament views are served read-only by NEXUS.

alter table public.camarillo_competitions enable row level security;
alter table public.camarillo_matches enable row level security;

-- Explicit Data API grants for the server-side publishable-key client.
revoke all on public.camarillo_competitions from anon;
revoke all on public.camarillo_matches from anon;
grant select, insert, update, delete on public.camarillo_competitions to anon;
grant select, insert, update, delete on public.camarillo_matches to anon;

drop policy if exists camarillo_competitions_server_access on public.camarillo_competitions;
create policy camarillo_competitions_server_access
  on public.camarillo_competitions
  for all
  to anon
  using (public.camarillo_request_authorized())
  with check (public.camarillo_request_authorized());

drop policy if exists camarillo_matches_server_access on public.camarillo_matches;
create policy camarillo_matches_server_access
  on public.camarillo_matches
  for all
  to anon
  using (public.camarillo_request_authorized())
  with check (public.camarillo_request_authorized());

create index if not exists camarillo_competitions_type_status_updated_idx
  on public.camarillo_competitions (type, status, updated_at desc);

create index if not exists camarillo_matches_competition_status_idx
  on public.camarillo_matches (competition_id, status);
