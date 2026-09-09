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
Use only through a browser session the user has legitimately logged into. The collector should never store credentials in GitHub and should not bypass Facebook access controls or anti-bot protections. If the page cannot be reliably read, downgrade the source to manual review.

### `manual_review`
For private/member-only groups where unattended collection is not reliable. A weekly reminder can still tell the operator exactly which sources need review, and pasted/copied post text can then go through the same NEXUS normalization/deduplication pipeline.

## Next implementation wave

1. Add the first real Facebook source URLs to `sources.json`.
2. Classify each source by visibility/collection mode.
3. Build the Playwright capture helper for the sources that can legitimately be opened in the user's browser session.
4. Add NEXUS UI views: **Event Intelligence Inbox**, **Verified Events**, **Sources**, and **Changes**.
5. Add a weekly digest/notification job after the initial source list is proven stable.
