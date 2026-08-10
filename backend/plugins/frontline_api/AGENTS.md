# `frontline_api` Plugin Guide

## Identity

- **Plugin:** `frontline`
- **Project:** `frontline_api`
- **Layer:** `Backend API`
- **Path:** `backend/plugins/frontline_api`
- **Last synchronized:** `2026-08-10`

## Scope

### Owns

- Inbox conversations, conversation messages, and the Elasticsearch/Mongo
  conversation query builders.
- Channels and channel membership, including channel scope (`team` vs
  `personal`) and the role model (`admin` / `lead` / `member`).
- Integrations records (`Integrations` collection) and their lifecycle
  (create / edit / repair / archive / remove) across messenger, lead, webhook,
  and external kinds.
- Channel integration runtimes hosted in this service and their webhook
  ingestion, message delivery, and bot automation: Facebook (Messenger + Page
  comments), Instagram, IMAP, Discord, and Call (SIP/CDR).
- Response templates.
- Ticketing: boards, pipelines, statuses, tickets, activities, notes, ticket
  configs, plus ticket import/export handlers.
- Forms: form definitions, fields, and form submissions (with submission export).
- Knowledge base: topics, categories, articles, and the AI knowledge source
  provider that indexes articles.
- Frontline reports.
- Plugin-owned automation triggers/actions/bots contributed to the platform
  automation engine.

### Does not own

- Users, brands, tags, permission groups, customers, teams, permissions storage,
  file upload configuration, and segments infrastructure — owned by `core-api`
  and read over tRPC, never modelled here.
- The automation execution engine, wait conditions, or trigger dispatch — those
  live in `erxes-api-shared/core-modules` and are consumed, not modified.
- Meta/Facebook app registration and page tokens beyond what is stored on this
  plugin's own integration and account documents.
- Any UI surface; `frontline_ui` owns routes, forms, and rendering. The
  `frontline` i18n namespace is served from
  `backend/gateway/src/locales/{en,mn}/frontline.json`, which is gateway-owned,
  not plugin-owned.
- Other plugins' collections or service implementations.

## Current Capabilities

- Runs as a federated subgraph plus tRPC service on port `3304`, with GraphQL
  subscriptions enabled.
- Multi-channel inbox with membership-scoped conversation visibility.
- **Team channels** — many members, invitable through `channelAddMembers`.
- **Personal channels** — a single user's private inbox with exactly one member
  (the owner, as `admin`) and no invite path. Provisioned lazily: it comes into
  existence the first time it is asked for, either by the `getPersonalChannel`
  query (the settings page reads it) or by an integration created without a
  channel.
- A personal channel accepts every integration kind a team channel accepts.
  There is no personal-only or team-only kind list. When
  `integrationsCreateExternalIntegration` is called without a `channelId`, the
  integration attaches to the caller's personal channel regardless of kind.
- Receives Facebook and Instagram webhooks over Express and turns them into
  customers, conversations, comment conversations, and post conversations.
- Sends agent replies and bot messages through the Graph Send API, including
  private replies addressed by `comment_id`.
- Publishes posts to a connected page (`facebookCreatePost`), optionally with up
  to 10 uploaded images (passed as storage keys) staged as unpublished photos and
  published as one carousel, under a per-page hourly rate limit and an audit log
  of every attempt.
- Resolves the Meta app per integration kind, so page posting can run on its own
  `FACEBOOK_POST_APP_ID`/`FACEBOOK_POST_APP_SECRET` credentials while Messenger
  keeps the shared app.
- Runs Facebook/Instagram/Discord/inbox/ticket automation triggers and actions,
  including bot message sequences with postback buttons and wait conditions.
- Boots the Call app, the IMAP poller, and the Discord gateway client from
  `onServerInit`.
- Ticket boards/pipelines, response templates, forms, knowledgebase articles,
  and report aggregations.
