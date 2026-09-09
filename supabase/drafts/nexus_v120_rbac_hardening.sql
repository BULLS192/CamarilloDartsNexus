-- NEXUS V1 RBAC hardening applied after nexus_v120_multi_org_rbac.sql.
-- Keeps self-service profile edits narrow and prevents admins from granting/removing Owner.

revoke update on public.nexus_people from authenticated;
grant update (display_name, nickname, city, state) on public.nexus_people to authenticated;

revoke update on public.nexus_organizations from authenticated;
grant update (name, description, metadata) on public.nexus_organizations to authenticated;

drop policy if exists nexus_membership_roles_admin_insert on public.nexus_membership_roles;
create policy nexus_membership_roles_admin_insert on public.nexus_membership_roles
for insert to authenticated
with check (
  exists (
    select 1
    from public.nexus_organization_memberships m
    where m.id = membership_id
      and nexus_private.user_has_org_permission(m.organization_id,'roles.assign')
      and (
        role_code <> 'owner'
        or nexus_private.user_has_org_role(m.organization_id, array['owner'])
      )
  )
);

drop policy if exists nexus_membership_roles_admin_delete on public.nexus_membership_roles;
create policy nexus_membership_roles_admin_delete on public.nexus_membership_roles
for delete to authenticated
using (
  exists (
    select 1
    from public.nexus_organization_memberships m
    where m.id = membership_id
      and nexus_private.user_has_org_permission(m.organization_id,'roles.assign')
      and (
        role_code <> 'owner'
        or nexus_private.user_has_org_role(m.organization_id, array['owner'])
      )
  )
);
