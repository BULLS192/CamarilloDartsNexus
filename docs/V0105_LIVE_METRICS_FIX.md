# V0.10.5 Live Metrics Repair

Production validation found two independent causes of missing Player-table metrics:

1. Live BullShooter cells can expose IDs as text such as `#267261Synced ...`; the V0.10.4 renderer required a trailing word boundary after the digits, so most rows did not resolve to their player/metrics record.
2. `camarillo_player_metrics_index()` originally merged Robustness only into players already present in the Nexus Rating index, hiding valid Robustness-only records.

V0.10.5 removes the trailing word-boundary requirement, adds a primary-name/gender-safe fallback, cache-busts the unified runtime, and updates production Supabase metrics aggregation to union Rating and Robustness keys.

The Nexus Rating and Robustness formulas are unchanged.