- Contributes permissions, notifications, segments, references, and
  import/export handlers to the platform through `meta/`.

## Architecture

| Area                 | Path                                                                        | Responsibility                                                                                          |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Bootstrap            | `src/main.ts`                                                               | `startPlugin({ name: 'frontline', port: 3304 })`, wires tRPC, routes, meta, and every surface           |
| Models               | `src/connectionResolvers.ts`                                                | Per-subdomain model container for all modules                                                           |
| GraphQL              | `src/apollo/`                                                               | Aggregated `typeDefs` and `resolvers` across modules                                                    |
| tRPC                 | `src/init-trpc.ts`                                                          | `appRouter` for service-to-service calls                                                                |
| HTTP                 | `src/routes.ts`                                                             | Mounts `/facebook` and `/instagram` webhook routers                                                     |
| Platform extensions  | `src/meta/`                                                                 | automations, permissions, notifications, segments, references, import/export                            |
| Channels             | `src/modules/channel/`                                                      | Channel + ChannelMember models, schema, resolvers, role checks                                          |
| Inbox                | `src/modules/inbox/`                                                        | Conversations, messages, integrations, widget/clientportal schemas, `receiveInboxMessage`               |
| Conversation queries | `src/conversationQueryBuilder.ts`, `src/modules/inbox/conversationUtils.ts` | Mongo and Elasticsearch conversation filters (membership-scoped)                                        |
| Integrations         | `src/modules/integrations/<kind>/`                                          | facebook, instagram, imap, discord, call, trpc                                                          |
| FB automation        | `src/modules/integrations/facebook/meta/automation/`                        | Comment/message triggers and actions, bot message generation                                            |
| FB page posting      | `src/modules/integrations/facebook/postService.ts`, `postGuard.ts`          | Post publishing pipeline (validation, photo staging, cleanup, permalink) and its rate limit + audit log |
| FB app resolution    | `src/modules/integrations/facebook/commonUtils.ts`                          | `resolveFacebookApp`, `facebookAppSelector`, `facebookAccountSelector`                                  |
| Ticket               | `src/modules/ticket/`                                                       | Boards, pipelines, statuses, tickets, activities, notes                                                 |
| Forms                | `src/modules/form/`                                                         | Forms, fields, submissions                                                                              |
| Knowledge base       | `src/modules/knowledgebase/`                                                | Topics, categories, articles, AI knowledge source                                                       |
| Migrations           | `src/migrations/`                                                           | Plugin-owned data migrations                                                                            |

## Contracts

### Provides

- GraphQL subgraph on port `3304` (queries, mutations, subscriptions) federated
  by the gateway.
- GraphQL (federated subgraph): `getChannel`, `getChannels`, `getMyChannels`,
  `getChannelMembers`; `channelAdd`, `channelUpdate`, `channelRemove`,
  `channelAddMembers`, `channelRemoveMember(s)`, `channelUpdateMember`.
- GraphQL: `getMyChannels(name, sortField, sortDirection)` — the caller's
  memberships, sorted in the database. `sortField` accepts `name` or `createdAt`
  and falls back to `createdAt` for anything else; `sortDirection` is `1` or
  `-1`, defaulting to `-1`. Counts are field resolvers and `updatedAt` is not a
  schema path, so neither is sortable. The query runs under
  `collation({ locale: 'en', strength: 1 })`, so `name` sorts case- and
  diacritic-insensitively instead of in Mongo's default byte order.
- GraphQL: `getChannels` returns **team channels only** on every branch
  (`channelIds`, `integrationId`, see-everything, and membership), including the
  caller's own personal channel. Personal inboxes are reached only through
  `getPersonalChannel`.
- GraphQL: `getPersonalChannel: Channel` — **get-or-create**. Reading it
  provisions the caller's personal channel; it never returns null for an
  authenticated user. This is the lazy provisioning entry point.
