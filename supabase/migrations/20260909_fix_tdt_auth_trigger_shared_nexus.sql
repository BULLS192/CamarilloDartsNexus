-- Shared-auth coexistence fix for Texas Double Top + NEXUS.
-- Corrects the TDT user_roles conflict target and keeps fictional NEXUS role-view
-- personas out of TDT-specific profile/notification provisioning.

create or replace function tdt.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data->>'nexus_test_persona','false') = 'true' then
    return new;
  end if;

  insert into tdt.profiles(id,display_name)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'display_name', ''))
  on conflict(id) do nothing;

  insert into tdt.user_roles(user_id,role)
  values(new.id,'player')
  on conflict(user_id,role) do nothing;

  insert into tdt.notification_preferences(user_id)
  values(new.id)
  on conflict(user_id) do nothing;

  return new;
end;
$$;
