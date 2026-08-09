# RUNBOOK — erxes v3 on `ampere2`

Operator runbook for the erxes deployment that lives on the Dokploy server
**`ampere2`** (arm64 Ampere, `80.225.232.200`). Written after the deployment was
completed and debugged; every command below was run against this stack.

> **This is a different box from the rest of Hypedrive.** The other Hypedrive
> services run on `161.118.181.38`. Nothing in this stack talks to that box, and
> the DNS records for these four hostnames must point at `80.225.232.200`
> explicitly — see [Prerequisites](#2-prerequisites).

---

## 1. What this is

A self-hosted erxes v3 (erxes-next) stack: MongoDB + Redis + MinIO, six
federated Node APIs behind an Apollo-Router gateway, two nginx bundles, and two
background workers. Deployed by Dokploy as a **compose** service from
`github.com/hypedrive-app/erxes`, branch `main`, compose path
`./deploy/docker-compose.yml`, autoDeploy on push.

Five plugins are enabled: **frontline, sales, operation, calcom, accounting**.

There is no official upstream compose for v3 — `deploy/docker-compose.yml` is
hand-written. See `deploy/README.md` for the evidence and the architecture
derivation; this file is the operational counterpart.

### Architecture at a glance

15 compose services:

| Service | Image source | Port | Networks | What it does |
| --- | --- | --- | --- | --- |
| `mongo` | `mongo:7.0` | 27017 | `erxes` | Single database `erxes`, all collections. Named volume `mongo-data`. |
| `redis` | `redis:7.4-alpine` | 6379 | `erxes` | Service discovery (`erxes-service-<name>` keys), BullMQ queues, GraphQL subscriptions. `noeviction`. |
| `minio` | `minio/minio` | 9000 (9001 console) | `erxes`, `dokploy-network` | S3-compatible object store for attachments, avatars, imports. Public via `crm-files.hypedrive.app`. |
| `minio-init` | `minio/mc` | — | `erxes` | One-shot: creates the bucket with `mb --ignore-existing`, then exits. Bucket stays **private**. |
| `plugin-core-api` | built, `backend/core-api/Dockerfile.build` | 3300 | `erxes` | Core: users, orgs, permissions, `/initial-setup`, `/get-frontend-plugins`. **Name is load-bearing.** |
| `plugin-frontline-api` | built, `backend/plugins/frontline_api/Dockerfile.build` | 3304 | `erxes` | Inbox, tickets, WhatsApp + Plivo (fork-only integrations). |
| `plugin-sales-api` | built, `backend/plugins/sales_api/Dockerfile.build` | 3305 | `erxes` | Deals, pipelines, forecasts. |
| `plugin-operation-api` | built, `backend/plugins/operation_api/Dockerfile.build` | 3307 | `erxes` | Tasks, projects. |
| `plugin-accounting-api` | built, `backend/plugins/accounting_api/Dockerfile.build` | 3308 | `erxes` | Ledger, invoices, transactions. |
| `plugin-calcom-api` | built, `backend/plugins/calcom_api/Dockerfile.build` | 3314 | `erxes` | Cal.com booking mirror + webhook receiver. Fork-only plugin. |
| `gateway` | built, `backend/gateway/Dockerfile.build` | 4000 | `erxes`, `dokploy-network` | Apollo Router supergraph + catch-all reverse proxy onto core-api. Serves `/graphql`, `/health`, `/locales/*`, `/pl:<plugin>`. |
| `core-ui` | built, `frontend/core-ui/Dockerfile` | 80 | `erxes`, `dokploy-network` | The SPA (nginx). `REACT_APP_*` injected into `window.env` at container start. |
| `plugins-ui` | built, `frontend/plugins/Dockerfile.plugins` | 80 | `erxes`, `dokploy-network` | **One** nginx serving every Module Federation remote under `/latest/<plugin>_ui/`. |
| `automations-service` | built, `backend/services/automations/Dockerfile.build` | 3302 | `erxes` | The only BullMQ consumer that actually runs automations. Name is load-bearing. |
| `logs-service` | `erxes/erxes-next-logs` | 3301 | `erxes` | Audit trail, activity log, revert history. Name is load-bearing. |

Three naming contracts that break silently if violated:

- **`plugin-<name>-api`** — `joinErxesGateway()` publishes
  `http://plugin-${name}-api:${port}` into Redis and the gateway dials that
  string verbatim. Renaming a service breaks discovery with no build error.
- **`automations-service` / `logs-service`** — these self-register their own
  address using their literal service name. They must **never** appear in
  `ENABLED_PLUGINS` (they serve no `/graphql`; listing them kills the gateway).
- **`/latest/<plugin>_ui/remoteEntry.js`** — the path `core-api` emits and the
  browser fetches. `Dockerfile.plugins` must lay files out at exactly that shape.

---

## 2. Prerequisites

### DNS — four explicit A records

All four point at **`80.225.232.200`** (ampere2):

| Hostname | → service | port |
| --- | --- | --- |
| `crm.hypedrive.app` | `core-ui` | 80 |
| `crm-api.hypedrive.app` | `gateway` | 4000 |
| `crm-plugins.hypedrive.app` | `plugins-ui` | 80 |
| `crm-files.hypedrive.app` | `minio` | 9000 |

> **The wildcard will hijack these if you skip the explicit records.** The
> `hypedrive.app` zone has a `*.hypedrive.app` record pointing at the OLD box
> (`161.118.181.38`). Cloudflare resolves an exact-match record before a
> wildcard, so each of the four names above needs its **own** A record at
> `80.225.232.200`. Without it the name silently resolves to the old box and you
> get someone else's Traefik — a 404 or a wrong app, not a connection error.

Verify before deploying:

```bash
for h in crm crm-api crm-plugins crm-files; do
  printf '%-26s %s\n' "$h.hypedrive.app" \
    "$(dig +short $h.hypedrive.app @1.1.1.1 | tail -1)"
done
# every line must show 80.225.232.200 (or a Cloudflare proxy IP if orange-clouded)
```

`crm.hypedrive.app` was previously owned by **frappe-crm**. That app now lives
at `crm-eval.hypedrive.app`; confirm its record was moved before repointing
`crm`.

### Dokploy

- Server **`ampere2`** registered and healthy.
- The GitHub connection has access to `hypedrive-app/erxes` (private fork).
- `dokploy-network` exists on the server (it does after the first Dokploy
  deploy; the compose declares it `external: true`).

### Build capacity

First deploy compiles seven images from source, each running its own
`pnpm install` (~3700 packages). Budget **45–90 minutes** on a cold builder and
several GB of free disk. Subsequent deploys reuse the BuildKit `id=pnpm` cache
mount shared by every recipe.

---

## 3. Deploy from scratch

1. **Create the DNS records** (section 2). Do this first — Traefik cannot issue
   a certificate for a name that resolves elsewhere.

2. **Create the Dokploy compose service.** Project `erxes`, server `ampere2`,
   type **Compose**.

3. **Point it at the repo:**
   - Provider: GitHub → `hypedrive-app/erxes`
   - Branch: `main`
   - Compose path: `./deploy/docker-compose.yml`
   - Auto Deploy: **on**

4. **Fill in the environment** (Dokploy → Environment tab). Use section 4 for
   the full list. Generate the secrets:

   ```bash
   openssl rand -hex 32   # JWT_TOKEN_SECRET
   openssl rand -hex 24   # MONGO_PASSWORD    (avoid @ : / ? # — goes in a URI)
   openssl rand -hex 24   # REDIS_PASSWORD
   openssl rand -hex 24   # MINIO_ROOT_PASSWORD
   openssl rand -hex 24   # AWS_SECRET_ACCESS_KEY (must equal MINIO_ROOT_PASSWORD)
   ```

5. **Register four Dokploy Domains** on the compose service:

   | Host | Service | Port | HTTPS |
   | --- | --- | --- | --- |
   | `crm.hypedrive.app` | `core-ui` | 80 | on (Let's Encrypt) |
   | `crm-api.hypedrive.app` | `gateway` | 4000 | on |
   | `crm-plugins.hypedrive.app` | `plugins-ui` | 80 | on |
   | `crm-files.hypedrive.app` | `minio` | 9000 | on |

   **No path rules on any of them.** A PathPrefix Domain attaches an `addprefix`
   middleware that re-prepends the prefix the request already carries
   (`/latest/sales_ui/latest/sales_ui/remoteEntry.js` → 404).

   **Never add `traefik.*` labels to the compose file.** Dokploy generates the
   routers from its own Domain records; labels create a second router for the
   same Host and Traefik refuses to bind it
   (`Router … cannot be linked automatically with multiple Services`).

6. **Deploy.** Use **Deploy** (`compose-deploy`), not **Redeploy** — redeploy
   does not `git pull` and will ship the previous commit while still reporting
   healthy.

7. **Watch the boot order.** The gateway is gated on every plugin going
   `healthy`, so it is the last thing to come up:

   ```
   mongo, redis, minio  →  minio-init (exits 0)
     →  plugin-core-api (healthy, up to 180s on first boot: it seeds users/orgs)
       →  the five plugin APIs in parallel (healthy, up to 180s each)
         →  gateway  →  core-ui
   ```

   `plugins-ui`, `automations-service` and `logs-service` start independently.

8. **Run the verification checklist** (section 6).

9. **Complete owner signup.** Open `https://crm.hypedrive.app` and create the
   owner account. Confirm with:

   ```bash
   curl -fsS https://crm-api.hypedrive.app/initial-setup
   # before: {"type":"os","config":{},"hasOwner":false}
   # after:  ... "hasOwner":true
   ```

---

## 4. Environment variables

Set in Dokploy → the compose service → Environment.

### Required — the stack will not work without these

| Variable | Value on ampere2 | If missing |
| --- | --- | --- |
| `ERXES_UI_DOMAIN` | `crm.hypedrive.app` | Becomes `DOMAIN` and the gateway's CORS origin. Empty ⇒ every browser request is blocked by CORS. |
| `ERXES_API_DOMAIN` | `crm-api.hypedrive.app` | Becomes `REACT_APP_API_URL`. Empty ⇒ the SPA loads and every GraphQL call fails. |
| `ERXES_PLUGINS_DOMAIN` | `crm-plugins.hypedrive.app` | Becomes `PLUGIN_CDN_URL`. Empty ⇒ `https:///latest/...` remote URLs; every plugin fails to load. |
| `ERXES_FILES_DOMAIN` | `crm-files.hypedrive.app` | `MINIO_SERVER_URL`. Empty ⇒ MinIO signs against `minio:9000` and every download 403s `SignatureDoesNotMatch`. |
| `JWT_TOKEN_SECRET` | `openssl rand -hex 32` | Must be **identical** across core-api, the plugins and the gateway. Divergent ⇒ every authenticated request is rejected. |
| `MONGO_USER` / `MONGO_PASSWORD` | `erxes` / `openssl rand -hex 24` | Baked into `MONGO_URL` in every service. |
| `REDIS_PASSWORD` | `openssl rand -hex 24` | Redis runs `--requirepass`; wrong value ⇒ no service discovery at all. |
| `MINIO_ROOT_PASSWORD` | `openssl rand -hex 24` | MinIO refuses to start without it. |

### Uploads — required as a set, or uploads silently fail

erxes resolves storage as `configs[CODE] ?? getEnv(CODE)`, so these are the
fallback when the org Configs collection has nothing set. All of them:

| Variable | Value on ampere2 | Why |
| --- | --- | --- |
| `UPLOAD_SERVICE_TYPE` | `AWS` | Selects the S3-compatible path. |
| `AWS_BUCKET` | `erxes` | Must match what `minio-init` created. |
| `AWS_ACCESS_KEY_ID` | `= MINIO_ROOT_USER` (`erxes`) | MinIO root credentials double as S3 keys. |
| `AWS_SECRET_ACCESS_KEY` | `= MINIO_ROOT_PASSWORD` | Same value, or every request 403s. |
| `AWS_COMPATIBLE_SERVICE_ENDPOINT` | `https://crm-files.hypedrive.app` | The **public** origin — the browser dereferences the signed URL. |
| `AWS_FORCE_PATH_STYLE` | `true` | Virtual-host style (`bucket.minio:9000`) needs a DNS entry per bucket. |
| `AWS_REGION` | `us-east-1` | MinIO rejects R2's `auto`. Any real region string works. |
| `AWS_DISABLE_ACL` | `true` | Harmless on MinIO; required if this is ever repointed at R2. |

Leave `AWS_PREFIX` and `FILE_SYSTEM_PUBLIC` unset unless you need them.

### `ENABLED_PLUGINS` — the one variable with a trap

```
ENABLED_PLUGINS=frontline,sales,operation,calcom,accounting
```

> **NEVER set it to an empty string.** `getPlugins()` in
> `erxes-api-shared/src/utils/service-discovery.ts` does
> `['core', ...(process.env.ENABLED_PLUGINS?.split(',') || [])]`. The `?.` only
> guards `undefined` — `''` is a string, and `''.split(',') === ['']`, producing
> a phantom plugin whose name is the empty string. The gateway then blocks
> forever on the Redis key `erxes-service-` (which nothing ever writes), logging
> `Waiting for plugin  to join service discovery` with a blank name, and never
> serves `/graphql` at all.
>
> To run **core only**, set it explicitly to `core` — `getPlugins()` prepends
> `core` unconditionally so the duplicate is harmless. Do not "disable plugins"
> by blanking the value; that reproduces the exact outage.
>
> Same rule applies to `ENABLED_PLUGINS_ONLY_API`, which stays **absent**.

The compose defaults every occurrence to the five-plugin list, so leaving the
variable unset in Dokploy is safe. Setting it means it must match section 5.

### Optional — empty is fine

| Variable | Empty behaviour |
| --- | --- |
| `APP_TITLE` | Browser tab keeps the built-in title. |
| `ACCENT_COLOR` | Stylesheet default (Sharks Marketing blue `#3B90FA`). |
| `DEFAULT_PHONE_DIALING_CODE` | Defaults to `91` (India). |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URI` | Any one empty ⇒ `/auth/oidc/*` answers **404**. Password login is unaffected. See [Known gaps](#8-known-gaps). |
| `OIDC_PROVIDER_NAME` | Empty ⇒ the SSO button is **not rendered** on the login screen (correct when OIDC is off). |
| `OIDC_ALLOW_JIT_PROVISION` | Defaults `false`. Turning it on **requires** `OIDC_ALLOWED_EMAIL_DOMAINS` — an empty list refuses every address. |
| `CALCOM_WEBHOOK_SECRET` | Every Cal.com delivery fails HMAC verification and answers **401** (the correct closed default). |
| `CALCOM_API_KEY` | Inbound webhooks still fill the mirror; cancel/reschedule/backfill do nothing. |
| `CALCOM_ADMIN_TOKEN` | `POST /calcom/reconcile` answers **503** rather than running unauthenticated. |
| `CALCOM_API_URL` | Defaults to `https://api.cal.com/v2`. |
| `OPENAI_API_KEY` | AI agent actions are unavailable; nothing else degrades. |
| `ELASTICSEARCH_URL` | Set by compose to `http://elasticsearch:9200`. Required for segments, engage targeting, inbox and form search. If Elasticsearch is unreachable these now fail with a named `ElasticsearchUnavailableError` instead of silently returning empty/whole-table results. |

---

## 5. Adding a plugin

Three files must agree. If any one is missing the plugin, the failure is a
**hang or a 404**, not a build error. `accounting` (commit `f5865174`) is the
worked example below; it uses port **3308**.

### 5.1 `backend/plugins/<name>_api/Dockerfile.build`

Upstream ships only a packaging-only `Dockerfile` that `COPY`s a gitignored
`dist/` — it cannot build from a clean checkout. Copy `sales_api`'s
`Dockerfile.build` and change the project name and port.

The port **must** match the `startPlugin({name, port})` literal in
`src/main.ts`:

```bash
grep -rn "startPlugin" backend/plugins/accounting_api/src/main.ts
# -> startPlugin({ name: 'accounting', port: 3308, ... })
```

### 5.2 `deploy/docker-compose.yml`

Two edits.

**a) A new service, named exactly `plugin-<name>-api`:**

```yaml
  plugin-accounting-api:
    build:
      context: ..
      dockerfile: backend/plugins/accounting_api/Dockerfile.build
    depends_on:
      mongo: {condition: service_healthy}
      redis: {condition: service_healthy}
      plugin-core-api: {condition: service_healthy}
    environment:
      NODE_ENV: production
      VERSION: os
      PORT: "3308"          # == the startPlugin literal
      ...
```

plus a `service_healthy` entry under the **gateway's** `depends_on`:

```yaml
      plugin-accounting-api: {condition: service_healthy}
```

This gate is a correctness requirement, not an optimisation — see
[Troubleshooting](#7-troubleshooting).

**b) `ENABLED_PLUGINS` in all nine places.** Every occurrence must be
byte-identical, because the gateway compares its list against what actually
registered:

```bash
# count only real assignments, not the explanatory comments that mention the name
grep -cE '^\s+ENABLED_PLUGINS: ' deploy/docker-compose.yml   # -> 9
# and confirm all nine carry the SAME list
grep -E '^\s+ENABLED_PLUGINS: ' deploy/docker-compose.yml | sort -u | wc -l   # -> 1
```

The nine: `plugin-core-api`, `plugin-frontline-api`, `plugin-sales-api`,
`plugin-accounting-api`, `plugin-operation-api`, `plugin-calcom-api`,
`gateway`, `automations-service`, `logs-service`.

`plugins-ui` is **not** one of them — it takes no environment at all. Its half
of the wiring is the `Dockerfile.plugins` edit in 5.3.

Names are the **bare** plugin names, not the `_api` directory names —
`accounting_api` here makes the gateway wait forever on a discovery key nothing
publishes.

### 5.3 `frontend/plugins/Dockerfile.plugins`

Three edits in this one file — **no new compose service**. `core-api` derives
one Module Federation remote URL per name in `ENABLED_PLUGINS`, so a backend
plugin whose UI is not served here 404s in the browser and Module Federation
`init()` rejects on the first missing remote, taking down the *whole* UI.

```dockerfile
# 1. the nx build chain
RUN pnpm nx build frontline_ui \
 && ... \
 && pnpm nx build accounting_ui

# 2. the assertion — fails the build rather than shipping a 404ing nginx
RUN test -f dist/frontend/plugins/frontline_ui/remoteEntry.js \
 && ... \
 && test -f dist/frontend/plugins/accounting_ui/remoteEntry.js

# 3. the COPY into the serve stage
COPY --from=build /app/dist/frontend/plugins/accounting_ui \
                  /usr/share/nginx/html/latest/accounting_ui
```

### 5.4 Validate before pushing

```bash
cd /path/to/erxes
pnpm nx build accounting_api
pnpm nx build accounting_ui
docker compose -f deploy/docker-compose.yml config -q     # parses
grep -cE "^  [a-z][a-z0-9-]*:" deploy/docker-compose.yml  # service count
```

> **Removing a plugin is the reverse, and both halves must go together.** The
> gateway's `depends_on` is unconditional — dropping only the name from
> `ENABLED_PLUGINS` leaves a container nothing talks to; dropping only the
> service makes compose fail to start on an unknown dependency.

---

## 6. Verification checklist

Run all of these after every deploy. Each has an exact expected output.

```bash
UI=crm.hypedrive.app
API=crm-api.hypedrive.app
PLUGINS=crm-plugins.hypedrive.app
FILES=crm-files.hypedrive.app
```

**1. Gateway health** — plain text `ok` (the route is `res.end('ok')`):

```bash
curl -fsS https://$API/health
# -> ok
```

**2. Initial setup / core-api passthrough** — proves the gateway's catch-all
proxy onto core-api is wired:

```bash
curl -fsS https://$API/initial-setup
# -> {"type":"os","config":{...},"hasOwner":true}
```

**3. GraphQL supergraph** — a POST, not a GET. This proves rover composed the
supergraph across all six subgraphs:

```bash
curl -fsS -X POST https://$API/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ __schema { queryType { name } } }"}'
# -> {"data":{"__schema":{"queryType":{"name":"Query"}}}}
```

If this hangs or 502s, the gateway never started — go to
[Troubleshooting](#7-troubleshooting).

**4. Frontend plugin manifest** — must name **our** host, never
`plugins.erxes.io`, and must list all five:

```bash
curl -fsS https://$API/get-frontend-plugins
# -> [{"name":"frontline_ui","entry":"https://crm-plugins.hypedrive.app/latest/frontline_ui/remoteEntry.js"},
#     {"name":"sales_ui",...},{"name":"operation_ui",...},
#     {"name":"calcom_ui",...},{"name":"accounting_ui",...}]

curl -fsS https://$API/get-frontend-plugins | grep -c remoteEntry
# -> 5
```

If it still shows `plugins.erxes.io`, `PLUGIN_CDN_URL` did not reach core-api —
recheck `ERXES_PLUGINS_DOMAIN` and redeploy.

**5. Every remote actually serves JavaScript** — a 200 with an HTML
content-type means you are hitting the wrong vhost:

```bash
for p in frontline sales operation calcom accounting; do
  printf '%-12s ' "$p"
  curl -fsS -o /dev/null -w '%{http_code} %{content_type}\n' \
    https://$PLUGINS/latest/${p}_ui/remoteEntry.js
done
# -> each line: 200 application/javascript
```

**6. MinIO health** — MinIO's own unauthenticated liveness endpoint:

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://$FILES/minio/health/live
# -> 200
```

Confirm the bucket exists (`minio-init` should have exited 0):

```bash
docker compose -f deploy/docker-compose.yml logs minio-init
# -> bucket erxes ready
```

**7. The SPA loads with the right runtime config:**

```bash
curl -fsS https://$UI/js/env.js
# -> window.env = {"REACT_APP_API_URL":"https://crm-api.hypedrive.app", ...}
```

---

## 7. Troubleshooting

### 7.1 `exec /bin/sh: exec format error`

```
#32 [gateway build 3/8] RUN npm install -g pnpm@9.12.3
#32 0.474 exec /bin/sh: exec format error
```

**Cause.** `backend/gateway/Dockerfile.build` pinned every stage
`--platform=linux/amd64` (inherited from the sibling packaging Dockerfile).
ampere2 is **arm64**, so every stage pulled an amd64 image and the first `RUN`
died instantly. This failed the very first Ampere deploy.

**Fix.** Commit `7742d1fa` — the pins are removed, so Docker resolves the
multi-arch `node:22-bookworm` manifest for whatever the build host is.

The `bookworm` (not alpine) base is still mandatory and unrelated: the Apollo
Router binary the gateway spawns is dynamically linked against glibc. Apollo
publishes both `x86_64-unknown-linux-gnu` and `aarch64-unknown-linux-gnu` for
v1.59.2, and the installer picks by `uname -m` — architecture was never the
constraint. The 16 runtime dependencies are pure JavaScript with no native addon.

`backend/gateway/Dockerfile` (the sibling) **keeps** its pins; the compose does
not use it.

### 7.2 `error: operation timed out` fetching the supergraph plugin

```
downloading the 'supergraph' plugin from
  https://rover.apollo.dev/tar/supergraph/aarch64-unknown-linux-gnu/v2.9.3
error: operation timed out
```

**Cause.** The gateway build pulls two ~20 MB artifacts from Apollo's CDN and
rover's own HTTP timeout is short (it gave up at ~45s). The URL is fine —
fetching it directly returns 200 in under 8 seconds — so this is transient
slowness between ampere2 and the CDN, failing a 30-minute build on one bad fetch.

**Fix.** Commit `af80aec9` — both fetches are wrapped in a 5-attempt retry with
15s backoff, and `curl` gets its own `--connect-timeout` / `--max-time` /
`--retry` so a stalled connection is abandoned rather than hanging the layer.

> The retry runs in a **subshell** `( … )`, not a brace group `{ … }`. An
> `exit 0` inside a brace group exits the whole `/bin/sh -c`, which would
> silently skip the router download and every step after it. Do not "simplify"
> the braces.

If it recurs, just redeploy — 5 attempts already covers the observed failure
rate.

### 7.3 `not a directory: Are you trying to mount a directory onto a file?`

```
error mounting "/opt/sharks-branding/erxes/erxes-logo.ico" to rootfs at
"/usr/share/nginx/html/assets/erxes-logo.ico": not a directory:
Are you trying to mount a directory onto a file (or vice-versa)?
```

**Symptom shape.** Everything builds, every API turns healthy, and then
**`core-ui` alone** fails to start.

**Cause.** Two logo files were bind-mounted from `/opt/sharks-branding` on the
host. Those files had been copied by hand onto the *old* box only. When the bind
source does not exist, Docker creates it as a **directory** and then cannot
mount it over the container's file. The compose was non-portable: it ran on
exactly one machine.

**Fix.** Commits `d2fb4a0d` / `786958c8` — the bind-mounts are gone. Now that
`core-ui` is built from source, branding lives in the image
(`frontend/core-ui/src/assets/` and the `<title>` in
`frontend/core-ui/src/index.html`), versioned with the code and travelling to
every host.

**Do not reintroduce any host bind-mount.** The only volumes left are the named
ones (`mongo-data`, `redis-data`, `minio-data`). If you see this error class
again, grep for a host path in the compose:

```bash
grep -nE '^\s+- +/' deploy/docker-compose.yml   # must return nothing
```

The version-locked `index.html` mount that used to sit here is also gone
deliberately: it hard-referenced the content-hashed entry bundle of a specific
published image, so building our own bundle left it pointing at a file that does
not exist — a blank white SPA.

### 7.4 `failed to solve: Internal: <id>: not found`

**Cause.** BuildKit internal state on the builder, not a problem with the code
or the compose. It is not deterministic and not attributable to any one service.

**Fix.** **Retry the deploy.** It succeeds on the next attempt.

If it repeats across several attempts, clear the builder from Dokploy
(Settings → Clean Docker Builder) and deploy again. Note that this discards the
`id=pnpm` cache mount, so the next build pays the full `pnpm install` cost.

### 7.5 The UI shell loads but plugins 404

**Symptom.** `https://crm.hypedrive.app` renders the shell; plugin screens are
blank or the console shows a failed `remoteEntry.js` fetch, or
`Unexpected token '<'`.

Module Federation `init()` rejects on the **first** missing remote, so one bad
plugin blanks the whole UI — not just its own screens.

Check in this order:

1. **What is core-api handing out?**
   ```bash
   curl -fsS https://crm-api.hypedrive.app/get-frontend-plugins
   ```
   - Shows `plugins.erxes.io` ⇒ `PLUGIN_CDN_URL` did not reach core-api. Recheck
     `ERXES_PLUGINS_DOMAIN` and redeploy.
   - Missing a plugin ⇒ that name is absent from core-api's `ENABLED_PLUGINS`.
   - Lists a plugin you never built ⇒ section 5.3 was skipped.

2. **Does that exact URL serve JS?** Run verification step 5. A `200 text/html`
   means Traefik routed you to `core-ui` instead of `plugins-ui` — core-ui's
   nginx ends in `try_files $uri $uri/ /index.html`, so *any* unmatched path
   returns `index.html` with a 200. That is the `Unexpected token '<'` case.
   Fix the Dokploy Domain: `crm-plugins.hypedrive.app` → service `plugins-ui`,
   port 80, **no path rule**.

3. **Version directory mismatch.** `plugins-ui` serves only `latest/`. If
   someone set a per-plugin `releaseVersion` in the org config, core-api emits a
   URL for a directory the container does not have and the plugin silently stops
   loading. Either clear `releaseVersion` or add a matching directory in
   `Dockerfile.plugins`.

4. **The image really is missing it:**
   ```bash
   docker compose -f deploy/docker-compose.yml exec plugins-ui \
     ls /usr/share/nginx/html/latest/
   # -> accounting_ui  calcom_ui  frontline_ui  operation_ui  sales_ui
   ```

### 7.6 Uploads fail

Check in this order:

1. **Does the bucket exist?**
   ```bash
   docker compose -f deploy/docker-compose.yml logs minio-init
   # -> bucket erxes ready
   ```
   Anything else and every upload fails `NoSuchBucket`. `minio-init` is
   idempotent — re-run it with
   `docker compose -f deploy/docker-compose.yml up minio-init`.

2. **Is MinIO up and public?** Verification step 6. A non-200 means either the
   container is unhealthy or `crm-files.hypedrive.app` is not routed to
   `minio:9000`.

3. **`SignatureDoesNotMatch` on download.** `MINIO_SERVER_URL` is wrong.
   Presigned URLs are signed against the host the **browser** uses, so
   `ERXES_FILES_DOMAIN` must be `crm-files.hypedrive.app` — not the internal
   `minio:9000`.

4. **403 on upload.** `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` must equal
   `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` exactly.

5. **Odd bucket-addressing errors.** `AWS_FORCE_PATH_STYLE` must be `true` —
   single-host MinIO cannot do virtual-host style without per-bucket DNS. And
   `AWS_REGION` must be a real region string; MinIO rejects R2's `auto`.

6. **Nothing configured at all.** `UPLOAD_SERVICE_TYPE` empty means the whole
   `AWS_*` block is inert and uploads fail with no useful message. All eight
   variables in section 4 are a set.

### 7.7 One plugin takes down the entire stack

**Symptom.** Nobody can log in. `https://crm-api.hypedrive.app/graphql` and even
`/health` are dead. Gateway logs repeat
`WAITING FOR: <plugin> graphql endpoint …` and the container restarts every
minute.

**Why one plugin can do this.** `retryGetProxyTargets()`
(`backend/gateway/src/proxy/targets.ts`) blocks on **every** name in
`ENABLED_PLUGINS` and, on exhausting `MAX_PLUGIN_RETRY` (60), its `catch` calls
`process.exit(1)` — before `httpServer.listen()`. There is no partial start and
no partial supergraph (`rover supergraph compose` fails the whole composition if
one subgraph is unreachable). With `restart: unless-stopped` that is a permanent
crash-loop.

The full recovery procedure is in **`deploy/README.md` → "RUNBOOK: frontline
took down the whole stack"**. Short version: identify the unhealthy plugin
(`docker compose ps` names it `(unhealthy)` while `gateway` sits in `Created`),
drop that name from `ENABLED_PLUGINS` — **never blank the variable** — and
recreate `gateway` and `plugin-core-api` together.

---

## 8. Known gaps

### OIDC / Logto is not configured

`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and `OIDC_REDIRECT_URI`
are all unset on ampere2, so `/auth/oidc/*` answers **404** and the SSO button
is not rendered. Password login works normally.

Enabling it requires a **new Logto application**. Do not reuse Twenty's or
frappe-crm's `client_id` — Logto validates the redirect URI against the
per-application allow-list, so a borrowed client fails with
`redirect_uri mismatch` at the callback. Create a dedicated app and register:

```
OIDC_REDIRECT_URI = https://crm-api.hypedrive.app/auth/oidc/callback
```

Note it points at the **API** host (the gateway), not the UI, and must match the
registered value byte-for-byte. Sign-in then starts at
`https://crm-api.hypedrive.app/auth/oidc/login`.

Also set `OIDC_PROVIDER_NAME` (the label is the switch that renders the button)
and decide on `OIDC_ALLOW_JIT_PROVISION`. Leaving JIT off is the safe default:
with a shared identity provider, auto-provisioning hands an erxes seat to anyone
who can log in there, and they arrive with no permission groups. Turning it on
**requires** `OIDC_ALLOWED_EMAIL_DOMAINS` — an empty list refuses every address.

### Cal.com credentials are absent

The `calcom` plugin is enabled and its API and UI both deploy, but
`CALCOM_WEBHOOK_SECRET`, `CALCOM_API_KEY` and `CALCOM_ADMIN_TOKEN` are unset.
Consequences today:

- Inbound webhooks fail HMAC verification and answer **401** — the booking
  mirror never fills.
- Outbound actions (cancel, reschedule, mark-absent, backfill) do nothing.
- `POST /calcom/reconcile` answers **503** rather than running unauthenticated.

These are the correct closed defaults, not bugs. To activate, set the three
values and point `CALCOM_API_URL` at the right instance (it defaults to
`https://api.cal.com/v2`; the self-hosted calendar is at
`cal.sharksmarketing.com`).

### Other

- **Elasticsearch + Monstache are required for segments.** Earlier revisions of
  this runbook said Elasticsearch was omitted for RAM and that segments merely
  "degrade". Both statements were wrong in an important way, so they are
  corrected here:

  1. erxes v3 did **not** drop Elasticsearch. `fetchSegment.ts` routes every
     segment branch — list, count, scroll, association — through `fetchEs`.
     There is no Mongo fallback, so with no cluster a segment cannot be
     evaluated at all.
  2. What v3 dropped is the **syncer**. `erxes-api-shared/.../saveEs.ts` states
     it plainly: *"entity indices are filled by the external elkSyncer … there
     is NO in-process Mongo->ES pipeline."* Nothing upstream ships that syncer
     any more, so adding Elasticsearch on its own yields empty indices and
     segments that match nothing.
  3. The failure was **silent**, which is why this looked like a segments bug.
     `fetchEs` caught the connection error and returned the caller's
     `defaultValue` — `{ hits: { hits: [] } }` for lists (indistinguishable from
     a real "no matches") and a mis-shaped `{ count: -1 }` for counts (read as
     `body.count`, so actually `undefined`).

  The stack therefore runs `elasticsearch` (7.17, pinned to the
  `@elastic/elasticsearch@7.17.14` client) and `monstache` (rel6), and `mongo`
  starts with `--replSet rs0` because change streams require a replica set. A
  single-member set is the supported minimum. Our fork additionally makes an
  unreachable cluster raise `ElasticsearchUnavailableError` rather than
  degrading into a wrong answer.

  RAM cost is roughly 2 GB (Elasticsearch) + 0.5 GB (Monstache). Verify the
  indices are actually populated after deploy:

  ```bash
  curl -s 'http://elasticsearch:9200/_cat/indices?v' | grep erxes__
  # expect erxes__companies / erxes__customers with a non-zero docs.count
  ```
- **`plugins-ui` serves only `latest/`.** Setting a per-plugin `releaseVersion`
  in the org config silently breaks that plugin's remote — see 7.5 step 3.
- **`main` is pushed to many times a day** and autoDeploy is on. A deploy fired
  immediately after a push can build the *previous* commit and still go healthy;
  check the deployment's `description` (not its `title`, which can name an old
  commit) for the real SHA.
- **First deploy is slow.** Seven images built from source, each with its own
  `pnpm install` (~3700 packages). The installs dominate; the BuildKit
  `id=pnpm` cache mount is shared across every recipe so warm builds are much
  faster.
