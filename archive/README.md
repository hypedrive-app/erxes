
- `frontend/plugins/frontline_ui/brand/` — staged brand PNG/SVG/ICO for serving org logo from the frontline_ui nginx origin. Abandoned: erxes has a NATIVE file store (core-api /upload-file + /read-file) which is the correct place for org branding, so the custom static route was unnecessary.

## plivo-diagnosis-credentials/ (2026-07-31)
Live Plivo authId/authToken, endpoint password and test JWTs, captured while
diagnosing the softphone registration failure. Secrets — delete after reading.

## frontend/core-ui — dead-on-arrival files (2026-07-31)
Both added in `badf583` ("add cpCompanies query"), unreachable since, and the only
remaining core-ui typecheck errors. Verified zero importers before moving.

| Path | Why |
|---|---|
| `src/modules/products/utils/tableUtils.tsx` | imports `./makeData`, which has never existed in git history |
| `src/pages/settings/workspace/PermissionPage.tsx` | imports `Permission` + `UsersGroupSidebar`, which exist nowhere; orphan duplicate of the routed `workspace/team-member/PermissionPage.tsx` |

## frontend/plugins/payment_ui — empty golomtbank container (2026-08-01)

| Path | Why |
|---|---|
| `src/modules/corporateGateway/golomtbank/corporateGateway/accounts/containers/Row.tsx` | 0-byte file, never implemented. The two `import Row from './Row'` statements in the golomtbank module resolve to `components/Row.tsx` in their own directories, not to this container. Verified zero importers (`grep -rn "containers/Row"` across `frontend`/`backend` returns nothing) before moving. |

## frontend/plugins — per-plugin UI Dockerfiles + nginx configs (2026-08-01)

Superseded by the single `frontend/plugins/Dockerfile.plugins`, which builds all
three remotes and serves them from ONE nginx under `/latest/<plugin>_ui/`. That
matches how erxes actually distributes plugin UIs: all ten `ci-ui-*.yml`
workflows sync into the same bucket under a per-plugin prefix
(`s3://erxes-next/$FOLDER/<plugin>_ui/`), and core-api's
`${PLUGIN_CDN_URL}/${version}/${plugin}_ui/remoteEntry.js` takes ONE base URL
with the path selecting the plugin. Three containers could not be addressed by
that single value without Traefik path routing, whose `addprefix` middleware
doubled the path (`/latest/sales_ui/latest/sales_ui/remoteEntry.js` → 404).
Compose services `frontline-ui`, `sales-ui`, `operation-ui` collapse into
`plugins-ui`. Verified only `deploy/README.md` referenced these (updated).

| Path | Why |
|---|---|
| `frontline_ui/Dockerfile.build` | Folded into `Dockerfile.plugins`, which does the same `nx build` + `test -f remoteEntry.js` + COPY-to-`latest/frontline_ui` for all three plugins behind one shared `pnpm install`. |
| `sales_ui/Dockerfile.build` | Same. |
| `operation_ui/Dockerfile.build` | Same. |
| `sales_ui/nginx/default.conf` | Byte-identical to `frontline_ui/nginx/default.conf` apart from comments — its rules (no-cache on stable-named `remoteEntry.js`, immutable on hashed chunks, CORS on fonts) are per-URL and name no plugin. The frontline copy is retained in-tree as the shared config. |
| `operation_ui/nginx/default.conf` | Same. |

## dist-build-outputs/ (2026-08-03)

Local `nx build` outputs for gateway, core-api, automations and the
frontline/sales/operation/calcom plugin APIs.

Moved here rather than left in place because `pnpm-workspace.yaml` globs
`backend/**`, and each of these `dist/` directories contains a generated
`package.json`. pnpm therefore treated them as workspace packages and wrote
seven phantom importers (`backend/gateway/dist:` etc.) into `pnpm-lock.yaml`
during a lockfile regeneration. They are gitignored build artifacts, they never
exist in the clean checkout Docker builds from, and they can be regenerated at
any time with `pnpm nx build <project>`.

Safe to delete.

## frontend/plugins/calcom_ui/src/assets/ (2026-08-04)

`example-icon.svg` and `example-image.svg` — placeholder artwork emitted by
create-plugin. Nothing referenced them: the plugin's navigation icon is a
Tabler component (IUIConfig types `icon` as React.ElementType, so a file could
not be used there anyway).

Safe to delete.

## backend/plugins/frontline_api/.../instagram/controller/instagramController.ts (2026-08-05)

`instagramWebhookHandler` and its helpers — a second, parallel Instagram
webhook handler that `routes.ts` never imported. Confirmed dead via repo-wide
grep: the only references to it were its own definition and a comment pointing
out that it was dead.

Not revived, because it could never have worked. It branches on
`field === 'feed'` to call `receivePost`, but `feed` is a Facebook *Page*
webhook field — Meta's Instagram webhook reference lists no `feed` field at
all (comments arrive as `comments`, and there are `live_comments`, `mentions`,
`messages`, `message_edit`, `message_reactions`, `messaging_seen`,
`messaging_postbacks`, `messaging_referral`, `messaging_handover`,
`story_insights`, `standby` — no `feed`). This is Facebook controller code
copy-pasted onto Instagram; wiring it up would have registered a branch that
Instagram traffic can never enter.

`receivePost.ts` is left in place: it is the only remaining caller-less piece,
but it is Instagram *post* plumbing that a future `mentions`-based feature
would plausibly reuse, and it is referenced by comment handling in `store.ts`.

Safe to delete.

## payment_ui corporateGateway (old structure) — archived 2026-08-09

Upstream PR #8893 ("fix: payment corporate gateway", commit c2471522) rewrote
`frontend/plugins/payment_ui/src/modules/corporateGateway/` and deleted these
files. Our only changes to them were mechanical build fixes (import-path
rewrites and a Radix `Select` API migration, plus filling one zero-byte file
upstream had committed empty) — no business logic of ours. Upstream's
replacement (`settings/`, `configs/graphql/`) supersedes them and nothing
references the old paths, so the merge takes upstream's deletion.

Kept here only as a reference copy; safe to delete.
