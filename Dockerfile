FROM node:20-bookworm-slim

WORKDIR /app

# Reconstruct the deployment source bundle committed under /bundle.
# The player/contact database is intentionally excluded from this bundle.
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

# Apply persistence/backend verification from V0.7.4.
COPY deploy/patch-v073.mjs /tmp/patch-v073.mjs
RUN node /tmp/patch-v073.mjs && rm /tmp/patch-v073.mjs

# Overlay actively maintained BullShooter parser and bulk-sync assets.
COPY src/bullshooter.js /app/src/bullshooter.js
COPY public/v075.css /app/public/v075.css
COPY deploy/patch-v075.mjs /tmp/patch-v075.mjs
RUN node /tmp/patch-v075.mjs && rm /tmp/patch-v075.mjs

# V0.7.6 base Recent Performance selector support.
COPY deploy/patch-v076.mjs /tmp/patch-v076.mjs
RUN node /tmp/patch-v076.mjs && rm /tmp/patch-v076.mjs

# V0.7.7: align with BullShooter Last 50 / 20 / 10.
COPY public/v077.js /app/public/v077.js
COPY deploy/patch-v077.mjs /tmp/patch-v077.mjs
RUN node /tmp/patch-v077.mjs && rm /tmp/patch-v077.mjs

# V0.7.8: reject bogus DOM values and retain structural diagnostics.
COPY deploy/patch-v078.mjs /tmp/patch-v078.mjs
RUN node /tmp/patch-v078.mjs && rm /tmp/patch-v078.mjs

# V0.7.9: capture BullShooter XHR/fetch JSON and discover the underlying endpoints.
COPY deploy/patch-v079.mjs /tmp/patch-v079.mjs
RUN node /tmp/patch-v079.mjs && rm /tmp/patch-v079.mjs

# V0.7.10: call BullShooter's fetch_games API directly and derive Last 50 / 20 / 10.
COPY deploy/patch-v0710.mjs /tmp/patch-v0710.mjs
RUN node /tmp/patch-v0710.mjs && rm /tmp/patch-v0710.mjs

# V0.7.11: display separate BullShooter and Camarillo rating scores.
COPY public/v0711.js /app/public/v0711.js
COPY public/v0711.css /app/public/v0711.css
COPY deploy/patch-v0711.mjs /tmp/patch-v0711.mjs
RUN node /tmp/patch-v0711.mjs && rm /tmp/patch-v0711.mjs

# V0.8.0 trial: tournament check-in, blind draw/singles bracket, boards, results and advancement.
COPY src/tournament.js /app/src/tournament.js
COPY public/v080t.js /app/public/v080t.js
COPY public/v080t.css /app/public/v080t.css
COPY deploy/patch-v080t.mjs /tmp/patch-v080t.mjs
RUN node --check /app/src/tournament.js \
  && node --check /app/public/v080t.js \
  && node --check /tmp/patch-v080t.mjs \
  && node /tmp/patch-v080t.mjs \
  && rm /tmp/patch-v080t.mjs

RUN npm install --omit=dev && npx playwright install --with-deps chromium
RUN npm run check

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["npm", "start"]
