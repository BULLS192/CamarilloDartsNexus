create index if not exists camarillo_toc_players_mpid_idx
  on public.camarillo_toc_players (mpid);

analyze public.camarillo_toc_players;
