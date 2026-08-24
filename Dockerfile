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

# Overlay actively maintained BullShooter parser and V0.7.5 bulk-sync UI assets.
COPY src/bullshooter.js /app/src/bullshooter.js
COPY public/v075.js /app/public/v075.js
COPY public/v075.css /app/public/v075.css
COPY deploy/patch-v075.mjs /tmp/patch-v075.mjs
RUN node /tmp/patch-v075.mjs && rm /tmp/patch-v075.mjs

# V0.7.6: use BullShooter's Recent Performance sample selector for BS10/BS30.
COPY deploy/patch-v076.mjs /tmp/patch-v076.mjs
RUN node /tmp/patch-v076.mjs && rm /tmp/patch-v076.mjs

RUN npm install --omit=dev && npx playwright install --with-deps chromium
RUN npm run check

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["npm", "start"]
