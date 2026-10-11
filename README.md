# ⚡ Thor v2

Your AI health pal: tracks training (lifting + running), food, and health, and gives
warm, straight, evidence-based guidance personalized to your profile, meds and data.
Complete rewrite of the old
6-container `thor-stack` as **one Node 24 process with zero npm dependencies** —
built-in `node:sqlite`, `fetch`, and `http` replace better-sqlite3, Express, the
OpenAI SDK, Docker, and the agent/MCP containers.

## Run

First, create your `.env`:

```bash
cp .env.example .env   # fill in OPENAI_API_KEY (and Strava creds if you use sync)
```

Then pick either way to run it:

**Bare Node 24** — no install, no build:

```bash
npm start              # → http://localhost:3100
```

**Docker** — Node 24 pinned, restarts on boot, `America/New_York` timezone:

```bash
docker compose up -d --build   # → http://localhost:3100
docker compose logs -f         # follow logs
docker compose down            # stop
```

The image is a single `node:24-slim` container (still zero npm deps) that bind-mounts
`./data`, so the SQLite database and backups live on the host and survive rebuilds.

### Runs automatically

- **Docker:** `docker-compose.yml` sets `restart: unless-stopped`, so the container
  comes back after reboots and crashes as long as the Docker daemon is running.
- **Bare Node:** installed as a systemd user service (`~/.config/systemd/user/thor.service`,
  lingering enabled) so it starts whenever the distro boots, with a silent Windows
  Startup script (`thor-wsl.vbs`) booting the distro at logon. Manage it with:

  ```bash
  systemctl --user status|restart|stop thor
  journalctl --user -u thor -f     # logs
  ```

## What replaced what

| Old (6 containers) | New |
| --- | --- |
| thor-api (Express + better-sqlite3) | `server.js` + `src/` (node:http + node:sqlite) |
| thor-web (static server) | same process, `public/` |
| thor-agent, health-agent, meta-runner, health-mcp | one tool-calling loop: `src/services/chat.js` → `/api/chat` |
| docker-compose, 6 Dockerfiles | `npm start` — or one optional container |

## Features

- **Health-pal voice** — every AI feature shares one persona and safety layer (`src/services/persona.js`): warm and straight, names wins, describes patterns honestly with numbers, explains the *why*, suggests one or two things to try. It interprets data and labs with stated confidence and flags red-flag symptoms, but never diagnoses or tells you to change a prescription.
- **Health profile** — conditions, allergies, family history, goals, diet style, doctor notes, and a medications & supplements list. Every summary, chat answer and lab read is personalized with it (`src/services/healthContext.js` builds the data snapshot each prompt sees).
- **Dashboard** — activity streak, week stats, AI quick-log, **tap-to-log today's plan** (prefilled with your last session, one-tap "Same as last", updates in place mid-workout), macro bars, an evening daily summary (today at a glance, wins, patterns from your last 7/30 days, food & heart health, training & recovery, one or two things to try tomorrow), Strava one-tap + auto-sync, reflections
- **Trends** — weekly lifting volume, per-exercise weight progression, weekly mileage, pace trend, protein vs target and calories for the last 14 logged days (zero-dep SVG charts)
- **Workouts** — natural-language logging via LLM (`"3x12 floor press @45"`), manual logging, history with inline edit/delete, progression trends, weekly AI summaries
- **Nutrition** — natural-language food logging with USDA-style estimates, meals/items, DASH-oriented targets (sodium, sat fat, cholesterol, fiber), templates, per-user goals
- **Food library** — 131 seeded common foods with exact USDA-style per-serving values (searchable, categorized); tap to build a picks tray with serving steppers and live totals, then log it as a meal or save it straight as a template. Add/delete your own custom foods. Library logging bypasses the LLM entirely — consistent numbers every time.
- **Running** — manual logs + **Strava sync** (refresh token persisted & rotated in DB, single-day or 30/90-day backfill), stats, weekly mileage
- **Body** — daily weigh-ins from the dashboard, 60-day trend chart, fed into daily insights
- **Water** — tap-to-fill glass tracker on the dashboard (8 oz each, configurable daily goal), logged by date, used in summaries and CSV export
- **Goals** — weekly workout/mileage/volume targets with live progress on the dashboard stats
- **Mid-workout** — rest timer with beep (auto-starts after each logged set), progressive-overload nudges ("50 lbs for 6 sessions — load 55 today"), editable workout plan (add/rename/move/delete exercises per day)
- **Health** — structured headache log (start/end, severity, type, location, aura, symptoms, medicine taken and whether it helped, suspected triggers) with a fixed "get care now" alert for red-flag symptoms; a ~20-second daily check-in (sleep, stress, energy, caffeine, alcohol); a **patterns** view that compares headache-day rates with and without each factor (sleep, stress, caffeine, alcohol, sodium, water, meal timing, heavy lifting, long/hard runs) using simple statistics with minimum-sample guards — the AI only narrates it; and a medication-overuse check based on ICHD-3 thresholds
- **Labs** — upload a lab PDF or photos, or paste from your patient portal; the AI transcribes every row and you review/edit before anything counts. ~60 markers with aliases, unit conversion to US units (A1c, lipids, glucose, creatinine, vitamin D…), latest values with range bars, trends, and an automatic plain-English explainer per report (out of range, what changed, levers you control, questions for your doctor). Critical values get a fixed server-side banner.
- **Guides** — a library of explainers written from your own data: a weekly health review (training, running, food, headaches, sleep — written Sunday evening/Monday, or on demand), lab explainers, and deep dives on any question you ask. Each stores the data snapshot the model saw.
- **Barcode scanning** — camera (Chrome BarcodeDetector) or manual entry → OpenFoodFacts lookup → picks tray or library
- **Export** — one-click CSV (workouts, nutrition, running, body, water, headaches, check-ins, labs) and full JSON dump from Settings
- **Ask Thor** — chat with tool-calling over all of the above (logging, labs, headache patterns, guides), aware of your profile and meds. History is kept server-side across reloads ("New conversation" starts fresh), and long-term **memory** ("remember my doctor wants LDL under 100") is visible and deletable on the Ask Thor and Profile pages
- **Settings** — connection status, AI model per job (persisted), users, link to your health profile

