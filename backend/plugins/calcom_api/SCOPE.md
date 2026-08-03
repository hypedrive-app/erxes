# Cal.com plugin — what is built, and what is deliberately not

Cal.com's v2 API is **285 operations across 181 paths**. This plugin implements
a deliberate subset. This file records what was left out and why, so the next
person does not have to re-derive it — and can tell a considered omission from
an oversight.

Counts below come from parsing `docs/api-reference/v2/openapi.json` in the
`calcom-preprivate` fork. `scripts/verify-calcom-contract.cjs` asserts coverage
against that same spec on every run, so a Cal.com upgrade that adds a Bookings
endpoint fails the check rather than going quietly missing.

---

## Built

| Area | Operations | Status |
|---|---|---|
| **Bookings** | 17 / 17 | Complete. List, detail, create, cancel, reschedule, confirm/decline, mark-absent, location, reassign, recordings, transcripts, calendar-links, references, conferencing-sessions, by-seat. |
| **Webhooks** | 5 / 5 | Self-provisioning: the plugin creates, verifies and repairs its own subscription. |
| **Event Types** | read | Listing bookable types (for "book a time"). |
| **Slots** | read | Live availability. |

Plus the inbound half: a signed webhook receiver mirroring 8 booking triggers,
attendee→contact linking, conformity edges, automation triggers/actions, and a
reconciliation backfill.

---

## Not built, with reasons

### Surfaced in the API but not in the UI

These are reachable via GraphQL/tRPC for automations, but have no screen.

| Capability | Why no UI |
|---|---|
| `reassign` / `reassign/{userId}` | Applies only to team **round-robin** event types. It is a dispatcher/ops action, not a rep-facing one, and this deployment uses fixed-host events — a button most users could never use. Build a UI when team round-robin is adopted. |
| `references`, `conferencing-sessions` | Diagnostic data (which calendar event and conferencing session the booking created). Answers "the booking exists in Cal.com but is not in my calendar". Useful when debugging, noise on a sales screen. |
| `by-seat/{seatUid}` | Seated/group event types. Verified against Cal.com's docs: this is the webinar/group-consultation pattern. No B2B CRM models per-seat attendees as first-class, and we do not use seated types. |

### Deliberately withheld

| Capability | Why |
|---|---|
| **Transcripts** | Not surfaced *and not queried*. Consent stakes are higher than recordings — a transcript is full verbatim text — and Cal.com's retrieval links are short-lived, so a rendered link would often be dead by the time it was clicked. Needs a stable authenticated retrieval path first. |
| **Recording playback/download** | Recordings are **link-out only**. A meeting recording is consent-sensitive (two-party-consent jurisdictions, GDPR) and the consent was captured — or not — in Cal.com. Downloading or embedding would make the CRM a second controller of that media. HubSpot gates the equivalent Zoom sync behind an explicit org-level toggle. **Do not turn this into an inline player.** |

### Out of scope for this deployment

| Group | Ops | Why |
|---|---|---|
| `Deprecated: Platform / *` | 18 | OAuth Clients, Managed Users, and platform webhooks. Confirmed deprecated by tag name and by a `<Warning>These endpoints are deprecated and will be removed` note in their descriptions. Avoid outright. |
| `Orgs / *`, `Orgs / Teams / *`, `Managed Orgs`, `Teams / *` | ~110 | Every path requires an `{orgId}` or `{teamId}` that only exists in Cal.com's **organizations product tier**. This is a single-tenant self-host with no org context to pass. |
| **Routing forms** | 11 | Verified: every functional path is org- or team-scoped. The one exception, `POST /v2/routing-forms/{id}/calculate-slots`, is an explicitly non-persisting preview. Lead-qualification-to-booking would require adopting Cal.com's org/team model wholesale. |
| `Calendars`, `Cal Unified Calendars` | 24 | Duplicates Cal.com's own calendar-connection UX. Only relevant if erxes rendered its own calendar feeds, which it does not. |
| `Verified Resources` | 24 | Verifying attendee emails/phones outside CRM contact records. erxes contacts are already the source of truth for that. |
| `Api Keys`, `OAuth2` | 3 | Credential issuance, handled once during setup. |

### Considered, not yet built

Worth building if the need appears — listed so they are not rediscovered from
scratch.

| Capability | Ops | What it would give |
|---|---|---|
| **Schedules** (read-only) | 6 | Show a host's working hours beside the slot picker, so a rep sees *why* a day has no availability. `GET /v2/schedules`, `/schedules/default`, `/schedules/{id}`. Read only — editing availability is genuinely Cal.com's own surface. |
| **Conferencing default** | 7 | Show/set the default video provider. `GET /v2/conferencing`, `/conferencing/default`, `POST /v2/conferencing/{app}/default`. Thin, but it is the setting people ask about. |
| **Event-type private links** | 4 | Generate a single-use booking link for one lead, from the contact panel. |

---

## Open questions

Recorded rather than guessed at:

- Whether `PATCH /v2/webhooks/{id}` can rotate a secret **in place** without
  dropping in-flight deliveries. Provisioning currently assumes retries cover
  the gap — true per Cal.com's retry behaviour, but not directly tested.
- Whether `secret` is omitted from `GET /v2/webhooks/{id}` responses by policy
  or merely documented loosely. `UserWebhookOutputDto` lists it as a property
  but **not** in `required`, which is why provisioning always generates and
  pushes a secret rather than trying to read one back.
- Our webhook receiver handles 8 of Cal.com's 21 trigger types. The remaining
  13 (`FORM_SUBMITTED`, `OOO_CREATED`, `RECORDING_READY`,
  `AFTER_HOSTS_CAL_VIDEO_NO_SHOW`, …) were judged not to describe a booking
  state the CRM mirrors. Worth revisiting if any becomes interesting.
