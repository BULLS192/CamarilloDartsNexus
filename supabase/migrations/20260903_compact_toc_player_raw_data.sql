-- Contain Supabase storage growth by removing duplicated TOC fields from raw_data.
-- Core player fields remain in dedicated columns; raw_data retains only diagnostics
-- that are not otherwise represented in camarillo_toc_players.

create or replace function public.camarillo_compact_toc_player_raw_data()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.raw_data := jsonb_strip_nulls(jsonb_build_object(
    'ratingComputed', new.raw_data -> 'ratingComputed',
    'ratingValidationDelta', new.raw_data -> 'ratingValidationDelta',
    'sourcePage', new.raw_data -> 'sourcePage',
    'sourcePosition', new.raw_data -> 'sourcePosition',
    'sourceUrl', new.raw_data -> 'sourceUrl',
    'parserVersion', new.raw_data -> 'parserVersion'
  ));
  return new;
end;
$$;

drop trigger if exists camarillo_toc_players_compact_raw_data on public.camarillo_toc_players;
create trigger camarillo_toc_players_compact_raw_data
before insert or update of raw_data on public.camarillo_toc_players
for each row execute function public.camarillo_compact_toc_player_raw_data();
