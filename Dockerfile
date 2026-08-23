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

# Overlay the current BullShooter connector from the repository so parser fixes
# can be deployed without rebuilding the archived application bundle.
COPY src/bullshooter.js /app/src/bullshooter.js

RUN npm install --omit=dev && npx playwright install --with-deps chromium
RUN npm run check

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["npm", "start"]
