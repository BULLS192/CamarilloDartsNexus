# NEXUS Dart Event Intelligence

This resource is the shared event-discovery layer for NEXUS organizations. It begins with Facebook dart groups/pages, but the data model is source-agnostic so websites, Discords, tournament platforms, calendars and organizer pages can feed the same event store later.

## Why this exists

Meta removed the Facebook Groups API in April 2024. NEXUS therefore does not depend on a Facebook Groups API integration. Collection is deliberately separated from normalization and storage:

1. **Source registry** — tracks the pages/groups worth checking.
2. **Collection** — public-web retrieval where possible; authenticated-browser/manual review where Facebook requires a logged-in member view.
3. **Normalization** — converts a post into a consistent event record.
4. **Deduplication** — merges reposts and repeated sightings of the same event.
5. **Review** — candidate events can be reviewed before becoming verified/published.
6. **Distribution** — verified events can later feed NEXUS calendars, maps, organization pages, alerts and weekly digests.

## Files

- `data/event-intelligence/sources.json` — monitored-source registry.
- `data/event-intelligence/events.json` — normalized event store.
- `src/event-intelligence.js` — normalization, fingerprints and merge logic.
- `scripts/event-intelligence-ingest.mjs` — CLI for adding sources and importing event batches.
- `scripts/event-intelligence-capture.mjs` — read-only Playwright capture helper.

Local page captures are written under `data/event-intelligence/inbox/` and intentionally ignored by Git because visible Facebook post text may include names or other public/member-visible content that should not be committed to the public repository.

## Source fields

Each source can record:

- `name`
- `platform`
- `sourceType` (`facebook_group`, `facebook_page`, `website`, etc.)
- `url`
- `visibility` (`public`, `member`, `private`, `unknown`)
- `collectionMode` (`public_web`, `authenticated_browser`, `manual_review`)
- `cadence` (default `weekly`)
- `region`
- `organizationScope` (zero or more NEXUS organizations)
- check/success/error timestamps

Do not store Facebook passwords, cookies or tokens in this repository.

## Event fields

Normalized records include title, game type, frequency, date/time, venue/address, city/state/country, entry fee, payout, organizer/contact, source/post URLs, raw visible post text, review status, confidence, first/last seen timestamps and tags.

### Status lifecycle

`candidate` -> `reviewed` -> `verified` -> `published`

Use `cancelled` when a source later reports cancellation.

## Deduplication

The first-pass fingerprint is based on normalized:

`title + venue + city + state + event date`

This catches most reposts across multiple groups. Future versions should add fuzzy matching for renamed/reworded posts and recurring-event series IDs.

## CLI

```bash
npm run intel:add-source -- "https://www.facebook.com/groups/..." "Houston Darts Group" public public_web "Greater Houston"
npm run intel:sources
npm run intel:capture
npm run intel:ingest -- ./incoming-events.json
npm run intel:events
```

Example import file:

```json
[
  {
    "title": "Tuesday Blind Draw",
    "startAt": "2026-09-15T19:30:00-05:00",
    "venue": "Example Bar",
    "city": "Houston",
    "state": "TX",
    "gameType": "501",
    "entryFee": 10,
    "sourceName": "Example Facebook Group",
    "sourceUrl": "https://www.facebook.com/groups/...",
    "sourcePostUrl": "https://www.facebook.com/groups/.../posts/...",
    "rawText": "Visible text from the event post",
    "confidence": 0.85
  }
]
```

## Playwright capture

`npm run intel:capture` checks every active Facebook source whose collection mode is not `manual_review`, records a read-only snapshot of the visible page text, calculates a content hash, and reports whether the visible page changed since the previous capture.

For sources that genuinely require a member login, set the source to `authenticated_browser` and use a dedicated local Playwright profile:

```powershell
$env:NEXUS_FB_PROFILE_DIR="$HOME\.nexus-facebook-profile"
$env:NEXUS_INTEL_HEADLESS="0"
npm run intel:capture
```

On the first run, log into Facebook yourself in that dedicated browser window. NEXUS does not collect or store your Facebook password. After the profile is established, the same profile can be reused locally. If Facebook blocks or challenges automated access, mark that source `manual_review` rather than attempting to bypass the control.

For public pages/groups, leave the source as `public_web`.

## Weekly operating model

Recommended cadence: one weekly discovery pass, then event-specific rechecks as dates approach.

A weekly run should:

1. Check every active source.
2. Compare visible posts since the prior successful run.
3. Extract only dart-event candidates.
4. Normalize and deduplicate them.
5. Flag ambiguous records for review instead of guessing.
6. Highlight new events, changed dates/venues/fees and cancellations.
7. Generate a concise weekly digest.

## Collection modes

### `public_web`
Use when the content is visible without account-only access. This is the best candidate for unattended checking.

### `authenticated_browser`
Use only through a browser session the user has legitimately logged into. The collector never stores credentials in GitHub and must not bypass Facebook access controls or anti-bot protections. If the page cannot be reliably read, downgrade the source to manual review.

### `manual_review`
For private/member-only groups where unattended collection is not reliable. A weekly reminder can still identify exactly which sources need review, and pasted/copied post text can then go through the same NEXUS normalization/deduplication pipeline.

## Current implementation status

Implemented:

- Source registry
- Normalized event store
- Deterministic first-pass deduplication
- Source/event ingest CLI
- Read-only Playwright page capture with change detection
- Local-only capture inbox and state file
- Event-intelligence unit test
- NPM commands wired into the project check suite

Next wave:

1. Add the first real Facebook source URLs to `sources.json`.
2. Classify each source by visibility/collection mode.
3. Run the first capture against those real groups and tune selectors/extraction around actual Facebook output.
4. Add post-level parsing so one changed group page produces structured event candidates automatically.
5. Add NEXUS UI views: **Event Intelligence Inbox**, **Verified Events**, **Sources**, and **Changes**.
6. Add the weekly digest/notification schedule once the first sources are proven stable.
