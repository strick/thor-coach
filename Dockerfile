# Thor v2 — zero-dependency Node 24 app (uses built-in node:sqlite).
# Nothing to `npm install`; the image is just Node + the source.
FROM node:24-slim

# tzdata so TZ=America/New_York resolves to the real zone instead of UTC.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tzdata \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    TZ=America/New_York \
    HOST=0.0.0.0 \
    PORT=3100 \
    THOR_DB_PATH=/data/workout.db

WORKDIR /app

# Source only — no lockfile/deps. /data holds the SQLite DB, WAL and backups
# and is owned by the unprivileged `node` user (uid 1000) so a mounted volume
# stays writable without running as root.
COPY package.json server.js ./
COPY src ./src
COPY public ./public
RUN mkdir -p /data && chown -R node:node /data

USER node
EXPOSE 3100
VOLUME ["/data"]

CMD ["node", "--env-file-if-exists=.env", "server.js"]
