# erxes v3 self-hosted core stack (unofficial)

## Verdict: there is no official way to self-host erxes v3

As of **2026-07-30 (v3.0.61)** the erxes project publishes **no working
self-hosting method** for the current codebase. Evidence:

| Source | State |
| --- | --- |
| `erxes/erxes` @ main (v3.0.61) | No `docker-compose.yml` anywhere in the tree. 19 per-service Dockerfiles only. |
| `erxes/erxes` releases | 61 releases (3.0.1 … 3.0.61). **Zero release assets** on any of them — no compose, no installer. |
| `erxes/erxes-next` | Last push 2026-01-31, a stale snapshot of the same Nx monorepo. Also no compose. |
| `erxes/erxes-docker` (linked from README) | 404. |
| `docs.erxes.io/self-hosting` | Describes the **pre-rewrite v2** architecture (Docker Swarm, ports 3000/3200/3300, `docker-compose-dbs.yml`). Does not mention v3 or any `erxes-next-*` image. |
| `erxes/dev-docker`, `erxes/erxes-installer` | Last pushed 2023-08 / 2024-11. v2 architecture (RabbitMQ, Elasticsearch 7.5.2). |
| `erxes.io/docs/local-setup` | Has a "Docker" toggle but ships **no** Docker commands or compose file. pnpm-from-source only. |
| GitHub org code search, `filename:docker-compose.yml org:erxes` | 2 hits, both irrelevant (`dev-docker`, `erxes-ai-assistant-gateway`). |
| Issues/Discussions | No v3 self-host/compose thread exists. |

No community-maintained v3 compose, Helm chart, or Coolify/Dokploy/CapRover
template was found either. **This file is therefore hand-written**, derived from
the Dockerfiles and runtime source at commit `badf583`, and then exercised.

## Image → architecture mapping (settled)

The `erxes` Docker Hub org has two generations. They are **not**
interchangeable:

| Images | Version | Verdict |
| --- | --- | --- |
| `erxes/core`, `erxes/gateway`, `erxes/workers`, `erxes/crons`, `erxes/essyncer` | **2.17.54**, newest 2026-06-21 | **LEGACY v2.** `erxes/core:2.17.54` config has `WorkingDir=/erxes` and no `Cmd`. Version numbers never reach 3.x. Do not use. |
| `erxes/erxes-next-*` (`-core-api`, `-gateway`, `-ui`, `-<plugin>_api`, …) | **3.0.61**, pushed 2026-07-30 08:41 | **CURRENT v3.** Matches the v3.0.61 GitHub release timestamp. |

Proof of provenance for the v3 images — `erxes/erxes-next-ui:3.0.61` config
blob carries OCI labels:

```
org.opencontainers.image.source   = https://github.com/erxes/erxes
org.opencontainers.image.revision = 35b6562a5657c61d0076aa67e3d875158a9f756d
```

and `gh api repos/erxes/erxes/commits/35b6562a…` resolves to
*"fix(sidebar): truncate long board and pipeline names (#8842)"*, dated
2026-07-30T07:54:29Z — i.e. a real commit on v3 `main`. v3 images use
`WorkingDir=/app`, confirming the rewritten layout.

The image names are also confirmed by CI: `.github/workflows/ci-api-core.yml`
pushes `erxes/erxes-next-core-api:latest` and `:${DATE}-${SHORT_SHA}`, and
`ci-api-gateway.yml` pushes `erxes/erxes-next-gateway`.

Tag advice: pin a release tag (`3.0.61`). `latest` moves several times a day —
`erxes-next-core-api:latest` was pushed at 09:33 on the same day 3.0.61 was cut.

## What was actually verified

This stack was booted locally and driven end to end (not merely
`docker compose config`-checked):

- All five containers reach a steady state; gateway logs `Router started
  successfully` / `Server is running at http://localhost:4000/`.
- core-api registers itself: `erxes-servicecore joined with http://plugin-core-api:3300`.
- Apollo Router composes the supergraph (`Federation v2.9.3`) and serves `/graphql`.
- `GET /initial-setup` → `{"type":"os","config":{},"hasOwner":false}`.
- `mutation usersCreateOwner(...)` → `"success"`; `/initial-setup` then flips to
  `hasOwner: true`.
