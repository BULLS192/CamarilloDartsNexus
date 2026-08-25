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

# Normal sync no longer requires a browser install.
RUN npm install --omit=dev
RUN npm run check

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["npm", "start"]
