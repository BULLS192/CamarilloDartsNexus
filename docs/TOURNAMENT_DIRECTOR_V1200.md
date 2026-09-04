# NEXUS Tournament Director V0.12.0

This release adds an isolated tournament-bracket foundation modeled on the same tournament mechanics used by PrintYourBrackets, while keeping NEXUS branding and implementation independent.

## Included

- Single elimination for 2–128 participants.
- Double elimination for 3–128 participants.
- Seeded and blind-draw/randomized entry modes.
- Power-of-two bracket expansion with first-round byes.
- Permanent match numbers and `W#` / `L#` routing labels.
- Winner's Bracket and Loser's Bracket separation.
- Conditional "If First Loss" grand-final reset.
- Interactive winner advancement and conservative undo.
- Printable bracket view.
- Optional loading of names from the existing `/api/players` endpoint.
- Regression coverage for every field size through 128 participants.

## Bracket invariants

- Single elimination: `N - 1` played matches.
- Double elimination: `2N - 2` minimum played matches; `2N - 1` if the reset final is required.
- Byes never count as played matches.
- A virtual bye match does not create a loser in the Loser's Bracket.
- The reset final activates only when the Loser's Bracket finalist defeats the undefeated Winner's Bracket finalist in the first championship match.

## Safety / rollout

The feature is developed on `feature/nexus-tournament-director-v1` and is added through the existing Docker patch chain. The current NEXUS player/rating/sync code is not replaced. The existing home page only receives a lightweight Tournament Director entry link.

## Next layer

The bracket graph is designed to accept NEXUS competition IDs, board assignments, scores, handicaps, doubles team formation, payout logic, and persistent tournament state in a later integration pass.