- `mutation login(...)` → `loggedIn` + a valid `auth-token` JWT `Set-Cookie`.
- Authenticated `{ currentUser { _id email isOwner } }` returns the owner.
- core-ui serves HTTP 200 and injects `window.env` into `/js/env.js`.
- Data survives `--force-recreate` (volumes work).

Measured idle memory: gateway 148 MB, core-api 148 MB, mongo 119 MB,
core-ui 7 MB, redis 6 MB — **~430 MB total**.

## Deploy

```bash
cp deploy/.env.example deploy/.env
# fill in JWT_TOKEN_SECRET, MONGO_PASSWORD, REDIS_PASSWORD
openssl rand -hex 32   # for each
# set the three hostnames: ERXES_UI_DOMAIN, ERXES_API_DOMAIN, ERXES_PLUGINS_DOMAIN
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

Then open `https://$ERXES_UI_DOMAIN` and complete the owner signup.

### Operator checklist

1. Set all three hostnames in `.env` (see the table below).
2. Register **three Dokploy Domains** on the compose app, one per hostname:
   - `ERXES_UI_DOMAIN` → service `core-ui`, port `80`
   - `ERXES_API_DOMAIN` → service `gateway`, port `4000`
   - `ERXES_PLUGINS_DOMAIN` → service `frontline-ui`, port `80`

   Do **not** add `traefik.*` labels to the compose file for any of these.
3. Deploy. Verify the plugin remote is actually being served and pointed at:

   ```bash
   # core-api must hand out OUR host, not plugins.erxes.io
   curl -fsS https://$ERXES_API_DOMAIN/get-frontend-plugins
   # -> [{"name":"frontline_ui","entry":"https://<ERXES_PLUGINS_DOMAIN>/latest/frontline_ui/remoteEntry.js"}]

   # and that URL must return JS, not a 404 or HTML
   curl -fsS -o /dev/null -w '%{http_code} %{content_type}\n' \
     https://$ERXES_PLUGINS_DOMAIN/latest/frontline_ui/remoteEntry.js
   # -> 200 application/javascript
   ```

   If the first command still shows `plugins.erxes.io`, `PLUGIN_CDN_URL` did not
   reach core-api — recheck `ERXES_PLUGINS_DOMAIN` and redeploy.

## Three hostnames are required

Each needs a **Dokploy Domain** record (Dokploy owns routing — the compose file
carries no `traefik.*` labels; adding any would create a second router for the
same Host and Traefik would refuse to bind it).

| Env var | Service | Port | Serves |
| --- | --- | --- | --- |
| `ERXES_UI_DOMAIN` | `core-ui` | 80 | The SPA |
| `ERXES_API_DOMAIN` | `gateway` | 4000 | GraphQL + WebSocket + core-api passthrough |
| `ERXES_PLUGINS_DOMAIN` | `frontline-ui` | 80 | Module Federation remotes (`remoteEntry.js`) |

All three resolve via the existing `*.sharksmarketing.com` wildcard, so **no new
DNS record is needed** — but each must still be registered in Dokploy.

UI and API cannot be collapsed onto one host: the gateway mounts
`app.use('/', …)` onto core-api, so it serves `/initial-setup`,
`/get-frontend-plugins`, `/core-login`, `/oauth/*`, `/upload-chunked/*` etc.
from its root, and the UI derives every API path from the single
`REACT_APP_API_URL` base.

### Why the plugin host is separate rather than a subpath

A subpath on `ERXES_UI_DOMAIN` (e.g. `/plugins/latest/frontline_ui/…`) looks
tempting but is worse here:

- core-ui's nginx ends in `location / { try_files $uri $uri/ /index.html; }`, so
  **any unmatched path returns `index.html` with a 200**. A missing chunk would
  arrive as HTML labelled `application/javascript` — the classic
  `Unexpected token '<'` — instead of a clean 404.
- Routing a subpath to a *different* container means a second Dokploy Domain
  with a PathPrefix on the same hostname, i.e. two services on one Host. That is
  precisely the "cannot be linked automatically with multiple Services" conflict
  the compose header documents.
- Serving it from core-ui's *own* container would require rebuilding the
  upstream `erxes/erxes-next-ui` image, which this stack deliberately does not
  do (it bind-mounts branding instead).

Given the wildcard already covers it, a third hostname is strictly simpler.
**Recommendation: use the separate hostname.**

