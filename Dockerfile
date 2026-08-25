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

# Normal sync no longer requires a browser install.
RUN npm install --omit=dev
RUN npm run check

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["npm", "start"]