- GraphQL: `Channel.conversationCount` and `Channel.unreadConversationCount` —
  resolved per request from the channel's integrations, never from the stored
  `conversationCount` field on the document, which is legacy and not maintained.
  `unreadConversationCount` is per-viewer: open conversations whose
  `readUserIds` lacks the caller. Both cost a query per channel, so select them
  only where the number is shown.
- GraphQL: `Channel.scope` (`"team" | "personal"`; absent on channels written
  before the field existed — treat missing as `team`).
- GraphQL: `channelAdd(..., scope: String)` — defaults to `team`. `personal`
  rejects non-empty `memberIds` and errors if the caller already owns one.
  `channelUpdate` deliberately exposes no `scope` argument, so a channel's scope
  is fixed at creation.
- GraphQL: `integrationsCreateExternalIntegration(kind, channelId, name,
accountId, brandId, data)` — `channelId` is **nullable** for every kind;
  omitting it attaches the integration to the caller's personal channel and
  provisions that channel if it does not exist yet.
- GraphQL: `integrationsGetUsedTypes` and
  `integrationsGetUsedTypesByChannel(channelId: String, scope: String)` — the
  integration kinds that currently have at least one active integration:
  repository-wide for the former, and for the latter within the caller's
  visible channels, optionally narrowed by channel id and/or channel scope.
  Both return `[{ _id: kind, name: label }]` filtered through the
  `getIntegrationsKinds()` label map. `scope: "team"` also matches legacy
  channels that have no `scope` field. The by-channel query requires an
  authenticated user and never reveals another user's personal inbox.
  `integrationsGetUsedTypesByChannel` returns
  `[integrationsGetUsedTypesByChannel]` (its own type, not the shared
  `integrationsGetUsedTypes`), carrying `conversationCount` and
  `unreadConversationCount` per kind for the matched channels.
- tRPC `appRouter` consumed by other services, including
  `inbox.updateUserChannels({ channelIds, userId })` — replaces a user's team
  channel memberships; never touches their personal channel.
- HTTP routes in `src/routes.ts` and provider webhooks under
  `src/modules/integrations/*`: Express webhook routes `/facebook/*` and
  `/instagram/*`, including the OAuth entry points `/facebook/fblogin`,
  `/facebook/kind/:kind/fblogin`, and `/instagram/iglogin`.
- Automation constants (`triggers`, `actions`, `bots`, AI knowledge sources) and
  worker producers exported from `src/meta/automations.ts`.
- Permissions, notification types, segment definitions, references, and
  ticket/form-submission import-export handlers from `src/meta/`.

### Consumes

- `erxes-api-shared/utils`: `startPlugin`, `sendTRPCMessage`, `fetchEs`,
  `getEnv`, `sendWorkerQueue`, `getUniqueValue`, `randomAlphanumeric`,
  `schemaWrapper`, `mongooseStringRandomId`.
- `erxes-api-shared/core-modules`: `sendNotification`, `canGroup`,
  import/export producer handlers, automation types,
  `replaceOutputPlaceholders`, `splitType`, `sendAutomationTrigger`,
  `EXECUTE_WAIT_TYPES`, `attachmentSchema`.
- `core` over tRPC — brands, tags, users, structure,
  `configs.getFileUploadConfigs`, `users.findOne`.
- Facebook Graph API through `fbgraph` (`graphRequest` in
  `src/modules/integrations/facebook/utils.ts`).

## Data and State

- Tenant-scoped Mongo collections generated per `subdomain` through
  `generateModels`; all reads and writes are tenant-scoped.
- Collections are namespaced per module: `Facebook*`, `Instagram*`, `Call*`,
  `Discord*`, `Imap*`, plus inbox (`Conversations`, `ConversationMessages`),
  channel, ticket, form, and knowledge base collections.
- `channels.scope` — `'team' | 'personal'`, default `'team'`. Legacy documents
  have no `scope` field; all reads treat a missing value as `team`, so **no
  backfill migration is required**.