> If you are not on the `*.sharksmarketing.com` wildcard, `ERXES_PLUGINS_DOMAIN`
> is a hostname **you must create in Cloudflare yourself**. The value in
> `.env.example` is a placeholder, not a provisioned name.

## Two footguns encoded in the compose

1. **`plugin-core-api` is a load-bearing service name.** In production
   `joinErxesGateway()` computes the address as
   `http://plugin-${name}-api:${port}`, so core-api advertises itself as
   `http://plugin-core-api:3300`. Renaming the service breaks discovery.
   Future plugins must be named `plugin-<name>-api`.
2. **`ENABLED_PLUGINS` must be UNSET or NON-EMPTY, never `""`.** `getPlugins()`
   does `['core', ...(process.env.ENABLED_PLUGINS?.split(',') || [])]` and
   `''.split(',') === ['']`, producing a phantom nameless plugin. Observed
   result: the gateway logs `Waiting for plugin  to join service discovery`
   forever and never serves `/graphql`. This is why the compose defaults it to
   `${ENABLED_PLUGINS:-frontline}` rather than `${ENABLED_PLUGINS:-}`.

## frontline (WhatsApp + Plivo)

The `plugin-frontline-api` service is **built from this git tree**, not pulled:
`erxes/erxes-next-frontline-api` does not exist on Docker Hub at any tag. It
uses `backend/plugins/frontline_api/Dockerfile.build` (context = repo root),
which compiles `erxes-api-shared` then `frontline_api`. The sibling
`Dockerfile` cannot be used — it only copies a pre-built, gitignored `dist/`.

### The frontline UI (Module Federation remote)

`core-ui` resolves Module Federation remotes **at runtime**: it fetches
`/get-frontend-plugins` (`frontend/core-ui/src/bootstrap.tsx`) and hands the
response straight to MF's `init({ remotes })`. core-api answers that from
`backend/core-api/src/modules/organization/routes.ts` with

```
${PLUGIN_CDN_URL}/${version}/${plugin}_ui/remoteEntry.js
```

where `version` is `getPluginVersion()` = `config?.releaseVersion || 'latest'`.

That host used to be the hardcoded literal `https://plugins.erxes.io`, which
serves **upstream's** build — not our fork's WhatsApp/Plivo one, and with a
GraphQL schema that would not match our `frontline_api`. It is now the
`PLUGIN_CDN_URL` env var, defaulting to the upstream CDN for compatibility.

The `frontline-ui` service serves our own build at that path layout. It is built
from source via `frontend/plugins/frontline_ui/Dockerfile.build` (context = repo
root) — upstream never containerises a UI plugin, because
`.github/workflows/ci-ui-frontline.yml` builds it on the runner and `aws s3 sync`s
`dist/frontend/plugins/frontline_ui` to `s3://erxes-next/latest/frontline_ui/`.
Our Dockerfile copies the same output to
`/usr/share/nginx/html/latest/frontline_ui`, reproducing that shape.

**So `PLUGIN_CDN_URL` must be browser-reachable.** It is dereferenced by the
browser, not by any container, so `http://frontline-ui` (the compose DNS name)
would fail, and any `http://` value would be blocked as mixed content on an
HTTPS page. It is wired as `https://${ERXES_PLUGINS_DOMAIN}`, and
`frontline-ui` is on `dokploy-network` (like `gateway` and `core-ui`) so
Dokploy's Traefik can route to it.

Unlike `plugin-frontline-api`, this build is **cheap**. Measured directly
(`/usr/bin/time -v pnpm nx build frontline_ui` on this tree): **peak RSS
1.88 GB**, ~48 s, 13 MB / 224 files of output. For contrast, `frontline_api`'s
build has been reported to peak around 13.9 GB against ~9.9 GB free on the
Hostinger box — that figure is *not* re-measured here, but the order-of-magnitude
gap is what matters: this build is not an OOM risk.

#### CORS

**None is required for the scripts themselves, and the config sets it anyway.**
Verified in `node_modules/@module-federation/sdk/dist/index.cjs.js` (`createScript`)
and in the built `remoteEntry.js`: neither the MF loader nor webpack's chunk
loader sets a `crossorigin` attribute, so both load as **classic scripts**,
which are exempt from CORS. `Access-Control-Allow-Origin` is still emitted by
`frontend/plugins/frontline_ui/nginx/default.conf` because:

- **fonts genuinely need it** — `@font-face` fetches are made in `cors` mode and
  silently fall back to a system font without the header (core-ui's own vhost
  does the same);
