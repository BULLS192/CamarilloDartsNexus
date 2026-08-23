# Camarillo Darts V0.7.1

GitHub-ready starter platform for a BullShooter-centered dart player database, handicapped competitions, weekly events, leagues and tournaments.

## What is included

### V0.1.1 foundation — Player database
- Editable first/last name, nickname, gender, email, phone, city/state, home venue and notes.
- BullShooter ID attached to the Camarillo player identity.
- BullShooter sync never overwrites Camarillo identity/contact fields.
- Current BullShooter PPD/MPR plus recent-game-derived BS30/BS10 when the live page can be parsed.

### V0.2 — Competition Manager
- Weekly, one-off, league and season competition records.
- Round robin, league/weekly round robin and single-elimination first-round generation.
- Best-of setting, discipline, X01 base, handicap mode and handicap strength.
- Participants can be selected from the permanent player database.
- Optional rating freeze at match generation/check-in.

### V0.3 — Match Engine
- Generated matches with round/match numbers.
- Board assignment.
- Frozen rating/handicap snapshot stored on each match.
- Scratch, Forward, Reverse Equivalent and Reverse Lite X01 handicaps.
- Cricket spot marks.
- Sanctioned game entry updates match score and Camarillo rolling averages.
- Best-of matches auto-finalize when the required wins are reached.

### V0.4 — BullShooter Match Sync (experimental)
- Sync both players in a scheduled match.
- Scrape recent Cricket and 01 table rows from `bullshooter.live`.
- Look for games whose opponent BullShooter ID matches the scheduled opponent.
- Review/import candidate games into Camarillo.

**Important:** `bullshooter.live` is a dynamically rendered community site with no documented public API. This connector is intentionally isolated in `src/bullshooter.js`. It may need selector/parser tuning as the site changes. Do not make the external site your only historical database.

### V0.5 — Tournament / League tracking
- Round-robin standings: played, wins, losses, games for/against and points.
- Single-elimination winner progression after all matches in a round are complete.
- Shared competition/player/game model so one-offs, weekly events and leagues all feed the same career history.

### V0.6 — Player Intelligence
- Handicap PPD and MPR.
- Combined Camarillo rating.
- BS current / BS30 / BS10.
- Camarillo career / CD30 / CD10.
- Rating history after BullShooter syncs, games and competition freezes.
- Head-to-head summaries.
- Career feat totals.

### V0.7 — Feats + Google Sheets mirror
- Track 180, 9 Mark, White Horse, Hat Trick, High Ton, Low Ton and custom feats.
- Count and verification fields.
- Full database export endpoint.
- Google Sheets Web App push bridge.
- Matching Excel/Google Sheets database template.

## Handicap model

External BullShooter data starts the player rating. Camarillo gradually takes over:

- 0–9 Camarillo games: 75% external / 25% Camarillo rolling performance.
- 10–19: 50% / 50%.
- 20–29: 25% / 75%.
- 30+: Camarillo rolling 30.
- A stronger last-10 can modestly raise the working handicap as recent-form protection.

X01 supports:
- `scratch`
- `forward`
- `reverse-equivalent`
- `reverse-lite`

Default compensation is 70%.

## Run on Windows

Use Command Prompt in the project folder:

```bat
npm install
npx playwright install chromium
npm start
```

Open:

```text
http://localhost:8787
```

If PowerShell blocks `npm.ps1`, use `cmd` or run `npm.cmd` / `npx.cmd`.

## Upgrade from V0.1.1

If you already have real players in V0.1.1:

1. Stop the old server.
2. Back up the old `data/db.json`.
3. Install/extract V0.7 into a new folder.
4. Replace V0.7 `data/db.json` with your V0.1.1 file.
5. Start V0.7.

The V0.7 store normalizes missing collections/settings automatically. Keep a backup before migrating.

## Google Sheets database

The package includes:

```text
google-sheets/AppsScript.gs
```

And a companion workbook:

```text
Camarillo_Darts_Google_Sheets_Database_V0.7.xlsx
```

### Connect the app to Google Sheets

1. Open the Camarillo Darts Database Google Sheet.
2. Go to **Extensions > Apps Script**.
3. Replace the default Code.gs with `google-sheets/AppsScript.gs`.
4. Deploy > **New deployment > Web app**.
5. Execute as yourself and choose an access setting suitable for your deployment.
6. Copy the deployment URL ending in `/exec`.
7. In Camarillo Darts, open **Google Sheets**.
8. Paste the Web App URL and click **Save URL**.
9. Click **Push Full Database to Google Sheets**.

The sync rewrites these mirrored tabs:
- Players
- BullShooter Snapshots
- Competitions
- Matches
- Games
- Feats
- Rating History
- Settings

Keep custom reporting/calculations on separate tabs so a full database sync does not replace them.

## Data ownership / backup

During this local-development phase, `data/db.json` is the application database. Commit code to GitHub, but normally do **not** publish a real player database containing private emails/phone numbers in a public repository.

Recommended:
- Keep `data/db.json` private/backed up.
- Use the Google Sheets mirror for audit/reporting.
- Before public multi-user deployment, migrate the operational database to Supabase/Postgres with authentication and role-based access.

## Testing

```bat
npm run check
```

This validates JavaScript syntax and core handicap/rating tests.

## Known V0.7 limitations

- BullShooter sync depends on the current rendered structure of `bullshooter.live` and must be validated on your computer.
- Recent opponent/game extraction is intentionally marked experimental.
- Single-elimination is functional at a starter level; advanced seeding, byes, reseeding and double elimination should be hardened before a high-stakes event.
- Google Sheets is a mirror, not a transactional multi-user database. Supabase/Postgres remains the recommended future backend.


## Deployment-ready patch (V0.7.1)

This build adds:
- Optional HTTP Basic Auth via `ADMIN_USER` and `ADMIN_PASSWORD`.
- An unauthenticated `/health` endpoint for hosting health checks.
- Optional `DB_PATH` environment variable for a persistent disk/volume.
- `Dockerfile`, `.dockerignore`, and `render.yaml` for Docker-based hosting.

### Deploy on Render

1. Push this repository to GitHub.
2. In Render, create a new **Blueprint** or **Web Service** from the GitHub repository.
3. Use the included Dockerfile / `render.yaml`.
4. Set `ADMIN_USER` and a strong `ADMIN_PASSWORD` in Render environment variables.
5. Deploy. Render will provide the public HTTPS URL.
6. For real persistent data, attach a persistent disk/volume and set `DB_PATH` to a file on that mount (for example `/var/data/db.json`), or migrate the operational database to Supabase/Postgres.

**Important:** without a persistent disk/database, hosted `data/db.json` can be lost on redeploy/restart. Also keep the repository private if it ever contains real player contact data.
