# Texas Double Top → NEXUS Consolidation Map

## Decision

Texas Double Top is no longer treated as a separate long-term platform. It becomes an organization/tenant inside NEXUS. The existing `TexasDoubleTopApp` remains operational during migration and acts as the source implementation for league-management workflows.

Migration strategy: **strangler / bridge-first**.

1. Shared Supabase Auth and NEXUS identity.
2. TDT becomes an organization inside NEXUS.
3. NEXUS reads TDT operational data through a legacy bridge.
4. Generic NEXUS modules replace TDT-specific modules one workflow at a time.
5. Writes move only after NEXUS reaches feature parity for that workflow.
6. The standalone TDT app is retired only after parity and rollback validation.

## Current TDT product inventory

The standalone React/Vite app currently includes:

- Supabase email/password account creation and recovery
- permanent TDT player IDs and profile editing
- roles: owner, admin, captain, player
- league opportunities / interest collection
- league registration as free agent or team
- team registration roster capture
- captain roster management and captain transfer
- league types and league availability
- venues and dart-platform configuration
- seasons
- teams
- match scheduling and rescheduling
- board / venue assignment
- result submission
- opposing-captain result confirmation
- result disputes and admin resolution
- standings recalculation
- player statistics and rating history
- external dart-system IDs
- announcements
- in-app notifications
- web-push subscriptions and preferences
- messages
- support requests
- message reporting/moderation
- PWA install flow
- director/admin screens

## Database mapping

| TDT source | NEXUS destination | Phase | Current write authority |
|---|---|---:|---|
| `tdt.profiles` | `nexus_people` + organization membership + future player profile extensions | 1 | TDT bridge |
| `tdt.user_roles` | `nexus_membership_roles` | 1 | TDT bridge + NEXUS RBAC |
| `tdt.player_external_ids` | `nexus_external_identity_links` / player source identities | 2 | TDT |
| `tdt.venues` | future `nexus_venues` | 2 | TDT |
| `tdt.venue_platforms` | future venue board/platform capability table | 2 | TDT |
| `tdt.platforms` | NEXUS source/platform catalogue | 2 | TDT |
| `tdt.league_types` | NEXUS competition templates | 2 | TDT |
| `tdt.league_availability` | NEXUS opportunities / discover listings | 2 | TDT |
| `tdt.league_interest` | NEXUS registrations / interest | 2 | TDT |
| `tdt.leagues` | future `nexus_leagues` | 3 | TDT |
| `tdt.seasons` | future `nexus_seasons` | 3 | TDT |
| `tdt.teams` | future `nexus_teams` | 3 | TDT |
| `tdt.team_members` | future `nexus_team_members` | 3 | TDT |
| `tdt.registrations` | future `nexus_registrations` | 3 | TDT |
| `tdt.registration_roster` | future registration roster table | 3 | TDT |
| `tdt.matches` | future generic `nexus_matches` | 4 | TDT |
| `tdt.match_result_submissions` | future NEXUS result workflow / audit events | 4 | TDT |
| `tdt.standings` | derived NEXUS standings | 4 | TDT |
| `tdt.player_stats` | NEXUS player metrics | 5 | TDT |
| `tdt.rating_history` | NEXUS rating history | 5 | TDT |
| `tdt.announcements` | NEXUS organization communications | 5 | TDT |
| `tdt.notifications` | NEXUS notification centre | 5 | TDT |
| `tdt.notification_preferences` | NEXUS notification preferences | 5 | TDT |
| `tdt.push_subscriptions` | NEXUS push-device subscriptions | 5 | TDT |
| `tdt.messages` | NEXUS organization/team messaging | 6 | TDT |
| `tdt.message_reports` | NEXUS moderation | 6 | TDT |
| `tdt.support_requests` | NEXUS support/admin queue | 6 | TDT |

## UI mapping

| Existing TDT screen | NEXUS Organization OS |
|---|---|
| Home | Overview |
| Leagues | Leagues / Discover |
| Schedule | Schedule |
| Stats | My Stats + Organization Analytics |
| Profile | NEXUS Profile |
| Director Center | League Director / Admin workspace |
| Captain Center | Team workspace |
| Notifications | Notification Center |
| Messages | Messages |
| Locations | Venues |
| League Types | Competition Templates |
| Registrations | Registrations |
| Team Management | Teams |
| Result Center | Results |
| Support | Support / Admin queue |

## Role conversion

TDT role mappings during bridge stage:

- `owner` → NEXUS `owner`
- `admin` → NEXUS `admin`
- `captain` → NEXUS `captain`
- `player` → NEXUS `player`

NEXUS adds roles TDT did not previously distinguish:

- League Director
- Tournament Director
- Member

A person can hold multiple roles in the same organization and different roles in different organizations.

## Phase plan

### Phase 1 — Identity + Organization Shell (current)

- TDT organization exists inside NEXUS.
- Existing TDT Auth users receive one NEXUS identity.
- TDT roles bridge into NEXUS roles.
- Organization switcher works for multi-org users.
- NEXUS Organization OS can render a TDT organization context.
- Standalone TDT remains the write path.

### Phase 2 — Directory + Venues + Discover

- generic NEXUS member/player directory
- venue catalogue
- board/platform capabilities
- league opportunities and interest
- organization branding/settings

### Phase 3 — League Core

- generic leagues
- seasons/divisions
- teams/rosters
- registration
- captain workflow

Cutover rule: no TDT league write is moved until NEXUS can recreate the same action and permission boundary.

### Phase 4 — Matches + Standings

- scheduling
- venue/board assignment
- result submission
- opponent confirmation
- disputes
- director override
- standings recalculation
- audit history

### Phase 5 — Player Intelligence + Notifications

- stats
- rating history
- source identities
- announcements
- notification centre
- push subscriptions/preferences

### Phase 6 — Messaging + Retirement

- organization/team messaging
- moderation
- support queue
- redirect TDT app entry point into NEXUS TDT tenant
- archive standalone app after parity sign-off

## Cutover principles

1. Never delete or rename a working TDT table during the bridge period.
2. Every migrated module gets a read-parity check before write cutover.
3. Every write cutover keeps a rollback path to TDT until the next milestone closes.
4. Shared identity is authoritative immediately; league-operation ownership moves gradually.
5. TDT branding is configuration, not architecture.
6. Space City and TDT must consume the same generic NEXUS engine once a module is native.
7. Organization data must remain tenant-scoped through RLS.
8. No duplicate player account is created when an existing Auth user already maps to a NEXUS person.

## V1.1 exit criteria

- [ ] Existing TDT users have NEXUS IDs and TDT memberships.
- [ ] TDT roles map correctly into NEXUS RBAC.
- [ ] Owner test account can switch Space City ↔ TDT without logging out.
- [ ] Player test account can switch Space City ↔ TDT without elevated access.
- [ ] Organization OS renders role-appropriate modules.
- [ ] TDT league/season/team/schedule/standings data can be read through NEXUS.
- [ ] Current TDT app remains unchanged and operational.
- [ ] No existing NEXUS player/stat data is rewritten.