- anything fetched via `fetch`/`XHR` from this origin (e.g. the audio assets
  under `assets/sound/`) needs it;
- it costs nothing and removes a whole class of future breakage if a chunk ever
  starts being loaded in `cors` mode.

Chunk URLs resolve **relative to wherever `remoteEntry.js` was served from**
(MF's `inferAutoPublicPath`; `frontline_ui`'s rspack config sets no
`publicPath`), so a self-hosted origin needs no build-time change.

The backend (GraphQL, webhooks, WhatsApp/Plivo ingest) is independent of all of
this and works through the gateway regardless.

## Known gaps / risks

- **Elasticsearch omitted** (intentional, RAM). It is lazy — `ELASTICSEARCH_URL`
  defaults to `http://localhost:9200` and is only touched on demand. Full-text
  search and segments will degrade or error; core CRUD is unaffected.
- **Gateway downloads Apollo Router v1.59.2 at build time but re-composes the
  supergraph at every boot** via `rover`, writing into
  `dist/src/apollo-router/temp`. It runs as root so the `--chmod=0555` copy is
  writable. Running it as a non-root user would break startup.
- **Gateway image is 2.39 GB** — first pull is slow.
- No file uploads without S3/AWS credentials.
- frontline's **API and UI** are both enabled and built from source. No other
  plugin (sales, loyalty, …) is enabled — and enabling one means not just adding
  a `plugin-<name>-api` service but also serving its `<name>_ui` build under
  `PLUGIN_CDN_URL`, or the browser 404s on that remote's `remoteEntry.js`.
- **`frontline-ui` serves only the `latest/` version directory.** `getPluginVersion()`
  falls back to `latest`, but if anyone sets a per-plugin `releaseVersion` in the
  org config, core-api will emit a URL for a directory the container does not
  have and the plugin silently stops loading. Either leave `releaseVersion`
  unset or add a matching directory in the Dockerfile.
- Because `ENABLED_PLUGINS` now lists `frontline`, the gateway **blocks on it**:
  `retryGetProxyTargets()` waits for every listed plugin to appear in service
  discovery *and* answer a federation introspection query before serving
  `/graphql`. If `plugin-frontline-api` fails to boot, core GraphQL goes down
  with it — see the runbook below. `MAX_PLUGIN_RETRY=60` does **not** bound the
  damage; it only bounds how quickly the failure shows up in the logs.
- First deploy is **slow**: `frontline_api` and `frontline-ui` are separate
  builds and each runs its own full `pnpm install` (~3700 packages) before its
  Nx build(s). The installs dominate; the `frontline_ui` compile itself is only
  ~48 s / 1.88 GB peak.
- Version pinning is essential; `main` is pushed to many times a day.

## RUNBOOK: frontline took down the whole stack

**Symptom.** Nobody can log in. The UI loads its shell but every request fails.
`https://$ERXES_API_DOMAIN/graphql` and even `/health` are dead. Gateway logs
repeat `WAITING FOR: frontline graphql endpoint …` and the container restarts
every minute or so.

### Why one plugin can do this

`backend/gateway/src/proxy/targets.ts`:

```ts
export async function retryGetProxyTargets(): Promise<ErxesProxyTarget[]> {
  try {
    const serviceNames = await getPlugins();          // ['core', 'frontline']
    const proxyTargets = await Promise.all(serviceNames.map(retryGetProxyTarget));
    await Promise.all(proxyTargets.map(retryEnsureGraphqlEndpointIsUp));
    return proxyTargets;
  } catch (e) {
    console.log(e);
    console.error(e);
    process.exit(1);        // <-- the whole problem
  }
}
```

`main.ts` awaits this on line 226, **before** `httpServer.listen()` on line 247.
So the failure mode is not "starts without frontline" — there is no partial
start. Exhausting `MAX_PLUGIN_RETRY` makes `retry()` rethrow, the catch calls
`process.exit(1)`, and `restart: unless-stopped` re-enters the identical wait.
**A broken frontline is a permanent, self-perpetuating outage of core GraphQL**,
including `/initial-setup` and `/core-login`, which the gateway serves by
proxying `/` to core-api.

There is no partial-supergraph path: `writeSupergraphConfig()` emits a subgraph
entry for every target, and `rover supergraph compose` fails the whole
composition if one subgraph is unreachable.

