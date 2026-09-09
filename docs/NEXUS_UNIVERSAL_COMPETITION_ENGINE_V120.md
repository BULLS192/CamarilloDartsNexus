# NEXUS V1.2 — Universal Competition Engine

## Canonical architecture

NEXUS is the platform. Camarillo Darts, Space City Darts, Texas Double Top, and future clubs/leagues/bars are organizations operating on the platform.

A person has one NEXUS identity and can hold different roles in multiple organizations.

```text
NEXUS PLATFORM
  |
  +-- Shared identity + permissions
  +-- Shared venue directory
  +-- Shared competition engine
  +-- Shared team/registration/match/standings engines
  |
  +-- Camarillo Darts
  +-- Space City Darts
  +-- Texas Double Top
  +-- future organizations...
```

Organizations do not own separate implementations of the league or tournament engines. They own configuration and records inside the shared NEXUS engines.

## One person, many organizations

The canonical identity chain remains:

```text
Person -> NEXUS ID -> Organization Membership -> Role(s) -> Permissions
```

The same player can therefore be an Owner in one organization, Tournament Director in another, and Player in a third without creating duplicate accounts or player histories.

## Global venues

Venues are NEXUS-level entities rather than organization-owned duplicates.

`nexus_venues` stores the canonical place. `nexus_organization_venues` records how an organization relates to that venue (home, host, partner, listed, owned, etc.). This allows several organizations to use the same physical bar without creating duplicate venue records.

Venue capabilities are modeled separately through platforms and boards:

- `nexus_platforms`
- `nexus_venue_platforms`
- `nexus_venue_boards`

The initial Texas Double Top venue catalogue was promoted into this global model with source provenance retained.

## Universal competition model

`nexus_competitions` is the shared top-level competition object. Supported V1.2 types are:

- `league`
- `tournament`
- `weekly_event`
- `sling`
- `special_event`

The organization owns the competition record, but the implementation belongs to NEXUS.

Core linked objects:

- `nexus_competition_templates`
- `nexus_competitions`
- `nexus_seasons`
- `nexus_teams`
- `nexus_team_members`
- `nexus_competition_participants`
- `nexus_registrations`
- `nexus_matches`
- `nexus_match_sides`
- `nexus_standings`

This lets Space City and Texas Double Top create competitions side-by-side using the same tables, UI, permissions, and future automation.

## Match engine

League schedules and tournament brackets converge on the same `nexus_matches` table.

Each match has two generic sides in `nexus_match_sides`. A side may resolve to:

- a person
- a team
- a bye
- TBD

This is the foundation for one scoring/results/rating pipeline regardless of whether the match came from a league schedule, bracket, weekly blind draw, or challenge.

## Organization modules

NEXUS implements capabilities once. Each organization can enable/disable modules through `nexus_organization_modules`.

The initial module set is:

- people
- venues
- competitions
- leagues
- tournaments
- teams
- registrations
- matches
- standings
- ratings
- notifications

All three current organizations start with the same modules enabled.

## Role boundaries

The seven canonical organization roles remain unchanged:

1. Owner
2. Admin
3. League Director
4. Tournament Director
5. Captain
6. Player
7. Member

V1.2 extends their granular permissions rather than introducing new roles.

Important competition creation boundaries:

- Owner/Admin: may create/manage all organization competition types.
- League Director: may create/manage leagues, but not tournaments/events.
- Tournament Director: may create/manage tournaments, weekly events, slings, and special events, but not leagues.
- Captain/Player/Member: cannot create organization competitions by default.

These rules are enforced in Postgres RLS/private authorization helpers, not only hidden in the UI.

## Texas Double Top migration

The existing `tdt.*` schema is now migration source material and a temporary write-parity fallback, not the long-term engine.

Stage 2 has been reached:

- TDT identities/roles map to NEXUS.
- TDT venue records are promoted into global NEXUS venues.
- TDT venue/platform mappings are promoted.
- TDT league-type presets are promoted into shared NEXUS competition templates.
- The legacy TDT application remains available while registration, scheduling, results, standings, messaging, and notifications are migrated to shared NEXUS modules.

No working TDT tables were removed or renamed in V1.2A.

## Organization OS V1.2

The Organization OS now reads the universal NEXUS tables for every organization rather than treating TDT as the only organization with operational data.

The first universal write workflow is **Create Competition**. Authorized users can create organization-scoped draft leagues, tournaments, weekly events, slings, or special events using the same form and RLS rules.

## Next build waves

### V1.2B/C — League Engine + League Builder

Generalize the strongest TDT workflows into shared NEXUS features:

- seasons/divisions
- team creation and captain assignment
- rosters/substitutes/free agents
- registration review
- schedule generation and rescheduling
- result submission/confirmation/disputes
- standings/tiebreak rules
- playoffs/qualification rules

Then configure real Space City and Texas Double Top leagues using the same engine.

### V1.2D — Bracket Engine V2

The existing bracket implementation is not considered final. Rebuild around a directed match graph:

```text
Match node
  winner -> destination match/slot
  loser  -> destination match/slot
```

The graph must explicitly handle seeds, byes, losers-bracket drops, rematch avoidance, odd entrant counts, grand-final resets, and deterministic advancement.

Render the same graph as mobile, desktop, TV, and printable bracket views.

### V1.2E/F — Real events and Houston seeding

Once League Builder and Bracket Engine V2 are stable, configure known leagues and recurring weekly tournaments. Real Houston activity becomes the test set for scheduling, venue linking, registration, brackets, standings, and discovery.

### V1.2G — Discover

The universal competition/venue model then powers public discovery such as:

- Darts Tonight
- This Week
- Steel / Soft
- Singles / Doubles / Team
- Blind Draw
- League
- distance / venue filters

## Migration record

The live Supabase migration was applied as:

`20260909214620_v120_universal_competition_engine`

The change was additive and preserved existing Camarillo player/statistics data and all `tdt.*` operational tables.
