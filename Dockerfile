FROM node:20-bookworm-slim

WORKDIR /app

# Reconstruct the deployment source bundle committed under /bundle.
COPY bundle/ /tmp/camarillo-bundle/
RUN cat \
  /tmp/camarillo-bundle/camarillo.part00 \
  /tmp/camarillo-bundle/camarillo.part00b \
  /tmp/camarillo-bundle/camarillo.part01 \
  /tmp/camarillo-bundle/camarillo.part02 \
  /tmp/camarillo-bundle/camarillo.part04 \
  | base64 -d > /tmp/camarillo-source.tar.gz \
  && tar -xzf /tmp/camarillo-source.tar.gz -C /app \
  && rm -rf /tmp/camarillo-bundle /tmp/camarillo-source.tar.gz

# Apply the proven V0.7 persistence/sync evolution in order.
COPY deploy/patch-v073.mjs /tmp/patch-v073.mjs
RUN node /tmp/patch-v073.mjs && rm /tmp/patch-v073.mjs
COPY src/bullshooter.js /app/src/bullshooter.js
COPY public/v075.css /app/public/v075.css
COPY deploy/patch-v075.mjs /tmp/patch-v075.mjs
RUN node /tmp/patch-v075.mjs && rm /tmp/patch-v075.mjs
COPY deploy/patch-v076.mjs /tmp/patch-v076.mjs
RUN node /tmp/patch-v076.mjs && rm /tmp/patch-v076.mjs
COPY public/v077.js /app/public/v077.js
COPY deploy/patch-v077.mjs /tmp/patch-v077.mjs
RUN node /tmp/patch-v077.mjs && rm /tmp/patch-v077.mjs
COPY deploy/patch-v078.mjs /tmp/patch-v078.mjs
RUN node /tmp/patch-v078.mjs && rm /tmp/patch-v078.mjs
COPY deploy/patch-v079.mjs /tmp/patch-v079.mjs
RUN node /tmp/patch-v079.mjs && rm /tmp/patch-v079.mjs
COPY deploy/patch-v0710.mjs /tmp/patch-v0710.mjs
RUN node /tmp/patch-v0710.mjs && rm /tmp/patch-v0710.mjs
COPY public/v0711.js /app/public/v0711.js
COPY public/v0711.css /app/public/v0711.css
COPY deploy/patch-v0711.mjs /tmp/patch-v0711.mjs
RUN node /tmp/patch-v0711.mjs && rm /tmp/patch-v0711.mjs
COPY deploy/patch-v0712.mjs /tmp/patch-v0712.mjs
RUN node /tmp/patch-v0712.mjs && rm /tmp/patch-v0712.mjs

# V0.8: fast direct API sync, backup/audit foundation, new branding.
COPY src/bullshooter-v080.js /app/src/bullshooter.js
COPY public/v080.js /app/public/v080.js
COPY public/v080.css /app/public/v080.css
COPY public/camarillo-logo.png /app/public/camarillo-logo.png
COPY public/camarillo-logo-full.png /app/public/camarillo-logo-full.png
COPY deploy/patch-v080.mjs /tmp/patch-v080.mjs
RUN node /tmp/patch-v080.mjs && rm /tmp/patch-v080.mjs

# V0.9: PPD / TOC Best-Known cache, history, identity linking and cross-source intelligence.
COPY src/dartstoc-v090.js /app/src/dartstoc.js
COPY public/v090.js /app/public/v090.js
COPY public/v090.css /app/public/v090.css
COPY tests/toc-v090.test.js /app/tests/toc-v090.test.js
COPY deploy/patch-v090.mjs /tmp/patch-v090.mjs
RUN node /tmp/patch-v090.mjs && rm /tmp/patch-v090.mjs

# V0.9.1: decode HTML-encoded ASP.NET pager postbacks so full TOC pagination is crawled.
COPY tests/toc-v091.test.js /app/tests/toc-v091.test.js
COPY deploy/patch-v091.mjs /tmp/patch-v091.mjs
RUN node /tmp/patch-v091.mjs && rm /tmp/patch-v091.mjs

# EDC robustness layer: public EVP stats, source fallback and cross-source diagnostics.
COPY src/edc.js /app/src/edc.js
COPY tests/edc.test.js /app/tests/edc.test.js
COPY deploy/patch-v090-edc.mjs /tmp/patch-v090-edc.mjs
RUN node /tmp/patch-v090-edc.mjs && rm /tmp/patch-v090-edc.mjs

