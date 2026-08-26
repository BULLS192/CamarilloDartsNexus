-- V0.9.10: stable authorized app-state read path.
-- The public API still requires the existing x-camarillo-key authorization check.

create or replace function public.camarillo_state_read()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_state jsonb;
begin
  if not public.camarillo_request_authorized() then
    raise exception 'Unauthorized Nexus state read.' using errcode = '42501';
  end if;

  select state
    into v_state
    from public.camarillo_app_state
   where id = 'main';

  if v_state is null then
    raise exception 'Nexus state row is missing.' using errcode = 'P0002';
  end if;

  return v_state;
end;
$$;

revoke all on function public.camarillo_state_read() from public;
grant execute on function public.camarillo_state_read() to anon;
