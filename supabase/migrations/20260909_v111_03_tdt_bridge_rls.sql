-- NEXUS V1.1.1 bridge RLS.

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
    select p.id
    from public.nexus_people p
    where p.auth_user_id=(select auth.uid())
  )
  or (
    organization_id is not null
    and (select nexus_private.user_has_org_permission(organization_id,'members.view'))
  )
);