- Partial unique index `channels { createdBy: 1 }` with
  `partialFilterExpression: { scope: 'personal' }` — enforces at most one
  personal channel per user and makes concurrent creation race-safe (the loser
  catches duplicate-key `11000` and reuses the winner).
- Unique index `channelMembers { channelId: 1, memberId: 1 }`.
- Migrations under `src/migrations/` cover call conversation content, CDR dates,
  channels, forms, response templates, and tickets.
- Facebook upload configuration is cached in a module-level variable in
  `src/modules/integrations/facebook/utils.ts` and is **not** keyed by
  subdomain — treat it as a known cross-tenant hazard when touching that file.

## Local Invariants

- The Plivo call trigger is emitted from INSIDE the hangup callback's
  conditional claim (`findOneAndUpdate` on `endedAt: {$exists:false}`), and
  before the early return for a call with no conversation. Both matter: the
  claim is what makes a redelivered webhook a no-op rather than a second
  execution, and an unanswered call from an unknown number has no conversation
  yet is exactly what a follow-up workflow is for.
- Plivo has no transfer verb. `transferPlivoCall` redirects the caller's leg
  (`legs: 'aleg'`) to a fresh answer URL carrying `TransferTo`; redirecting the
  agent's leg instead would move the agent and strand the customer.
- A WhatsApp reaction is stored on the message it annotates
  (`WhatsappConversationMessages.reactions`), never as a message row. Meta's
  own client renders it beneath the bubble, and giving it a row puts a bubble in
  the thread for something the contact never sent — which is what
  `extractContent` used to do.
- `reactions[].isCustomer` is stored, not derived. A contact's reaction is keyed
  by `wa_id` and an agent's by erxes user id, so nothing at read time can tell
  the two id spaces apart.
- The inbox dispatches BOTH replies and typing notifications to
  `handleWhatsappIntegration` with `type: 'whatsapp'`, distinguished only by
  `action`. Anything added there must branch on `action` — a payload that falls
  through to the message path throws, and the caller's bare catch swallows it.
- A personal channel always has exactly one `ChannelMembers` row: its owner,
  with role `admin`. Nothing may add, remove, or demote that member.
  `channelAdd(scope: "personal")` rejects `memberIds`, `channelAddMembers`
  rejects personal channels, and `removeChannelMember` / `updateChannelMember`
  already refuse to drop the last admin.
- `updateUserChannels` must exclude personal channels from both its delete and
  its insert — revoking that membership would hide a user's own inbox from them.
- Conversation visibility stays membership-based. `integrationsFilter` and
  `channelFilter` must not gain a scope-specific branch; a personal channel is
  correctly private because it has exactly one member.
- A see-everything channel listing (`isOwner` / `showAllChannels`) must still
  exclude other users' personal channels. `visibleChannelsFilter` in
  `src/modules/channel/utils.ts` is the one implementation of that rule; any
  new resolver that reads channels — from any module — composes it rather than
  querying `Channels` directly, and narrows with `$and` so a caller-supplied
  `_id` can never widen the result.
- Conversations reference an integration, not a channel. Any per-channel
  conversation count must resolve the channel's integration ids first; never
  read `channels.conversationCount` / `channels.openConversationCount`, which
  are stale legacy fields.
- An integration may never be attached to another user's personal channel. That
  ownership check is the only scope-based restriction on integration creation —
  do not reintroduce a per-kind allowlist for personal channels.
- The Facebook OAuth `state` must stay a query-less url. When
  `FACEBOOK_LOGIN_REDIRECT_URL` points at the shared authorize redirector, that
  service builds the callback as `${state}/fblogin?code=...`, so any query
  string in `state` lands before the `/fblogin` path and 404s. Extra context
  such as the integration kind travels as a `/kind/<kind>` path segment.