# V0.9.2: visible BullShooter / PPD-TOC / EDC / Nexus source-stat comparison layer.
COPY public/v092-stats.js /app/public/v092-stats.js
COPY public/v092-stats.css /app/public/v092-stats.css
COPY tests/stats-sources-ui.test.js /app/tests/stats-sources-ui.test.js
COPY deploy/patch-v092-stats.mjs /tmp/patch-v092-stats.mjs
RUN node /tmp/patch-v092-stats.mjs && rm /tmp/patch-v092-stats.mjs

# V0.9.3: TOC reliability hardening for 100k+ Best-Known records.
COPY tests/toc-v093.test.js /app/tests/toc-v093.test.js
COPY deploy/patch-v093-toc-reliability.mjs /tmp/patch-v093-toc-reliability.mjs
RUN node /tmp/patch-v093-toc-reliability.mjs && rm /tmp/patch-v093-toc-reliability.mjs

# V0.9.4: manual source linking, raw EDC/TOC directories, robustness and privacy-safe player views.
COPY public/v094-player-intel.js /app/public/v094-player-intel.js
COPY public/v094-player-intel.css /app/public/v094-player-intel.css
COPY tests/player-intel-v094.test.js /app/tests/player-intel-v094.test.js
COPY deploy/patch-v094-player-intel.mjs /tmp/patch-v094-player-intel.mjs
RUN node /tmp/patch-v094-player-intel.mjs && rm /tmp/patch-v094-player-intel.mjs
COPY deploy/patch-v094-confirmed-edc-refresh.mjs /tmp/patch-v094-confirmed-edc-refresh.mjs
RUN node /tmp/patch-v094-confirmed-edc-refresh.mjs && rm /tmp/patch-v094-confirmed-edc-refresh.mjs

# V0.9.5: responsiveness-first background sync; TOC yields to active Nexus users.
COPY tests/performance-v095.test.js /app/tests/performance-v095.test.js
COPY deploy/patch-v095-performance.mjs /tmp/patch-v095-performance.mjs
RUN node /tmp/patch-v095-performance.mjs && rm /tmp/patch-v095-performance.mjs

# V0.9.6: eliminate Players-page request fan-out, mutation/render loops and stats polling; final performance contract verified in-image.
COPY tests/ui-performance-v096.test.js /app/tests/ui-performance-v096.test.js
COPY deploy/patch-v096-ui-performance.mjs /tmp/patch-v096-ui-performance.mjs
RUN node /tmp/patch-v096-ui-performance.mjs && rm /tmp/patch-v096-ui-performance.mjs
COPY deploy/patch-v096-stats-performance.mjs /tmp/patch-v096-stats-performance.mjs
RUN node /tmp/patch-v096-stats-performance.mjs && rm /tmp/patch-v096-stats-performance.mjs

# V0.9.7: indexed/lightweight PPD-TOC lookups; avoid wildcard MPID scans and raw-data reads.
COPY tests/toc-query-v097.test.js /app/tests/toc-query-v097.test.js
COPY deploy/patch-v097-toc-query-performance.mjs /tmp/patch-v097-toc-query-performance.mjs
RUN node /tmp/patch-v097-toc-query-performance.mjs && rm /tmp/patch-v097-toc-query-performance.mjs

# V0.9.8: authorized TOC RPC fast paths, automatic candidate surfacing, request-loop cleanup and correct table column alignment.
COPY tests/player-linking-v098.test.js /app/tests/player-linking-v098.test.js
COPY deploy/patch-v098-player-linking-cleanup.mjs /tmp/patch-v098-player-linking-cleanup.mjs
RUN node /tmp/patch-v098-player-linking-cleanup.mjs && rm /tmp/patch-v098-player-linking-cleanup.mjs

# V0.9.9: canonical PPD/TOC player matching and deterministic Robustness/Actions table layout.
COPY tests/toc-table-v099.test.js /app/tests/toc-table-v099.test.js
COPY deploy/patch-v099-toc-matching-table.mjs /tmp/patch-v099-toc-matching-table.mjs
RUN node /tmp/patch-v099-toc-matching-table.mjs && rm /tmp/patch-v099-toc-matching-table.mjs

# V0.9.10: authorized RPC app-state reads with short server cache and concurrent-read deduplication.
COPY tests/state-read-v0910.test.js /app/tests/state-read-v0910.test.js
COPY deploy/patch-v0910-state-read-stability.mjs /tmp/patch-v0910-state-read-stability.mjs
RUN node /tmp/patch-v0910-state-read-stability.mjs && rm /tmp/patch-v0910-state-read-stability.mjs

# V0.9.11: progressive Stats Sources rendering and selected-player TOC intelligence deduplication.
COPY tests/source-loading-v0911.test.js /app/tests/source-loading-v0911.test.js
COPY deploy/patch-v0911-progressive-source-loading.mjs /tmp/patch-v0911-progressive-source-loading.mjs
RUN node /tmp/patch-v0911-progressive-source-loading.mjs && rm /tmp/patch-v0911-progressive-source-loading.mjs

