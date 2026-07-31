
- `frontend/plugins/frontline_ui/brand/` — staged brand PNG/SVG/ICO for serving org logo from the frontline_ui nginx origin. Abandoned: erxes has a NATIVE file store (core-api /upload-file + /read-file) which is the correct place for org branding, so the custom static route was unnecessary.

## plivo-diagnosis-credentials/ (2026-07-31)
Live Plivo authId/authToken, endpoint password and test JWTs, captured while
diagnosing the softphone registration failure. Secrets — delete after reading.
