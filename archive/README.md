
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