# V0.9.12 feature set: verified identity aliases, manual RAW source linking and deterministic robustness.
COPY public/v0912-identity.js /app/public/v0912-identity.js
COPY public/v0912-identity.css /app/public/v0912-identity.css
COPY tests/player-identity-v0912.test.js /app/tests/player-identity-v0912.test.js
COPY deploy/patch-v0912-player-identity-robustness.mjs /tmp/patch-v0912-player-identity-robustness.mjs
RUN node /tmp/patch-v0912-player-identity-robustness.mjs && rm /tmp/patch-v0912-player-identity-robustness.mjs

# V0.9.13: make RAW identity enhancement idempotent to prevent MutationObserver feedback loops.
COPY tests/identity-observer-v0913.test.js /app/tests/identity-observer-v0913.test.js
COPY deploy/patch-v0913-identity-safety.mjs /tmp/patch-v0913-identity-safety.mjs
RUN node /tmp/patch-v0913-identity-safety.mjs && rm /tmp/patch-v0913-identity-safety.mjs

# V0.9.14: map robustness rows deterministically from the visible BullShooter ID column.
COPY tests/robustness-mapping-v0914.test.js /app/tests/robustness-mapping-v0914.test.js
COPY deploy/patch-v0914-robustness-mapping.mjs /tmp/patch-v0914-robustness-mapping.mjs
RUN node /tmp/patch-v0914-robustness-mapping.mjs && rm /tmp/patch-v0914-robustness-mapping.mjs

# V0.9.15: durable EDC manual linking, explicit unlink controls, and a single dedicated robustness renderer.
COPY public/v0915-robustness.js /app/public/v0915-robustness.js
COPY tests/source-linking-robustness-v0915.test.js /app/tests/source-linking-robustness-v0915.test.js
COPY deploy/patch-v0915-edc-robustness-unlink.mjs /tmp/patch-v0915-edc-robustness-unlink.mjs
RUN node /tmp/patch-v0915-edc-robustness-unlink.mjs && rm /tmp/patch-v0915-edc-robustness-unlink.mjs

# V0.9.16: server-calculated robustness, row/header visibility repair and snapshot-first EDC persistence.
COPY src/robustness-v0916.js /app/src/robustness.js
COPY public/v0916-robustness.js /app/public/v0916-robustness.js
COPY tests/robustness-edc-v0916.test.js /app/tests/robustness-edc-v0916.test.js
COPY deploy/patch-v0916-server-robustness-edc.mjs /tmp/patch-v0916-server-robustness-edc.mjs
RUN node /tmp/patch-v0916-server-robustness-edc.mjs && rm /tmp/patch-v0916-server-robustness-edc.mjs

# V0.9.17: semantic table-column contract; legacy scripts may not repaint cells by numeric index.
COPY public/v0917-table.js /app/public/v0917-table.js
COPY tests/table-contract-v0917.test.js /app/tests/table-contract-v0917.test.js
COPY deploy/patch-v0917-table-contract.mjs /tmp/patch-v0917-table-contract.mjs
RUN node /tmp/patch-v0917-table-contract.mjs && rm /tmp/patch-v0917-table-contract.mjs

# V0.9.18-V0.9.23: canonical table/robustness contract and guaranteed runtime loader.
COPY src/robustness-v0918.js /app/src/robustness.js
COPY public/v0918-table.js /app/public/v0918-table.js
COPY tests/robustness-formula-v0918.test.js /app/tests/robustness-formula-v0918.test.js
COPY deploy/patch-v0918-robustness-formula.mjs /tmp/patch-v0918-robustness-formula.mjs
RUN node /tmp/patch-v0918-robustness-formula.mjs && rm /tmp/patch-v0918-robustness-formula.mjs

# V0.10.0: SQL-backed multi-source Nexus Rating. Reuse the existing rating column; do not add another table column.
COPY src/nexus-rating-v1000.js /app/src/nexus-rating-v1000.js
COPY public/v1000-rating.js /app/public/v1000-rating.js
COPY public/v1000-rating.css /app/public/v1000-rating.css
COPY tests/nexus-rating-v1000.test.js /app/tests/nexus-rating-v1000.test.js
COPY deploy/patch-v1000-nexus-rating.mjs /tmp/patch-v1000-nexus-rating.mjs
RUN node /tmp/patch-v1000-nexus-rating.mjs && rm /tmp/patch-v1000-nexus-rating.mjs

# Normal sync no longer requires a browser install.
RUN npm install --omit=dev
RUN npm run check

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["npm", "start"]