## Configuration

All via `.env` (see `.env.example`). LLM provider defaults to OpenAI when
`OPENAI_API_KEY` is set. Jobs are split in two:

- **Advice** (daily summary, weekly review, chat, guides, lab extraction) defaults to
  `OPENAI_ADVICE_MODEL` (default `gpt-5-mini`; set it to any chat-completions model
  your account has — if the default isn't available Thor falls back to `OPENAI_MODEL`
  and logs a warning).
- **Parsing** (workout and food text) stays on `OPENAI_MODEL` (default `gpt-4o-mini`).

Any job can be re-routed (provider + model) from Settings → AI models; overrides are
saved in the database and survive restarts. Models that reject `temperature` or
`reasoning_effort` have them dropped automatically. Ollama is reached through its
OpenAI-compatible `/v1` endpoint.

## Privacy

When OpenAI is the provider, each advice request sends the relevant slice of your
data to the OpenAI API: health profile, medications, summaries of food, training,
running and health logs, and (for lab extraction) uploaded lab files. See OpenAI's
API data-usage policy for how API data is handled. Routing jobs to Ollama keeps them
on your machine (lab PDFs need an OpenAI model; pasted lab text works locally).

The SQLite database, uploads and backups — including the G: mirror and the Azure
Files share — are not encrypted at rest by Thor.

## Testing

```bash
npm test
```

Runs `node --test` against a throwaway database in a temp dir with the LLM stubbed
(`test/helpers/env.js`, `test/helpers/llmStub.js`) — no API keys, no network, never
your real data. Test files must load `src/` modules through `setupTestEnv()` (dynamic
imports after the env is set); with `THOR_TEST=1`, `src/db.js` refuses to open
without a scratch `THOR_DB_PATH` and `THOR_BACKUP_MIRROR`.

## Data & backups

SQLite at `data/workout.db` (WAL mode). Schema is created/seeded automatically on
boot; the database migrated from the old stack works as-is. `data/` is gitignored.

A consistent snapshot (`VACUUM INTO`) is written to `data/backups/workout-YYYY-MM-DD.db`
once per day (checked hourly, in-process — no external cron), keeping the last 14. Each
snapshot is also mirrored off-machine to `THOR_BACKUP_MIRROR` (default
`/mnt/g/backups/thor`) when that path is mounted; it no-ops silently otherwise.

Uploaded lab files live next to the database in `data/uploads/labs/` (names are
random UUIDs; the original filename is only kept for display). They aren't inside the
SQLite snapshot, so each backup also copies any new upload files to
`<mirror>/uploads/labs/` (incremental, never pruned).

Under Docker the bind-mounted `./data` keeps the database and local snapshots on the
host. To keep the off-machine mirror working too, mount its drive into the container
(e.g. add `- /mnt/g/backups/thor:/mnt/g/backups/thor` to `docker-compose.yml`).