- Facebook/Instagram Send API calls that carry a `tag` must also carry
  `messaging_type: 'MESSAGE_TAG'`; a `sender_action` request must carry neither.
  `handleFacebookMessage.ts` is the reference implementation.
- A Page may send exactly one private reply per comment, and that reply does not
  open the 24-hour messaging window. Any message after it needs a user
  interaction, an already-open window, or a valid tag.
- In `sendReply`, request-level Graph error codes (`1`, `10`, `100`, `10900`)
  must not flip `FacebookIntegrations.healthStatus` to a token state — only
  genuine token and permission failures may.
- Page access tokens never leave the service: `facebookGetAccounts` excludes
  `token`/`tokenSecret` and the integration queries exclude
  `facebookPageTokensMap`.
- `facebookCreatePost` resolvers stay thin — validation, photo staging, staged
  media cleanup, and audit logging belong to `publishPagePost` in
  `postService.ts`. A post carries images or a link preview, never both.
- Accounts stored before `appId` existed belong to the shared app; app-scoped
  queries must go through `facebookAppSelector`/`facebookAccountSelector` so
  those legacy accounts stay visible.
- Automation operation and node type names stay prefixed with the plugin and
  module (`frontline:facebook.comments.create`).
- Facebook/Instagram automations must resolve their integration and bot from the
  request's own models; never read another plugin's collections.
- Every resolver, model call, worker, and route resolves models from the request
  `subdomain`.
- Schemas are defined with `new Schema(...)` and explicit fields; do not
  introduce new `schemaWrapper` usage — existing usages stay as they are.

## Validation

- `pnpm nx lint frontline_api` (repository-wide pre-existing errors exist in
  `src/public/widget/messengerWidget.bundle.js` and some ticket/report files;
  lint the files you touched)
- `pnpm nx build frontline_api`
- `npx tsc -p backend/plugins/frontline_api/tsconfig.json --noEmit`
- No `test` target is defined in `project.json`; do not invent one.
- Smoke: connect an IMAP account without a `channelId` → a `Personal inbox`
  channel is created with one admin member and the integration attaches to it;
  a second connect reuses the same channel; the same holds for a non-mailbox
  kind such as a webhook; creating an integration against another user's
  personal `channelId` is rejected; `channelAddMembers` on it fails; no user's
  `getChannels` lists it — not even the owner's.
- Smoke: comment on a subscribed Facebook page post that matches an active
  comment trigger, then confirm the public comment reply is posted and the
  private reply arrives in Messenger without a `#10` or `Invalid parameter`
  entry in the `erxes-facebook:error` log.

## Recent Changes

<!-- Newest first. Keep at most 10 entries. -->

### `2026-08-10` — Plivo: automations, blind transfer, call cost

