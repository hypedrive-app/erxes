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
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

Then open `https://$ERXES_UI_DOMAIN` and complete the owner signup.

## Two hostnames are required

- `ERXES_UI_DOMAIN` → core-ui (nginx)
- `ERXES_API_DOMAIN` → gateway (GraphQL + WebSocket + core-api passthrough)

They cannot be collapsed onto one host: the gateway mounts `app.use('/', …)`
onto core-api, so it serves `/initial-setup`, `/get-frontend-plugins`,
`/core-login`, `/oauth/*`, `/upload-chunked/*` etc. from its root, and the UI
derives every API path from the single `REACT_APP_API_URL` base. Both names
resolve via the existing `*.sharksmarketing.com` wildcard.

## Two footguns encoded in the compose

1. **`plugin-core-api` is a load-bearing service name.** In production
   `joinErxesGateway()` computes the address as
   `http://plugin-${name}-api:${port}`, so core-api advertises itself as
   `http://plugin-core-api:3300`. Renaming the service breaks discovery.
   Future plugins must be named `plugin-<name>-api`.
2. **`ENABLED_PLUGINS` must be UNSET, never `""`.** `getPlugins()` does
   `['core', ...(process.env.ENABLED_PLUGINS?.split(',') || [])]` and
   `''.split(',') === ['']`, producing a phantom nameless plugin. Observed
   result: the gateway logs `Waiting for plugin  to join service discovery`
   forever and never serves `/graphql`.

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
- No plugins enabled, so this is core CRM only (no sales/frontline/etc. UI).
- Version pinning is essential; `main` is pushed to many times a day.