## Cloud deployment (Azure)

Thor runs in Azure Container Apps (subscription "Azure subscription 1", resource
group `rg-thor`, all consumption tier, scale-to-zero when idle):

- **App**: `thor` on environment `cae-thor` — canonical URL
  <https://thor.brian-strickland.com> (custom domain + free ACA managed cert;
  DNS is a CNAME + `asuid.thor` TXT in the Route 53 zone `brian-strickland.com`).
  The platform URL <https://thor.kindpebble-2a366f60.eastus2.azurecontainerapps.io>
  still resolves, but sign-in lands on the custom domain — the OAuth callback
  (`THOR_BASE_URL`) is absolute.
- **Data**: SQLite on an Azure Files share (`stthorbstrick/thordata`) mounted at
  `/data` with `nobrl,uid=1000,gid=1000` (SQLite needs local byte-range locks over
  SMB; safe because max replicas = 1). `THOR_SQLITE_JOURNAL=DELETE` — WAL doesn't
  work on network filesystems. Daily snapshots land in `/data/backups` on the share.
- **Image**: built in the auto-created registry `caad62479b7facr` (Basic tier).
  The app pulls with its system-assigned managed identity (AcrPull); the
  registry admin user is disabled.
- **Sign-in**: Microsoft account only (see below); Entra app registration
  "Thor Fitness Tracker", allowlisted via `THOR_ALLOWED_EMAILS`.
- **Secrets** (OpenAI, Strava, session, client secret) live as Container App
  secrets; config as env vars on the app.

Redeploy after a code change (builds remotely from source, no local Docker).
Don't use `az containerapp up --source` — it re-enables the registry admin
user and rewrites the pull credentials; build and update explicitly instead:

```bash
tag=$(git rev-parse --short HEAD)
# Build from an export of the commit: exactly what's committed (no .env, data or .git),
# and it avoids az choking on long paths inside .git when the repo sits on a WSL share.
rm -rf /tmp/thor-build && mkdir /tmp/thor-build && git archive HEAD | tar -x -C /tmp/thor-build
az acr build -r caad62479b7facr -t "thor:$tag" /tmp/thor-build
az containerapp update -g rg-thor -n thor --image "caad62479b7facr.azurecr.io/thor:$tag"
```

(From Windows, point `az acr build` at a Windows copy of the export, e.g. under `%TEMP%`.)

Before deploying schema changes, rehearse on a copy of the production database
(`az storage file download --account-name stthorbstrick --share-name thordata --path workout.db`)
booted locally with `THOR_DB_PATH` pointing at the copy, and keep a pre-deploy copy in
`backups/` on the share under a name that doesn't match `workout-YYYY-MM-DD.db` (so the
14-day pruning leaves it alone). Roll back by updating the app to the previous image tag —
migrations only add tables and columns, so older code still runs on a newer database.

First request after idle is a cold start (a few seconds). The in-process daily
backup runs on boot, so snapshots happen whenever the app wakes on a new day.

## Security notes

- **Microsoft sign-in** (when `MS_CLIENT_ID` + `MS_CLIENT_SECRET` are set):
  OAuth authorization-code + PKCE against the personal-accounts endpoint,
  zero-dep id_token verification (JWKS/RS256, iss/aud/nonce/exp), stateless
  HMAC-signed session cookie (7 days). Only emails in `THOR_ALLOWED_EMAILS`
  may sign in; the first sign-in claims the seeded default DB user (`user-main`)
  and links it by immutable Microsoft object id. Pages redirect to `/login.html`;
  `/api/*` returns 401 with a login pointer. The PIN (below) still works in
  parallel for LAN/scripted access if set.
- All `/api/*` routes (except `/api/health` and `/api/auth/me`) otherwise require
  the shared PIN from `THOR_PIN` in `.env`, sent as the `X-Thor-Pin` header. The
  browser prompts once and remembers it in localStorage. Blank `THOR_PIN` (and no
  Microsoft config) disables auth.
- API responses carry CSP/nosniff/frame-deny headers; JSON request bodies are capped at
  1 MB. Lab uploads are the one raw-body route: 15 MB per file (30 MB per report, 6 files),
  refused from `Content-Length` before the body is read, with the file type sniffed from
  its bytes (PDF/JPEG/PNG/WebP) rather than trusted from the client. Downloads are
  `attachment` + `no-store`. Lab explainers only ever see the reviewed rows, never the raw
  report text.
- The server binds 0.0.0.0 so phones on your LAN can reach it. PIN or not,
  don't port-forward it to the internet.