- **Summary:** Plivo had no automation surface at all — every other channel
  (WhatsApp, Facebook, Instagram, Discord) declares one. It now has a
  `Call Ended` trigger, filterable by direction and outcome, emitted from the
  hangup callback's conditional claim so a redelivery cannot fire it twice, and
  a `Place a Call` action. Blind transfer was added (Plivo has no transfer verb
  — it is a redirect of the caller's leg to fresh XML). `billDuration`/
  `totalCost` were written on every call and absent from the GraphQL schema
  entirely; both are now exposed and the cost shows in call history.
- **Affected areas:** `modules/integrations/plivo/meta/automation/*` (new),
  `.../constants.ts`, `.../utils.ts`, `.../controller/{controller,receiveCall}.ts`,
  `.../@types/index.ts`, `.../graphql/{schema/plivo.ts,resolvers/{mutations,queries}.ts}`,
  `src/meta/automations.ts`.
- **Contracts changed:** adds the `frontline:plivo.calls` trigger and its
  `.create` action, the `plivoTransferCall` mutation, and
  `billDuration`/`totalCost` on `PlivoCallHistory`.

### `2026-08-10` — WhatsApp: reactions land on the message, typing works

- **Summary:** Reactions are stored on the reacted-to message and exposed as
  `ConversationMessage.whatsappReactions`, with a `whatsappReactToMessage`
  mutation for leaving and clearing one; inbound reactions no longer become
  their own bubble. Typing notifications now branch on `action` in the message
  broker instead of falling into the send path and throwing on every keystroke.
  Locations and contact cards became reachable through `extraInfo`, the
  automation action gained the same three rich types, and account-level
  `value.errors[]` now flips `healthStatus` instead of being ignored.
- **Affected areas:** `modules/integrations/whatsapp/{messageBroker.ts,handleWhatsappMessage.ts,utils.ts}`,
  `.../controller/receiveMessage.ts`, `.../db/definitions/conversationMessages.ts`,
  `.../@types/index.ts`, `.../graphql/{schema/whatsapp.ts,resolvers/mutations.ts}`,
  `.../meta/automation/sendMessage.ts`,
  `modules/inbox/graphql/{schemas/conversation.ts,resolvers/conversationMessage.ts}`.
- **Contracts changed:** adds `whatsappReactToMessage` mutation, the
  `WhatsappReaction` type, and `ConversationMessage.whatsappReactions`.

### `2026-08-10` — WhatsApp: interactive, reaction, location and contact sends

- **Summary:** Adds the outbound message types the Cloud API supports and this
  integration lacked — interactive (reply buttons, list menus, CTA URL),
  reactions, location pins and contact cards. Interactive is wired into the
  agent send path via `extraInfo.whatsappInteractive`, the same envelope
  templates already ride on; the other three are API-level only for now.
- **Affected areas:** `modules/integrations/whatsapp/utils.ts` (four new send
  functions), `@types/index.ts` (dispatch types), `handleWhatsappMessage.ts`
  (dispatch + validation).
- **Contracts changed:** None existing. Interactive obeys the 24-hour customer
  service window like every other free-form message — only templates may be
  sent outside it, so the existing guard covers it unchanged.

### `2026-08-10` — WhatsApp automations can reply

- **Summary:** Adds the `Send WhatsApp Message` action, so a workflow started by
  the WhatsApp trigger can answer the customer. Without it WhatsApp was the only
  channel that could be listened to but not spoken on — Facebook, Instagram and
  Discord each ship a send action, and the shared inbox action only writes into
  the agent's thread, it does not reach the Cloud API.
- **Affected areas:** new
  `modules/integrations/whatsapp/meta/automation/sendMessage.ts`,
  `modules/integrations/whatsapp/constants.ts`,
  `modules/integrations/whatsapp/meta/automation/{constants,workers}.ts`,
  `meta/automations.ts`.
- **Contracts changed:** Adds action `frontline:whatsapp.messages.create`.
  Config: `text`, `template` ({name, languageCode, components?}), `attachments`
  ({url, name, type}[]), `replyToMessageId`, `quoteTriggerMessage`,
  `conversationId`. Output: `messageId, mid, content, conversationId,
  templateName, attachmentCount`. It delegates to `handleWhatsappMessage`, so
  media upload, the 24-hour-service-window error, the auth-failure healthStatus
  flip, and message persistence stay identical to an agent reply. Templates are
  the only send that works outside the 24-hour window.

### `2026-08-10` — WhatsApp inbound messages can start automations

- **Summary:** Inbound WhatsApp messages now emit an automation trigger, so a
  workflow (e.g. an AI agent auto-reply) can run on them. Previously the
  WhatsApp path called `receiveInboxMessage` and stopped — no channel emits
  from that shared layer, so no automation could ever fire for WhatsApp while
  Facebook, Instagram, Discord and the messenger widget all worked.
- **Affected areas:** `modules/integrations/whatsapp/constants.ts` (automation
  identifiers), new `modules/integrations/whatsapp/meta/automation/`
  (`types.ts`, `constants.ts`, `workers.ts`),
  `modules/integrations/whatsapp/controller/receiveMessage.ts` (emission),
  `meta/automations.ts` (registration).
- **Contracts changed:** Adds trigger `frontline:whatsapp.messages` with
  variables `_id, content, conversationId, customerId, from, phoneNumberId,
  createdAt`. No existing contract altered; no actions added yet, so replying
  from a workflow still goes through the shared inbox action.

### `2026-08-07` — Indexed knowledge base articles carry their category name

- **Summary:** Article documents sent for AI indexing are now titled
  `Category › Article` and carry the category title as a keyword, so articles
  named only `1`, `2`, `3` are still reachable by the subject that lives on
  their category. Categories are resolved in one batched query per document
  batch.
- **Affected areas:** `src/modules/knowledgebase/meta/automations.ts`
- **Contracts changed:** `None` (same `TKnowledgeDocument` shape; `title` and
  `metadata.keywords` are richer). Existing chunks keep their old titles until
  the source is re-indexed.

### `2026-08-06` — AI context history is bounded to messages older than the trigger

- **Summary:** `generateAiContext` now excludes messages created at or after the
  triggering message, so an execution that starts seconds later no longer sees
  newer customer messages as its own conversation history.
- **Affected areas:** `src/modules/inbox/meta/automation/workers.ts`,
  `src/modules/integrations/facebook/meta/automation/workers.ts`,
  `src/modules/integrations/discord/meta/automation/workers.ts`
- **Contracts changed:** `None` (same `TAiContext` shape; `history` is narrower)

### `2026-08-06` — Knowledge base articles support whole-source AI indexing

- **Summary:** The knowledge base AI source now streams every published article
  through a cursor-paginated batch when the agent selects the whole scope,
  instead of only resolving an explicit article id list. Single-document
  refreshes narrow that batch with `candidateSourceIds`.
- **Affected areas:**
  `src/modules/knowledgebase/meta/automations.ts`
  (`frontlineAiKnowledgeProvider.loadAiKnowledgeDocumentBatch`),
  `src/meta/automations.ts` (knowledge source declaration)
- **Contracts changed:** The `knowledgebase.article` knowledge source declares
  `supportsFullScope: true`, and its `loadAiKnowledgeDocumentBatch` handler
  honours the new `scope: 'all' | 'selected'` producer input.

### `2026-08-06` — Conversation counts on channels and used integration kinds

- **Summary:** Added `Channel.conversationCount` /
  `Channel.unreadConversationCount` field resolvers, and gave
  `integrationsGetUsedTypesByChannel` its own return type carrying the same two
  counts per integration kind, folded from one aggregation over the matched
  channels' integrations.
- **Affected areas:**
  `src/modules/channel/graphql/{schemas/channel.ts,resolvers/customResolvers/channel.ts}`,
  `src/modules/inbox/graphql/{schemas/integration.ts,resolvers/queries/integrations.ts}`.
- **Contracts changed:** `Channel` gained two nullable `Int` fields;
  `integrationsGetUsedTypesByChannel` now returns
  `[integrationsGetUsedTypesByChannel]` instead of `[integrationsGetUsedTypes]`
  — same `_id` / `name` fields, plus the two counts.

### `2026-08-06` — Personal channels accept every integration kind

- **Summary:** Removed `PERSONAL_INTEGRATION_KINDS` and the kind check in
  `integrationsCreateExternalIntegration`. A personal channel now takes the same
  integrations a team channel does, and a create call with no `channelId` falls
  back to the caller's personal channel for any kind instead of erroring for
  everything but IMAP.
- **Affected areas:**
  `src/modules/inbox/graphql/resolvers/mutations/integrations.ts`,
  `src/modules/inbox/db/definitions/constants.ts`.
- **Contracts changed:** `integrationsCreateExternalIntegration` no longer
  rejects an omitted `channelId` for non-mailbox kinds; the ownership check on
  another user's personal channel is unchanged.
