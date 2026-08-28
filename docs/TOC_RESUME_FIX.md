# TOC resumable sync

Render Free web instances may terminate an idle process after roughly 15 minutes. The TOC crawler now stores its dynamically-expanded unfinished shard queue in sync-run metadata on every checkpoint and loads that queue on the next worker start. This prevents repeated rescanning of the same early shard set after SIGTERM while preserving progressive deduplicated writes and stale-run leasing.
