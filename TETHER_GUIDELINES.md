# Tether in BlockOut — build guidelines (audit checklist)

Tether is Syncratic's cross-app, **BYOK** AI agent. Binder shipped it first; this
is BlockOut's integration. We audit against this doc at the end of each phase.

## Non-negotiable rules

1. **Reads are implicit** — never require permission. They run live, server-side,
   against the snapshot the client sends.
2. **Data writes are staged, never executed server-side.** Tools return *proposed*
   actions; the **client** applies them through existing Zustand actions only
   after approval. Nothing the AI does to *data* (tasks/categories/chains/blocks)
   touches it until the user says yes.
2b. **Immediate actions** — reversible UI/preference/navigation (theme,
   show/hide Synamon companion, switch view, open sync settings). These apply on
   receipt without the approval gate (they're instantly reversible and lose no
   data) but are always *announced* in the panel. They are NOT data mutations and
   never delete anything. Tether is also the user's in-app guide (explains
   features, reads sync state, walks them to enable sync — it cannot enter
   credentials).
3. **One permission for a batch.** Create/update proposals are presented together
   as a single approval with a Claude-Code-style **per-item tickbox**: the user
   approves the batch but can untick individual actions. One prompt, not N.
4. **Deletes are special.** Every delete routes to a dedicated typed-confirmation
   modal that lists ONLY the targets and requires the user to type exactly
   `Delete this 1 <noun>` / `Delete these {x} <nouns>` (count-aware, pluralised;
   noun = task/step/block/category). A destructive action can NEVER ride an
   "approve all" — it always breaks out to its own modal. Category deletes are
   cascade-aware (list everything that disappears).
5. **The API key never reaches the client.** It is read only by the serverless
   function via the service-role client; never logged, never echoed in SSE
   errors, never returned in a tool result.
6. **Service-role = manual owner scoping.** The service-role client bypasses RLS,
   so EVERY query filters `owner_id = user.id`. Use one owner-scoped helper; never
   query a shared table ad hoc. (Highest-severity trap.)
7. **BYOK config is the shared `model_endpoints` table** — set up once (in any
   Syncratic app), used everywhere.

## Architecture

- **Server:** `api/tether.js` (route) + `api/_tether/*` (helpers; `_`-prefixed so
  Vercel doesn't route them). Verifies the Supabase JWT (same as `api/r2-sync.js`),
  resolves the user's endpoint, runs the agent loop, streams SSE.
- **Agent loop:** provider-agnostic OpenAI SDK pointed at the user's `base_url`.
  Tool-calling loop with a LOW iteration cap. Read tools run on the request's
  `snapshot`; write tools return staged actions.
- **Client:** `src/utils/tether.ts` (snapshot builder + SSE client) and
  `src/components/Tether/*` (panel + approval UI). Calls `/api/tether` via
  `getApiBase()` (base-path-aware — raw `/api` breaks under `/blockout/`) with the
  Bearer access token.
- **Apply layer (client):** resolves names→ids against the CURRENT store at
  apply-time, applies in dependency order (categories → tasks → assignments),
  reports per-action success/skip.

## Resumable loop (Vercel `maxDuration`)

The function limit is a per-invocation wall clock, not a rate limit; no cooldown
between invocations. Long *conversations* are already free (each turn = its own
short invocation). Only a long single *turn* needs chaining:
- Checkpoint between iterations (state = serializable messages + iter count +
  staged actions). At the top of each iteration, if past the soft deadline
  (~70–80% of budget, margin > one model-call latency), stream
  `needs_continuation` + state and return.
- The **client** re-POSTs to resume (serverless can't reliably spawn successors).
- Retry resumes from the last checkpoint; a hard-kill loses at most one iteration.
  Idempotent because writes are staged.

## SSE event protocol

`thinking` (assistant text) · `tool_call` · `tool_result` · `staged_action`
(a proposed write/delete) · `needs_continuation` (+state) · `complete` · `error`.

## Data models (see `src/types/index.ts`)

- **Task Chains** (`taskChains` keyed by `date` YYYY-MM-DD): per-day ordered
  routine. Links = `ct` (standalone step in `chainTasks`) | `realtask` (pool task
  or placeholder) | `subtask`. Optional `groups` incl. a readonly "Completed
  Today" (tools must refuse to target it). `chainTemplates` are reusable.
- **Weekview** (currently "Overview"; rename is a separate PR) — `overviewBlocks:
  ScheduleBlock[]`: 7 days (dayIndex 0=Mon..6=Sun) × 30-min slots 6:00AM–11:30PM
  (`slot=(hour-6)*2+(min>=30?1:0)`, endSlot exclusive), `weekDate`=Monday.
  Types: placeholder | mt (taskId) | ct. NO granular store CRUD — only
  `setOverviewBlocks(wholeArray)`; tools accept natural time and convert.

## Domain awareness Tether must have (knowledge, not necessarily tools)

Tether is a guide, so it must understand the app's *intentional* features and
respect their design — never short-circuiting the engagement they're built on.

- **Co-Focus** — intentional, immersive **social studying**: live-synced focus
  sessions with friends (shared/independent timers, pauses, laps, task-chain
  tick-offs, presence, chat). Tether should know *what it is, why it exists, and
  what it offers*, and be able to explain it and point users to it. What Tether
  should actively *do* inside a session is still open (the activity is meant to be
  immersive and human — don't bolt on AI that distracts from it). Default to
  explain/guide, not automate.
- **Synamon companion** — a tamagotchi-style pet that grows from the user's REAL
  focus and task completion. Tether must understand it and **encourage engagement
  — but must NOT tend the pet for the user.** No feeding/petting/playing on their
  behalf, no shortcuts to companion progress. Nurturing is *earned* by actually
  focusing and completing tasks; Tether motivates that, it doesn't replace it.
  (Tether may still show/hide the companion via set_synamon_companion — a display
  preference, not pet-care.) Respect the opt-out: if Synamon is disabled, don't
  push it.

## Phase plan

- **1a ✅ — read-only server:** `api/tether.js` + agent + read tools + prompt;
  endpoints CRUD; deps + vercel config.
- **1b ✅ — read-only client:** Tether panel, SSE display, endpoint gating.
- **2 ✅ — staged writes + guide:** create/update tools + batch approval w/
  tickboxes + apply layer; immediate settings/nav actions; get_app_status/sync.
- **3 — deletes:** typed-confirmation gate.
- **4 — chains + Weekview tools.**
- **5 — domain awareness:** teach Tether about Co-Focus + Synamon (above) via the
  system prompt; explain/guide tools as needed (no pet-care, no in-session
  automation by default).
- **6 — persistence, resumable chaining, polish.**

## Audit at each phase

Rules 1–7 hold? Key never client-side or logged? Every shared-table query
owner-scoped? Reads need no permission, writes staged, deletes typed-gated?
Base-path-safe fetches? Build + typecheck clean?