### Recovery (≈2 minutes, no image rebuild)

`ENABLED_PLUGINS` is read from the environment at gateway boot, so removing
frontline and restarting is sufficient — nothing needs recompiling.

1. **Confirm it is actually frontline**, so you do not "fix" the wrong thing:
   ```bash
   docker compose -f deploy/docker-compose.yml ps
   docker compose -f deploy/docker-compose.yml logs --tail=50 plugin-frontline-api
   ```
   With the healthcheck in place the giveaway is `plugin-frontline-api`
   `(unhealthy)` or restarting, and `gateway` stuck in `Created`.

2. **Drop frontline from `ENABLED_PLUGINS`** in `deploy/.env`. It must end up
   either **absent** or **non-empty** — never `ENABLED_PLUGINS=`:

   ```bash
   # CORRECT — comment the line out entirely:
   # ENABLED_PLUGINS=frontline
   ```

   > **The empty-string trap.** `getPlugins()` does
   > `['core', ...(process.env.ENABLED_PLUGINS?.split(',') || [])]`. The `?.`
   > only guards `undefined`; `''` is a string, so `''.split(',')` returns
   > `['']` — a phantom plugin whose name is the empty string. The gateway then
   > waits on `erxes-service-` (a key nothing ever writes), logging
   > `Waiting for plugin  to join service discovery` with a blank name, and
   > exits after `MAX_PLUGIN_RETRY`. Setting `ENABLED_PLUGINS=` to "disable
   > plugins" reproduces the exact outage you are trying to fix. Comment the
   > line out or delete it.

   Because the compose default is `${ENABLED_PLUGINS:-frontline}`, commenting
   the line out yields `frontline` again. To run **core only**, set the value
   explicitly to `core`:
   ```bash
   ENABLED_PLUGINS=core
   ```
   `getPlugins()` prepends `core` unconditionally, so the duplicate is
   harmless — `retryGetProxyTarget('core')` resolves twice from the same Redis
   key. This is the deliberate way to express "no plugins" without an empty
   string.

3. **Restart the gateway and core-api together.** Both must agree on the list —
   core-api uses it to answer `/get-frontend-plugins`, so a mismatch leaves the
   UI trying to load a remote the gateway cannot route:
   ```bash
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env \
     up -d --force-recreate gateway plugin-core-api
   ```

4. **Verify core is back:**
   ```bash
   curl -fsS https://$ERXES_API_DOMAIN/health                     # -> ok
   curl -fsS https://$ERXES_API_DOMAIN/initial-setup              # -> {"type":"os",...}
   ```
   Gateway logs should show `Router started successfully` and
   `Server is running at http://localhost:4000/`.

5. **Stop the flapping plugin** so it stops consuming RAM while you debug:
   ```bash
   docker compose -f deploy/docker-compose.yml stop plugin-frontline-api
   ```

Re-enabling later is the same steps with `ENABLED_PLUGINS=frontline` restored.
Fix frontline's boot failure **first** — confirm `plugin-frontline-api` reaches
`(healthy)` on its own before putting the name back in the gateway's list.

### Why the `service_healthy` gate is not a workaround

The compose file gates `gateway` on
`plugin-frontline-api: {condition: service_healthy}`. That removes the *common*
cause of this outage — a frontline that is merely **slow** (cold mongoose model
registration on a memory-limited box can exceed the gateway's 60-second budget)
— by making Docker absorb the wait instead of the gateway. It does **not** make
the gateway resilient to a frontline that is genuinely **broken**: in that case
the gateway simply never starts, which is why this runbook exists.

The failure stays attributable. `docker compose ps` names
`plugin-frontline-api` as `(unhealthy)` and the gateway sits in `Created` — an
operator can see exactly which service failed. Nothing here silently masks a
broken plugin.

### The real fix, if this recurs

Make the gateway degrade instead of exit: compose the supergraph from the
targets that *did* answer and add late arrivals via the existing
`update-apollo-router` BullMQ worker (`src/mq/workers/workers.ts`), which
already calls `restartRouter()` when `joinErxesGateway()` enqueues
`service-discovery-updated`. That machinery means a plugin registering **late**
is picked up **without a gateway restart** — the only gap is that the *initial*
`retryGetProxyTargets()` is all-or-nothing. Changing it is an upstream-behaviour
change to a vendored dependency and is deliberately **not** done here.
