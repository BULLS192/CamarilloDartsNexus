# NEXUS V1 — Identity, Organizations and Roles

## Purpose

NEXUS uses one person identity across many darts organizations. A person can belong to multiple organizations and can hold multiple roles inside each organization.

Examples:

- A user can be **Owner + Tournament Director** in Space City Darts.
- The same user can be only a **Player** in Texas Double Top.
- A League Director can also be a Player without needing a second account.

## V1 roles

1. Owner
2. Admin
3. League Director
4. Tournament Director
5. Captain
6. Player
7. Member

Guest/Public remains an unauthenticated state, not a database role.

## Data model

### `nexus_people`
The canonical NEXUS identity. Each row receives a NEXUS ID such as `NX-0000001`.

A person can optionally link to:

- a Supabase Auth user (`auth_user_id`)
- an existing Camarillo player record (`player_id`)

This separates identity from competitive data. Members who are not active players can still have a NEXUS identity.

### `nexus_organizations`
Organizations that operate inside NEXUS. Initial seed organizations:

- Camarillo Darts
- Space City Darts
- Texas Double Top

Future rows can represent leagues, clubs, venues, associations or other darts organizations.

### `nexus_organization_memberships`
Connects a person to an organization. A person's role is never global by default; it is scoped to a membership.

### `nexus_membership_roles`
Allows multiple roles for the same membership.

### `nexus_roles`, `nexus_permissions`, `nexus_role_permissions`
Defines the seven V1 roles as permission presets. Application code should check permissions rather than scatter hard-coded role checks throughout features.

## Temporary test accounts

The file `config/nexus-test-personas.json` defines seven fictional personas for Space City Darts:

- Owner
- Admin
- League Director + Player
- Tournament Director + Player
- Captain + Player
- Player
- Member

These are test identities only. Do not create passwords for real people without their participation.

After the RBAC schema is applied to Supabase, provision the test accounts from a trusted local/server environment:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<server-only-key> \
npm run provision:test-users
```

On Windows PowerShell:

```powershell
$env:SUPABASE_URL="https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<server-only-key>"
npm run provision:test-users
```

The provisioner creates strong random passwords and writes them only to:

`tmp/nexus-test-credentials.json`

The `tmp/` directory is Git-ignored. Never commit or publish this file.

To reset existing test passwords:

```powershell
$env:RESET_EXISTING_TEST_PASSWORDS="1"
npm run provision:test-users
```

## Access Lab

`/access-lab.html` is the first role-view test surface.

Once the schema and test accounts are active, sign in with a test persona. The Access Lab loads:

- NEXUS identity
- organization memberships
- roles for the selected organization
- effective permissions
- modules that should be visible or locked for that user

This lets us validate the Owner/Admin/Director/Captain/Player/Member experience before wiring every production screen to RBAC.

## Existing Basic Auth

The production app currently has a single server-wide Basic Auth gate. V1 RBAC is being developed alongside it so existing functionality is not broken.

Target transition:

1. Keep Basic Auth while Supabase user auth/RBAC is tested.
2. Validate Access Lab and organization isolation.
3. Add NEXUS session-aware navigation to the main app.
4. Retire the server-wide Basic Auth gate once Supabase Auth is the primary login system.

## Real-user onboarding later

For real players/members, use their actual email and an explicit invite/onboarding flow. The intended lifecycle is:

1. Existing person/player record is matched or created.
2. Organization Owner/Admin invites the person.
3. Supabase Auth account is linked to the existing `nexus_people` row.
4. The person sets their own password.
5. Organization roles are assigned to the membership.

The `force_password_change` flag is present for any future controlled temporary-password workflow, but the preferred public onboarding method is an email invite/set-password flow rather than sending permanent shared passwords.

## Security decisions

- Authorization data lives in database membership/role tables, not editable user metadata.
- Service-role keys are server-only.
- All new public-schema tables have RLS enabled in the draft schema.
- Privileged membership lookup helpers live in the non-exposed `nexus_private` schema.
- Security-definer helpers have PUBLIC execution revoked and are granted only to authenticated users.
- Existing Camarillo player/stat tables are not deleted or rewritten by this foundation.

## Development branch

`feature/v120-multi-org-rbac`

The Supabase schema remains a draft until it is reviewed and promoted through the normal migration workflow.
