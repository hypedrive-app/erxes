
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
