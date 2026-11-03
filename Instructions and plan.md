# NeighbourFund AI — Final Build Spec & Phase Plan

Nov 3, 2026 · @Chinmay Shrivastav

## 1. Overview and fixed decisions

This is the build spec for the 4-person team. It turns the Product Innovation & Hackathon Strategy 2026 into who builds what, the shared schemas every module must obey, and a day-by-day plan. Where this doc and the strategy PDF disagree on build details, this doc wins; on product scope, the PDF wins.

**Product.** NeighbourFund AI is a funding-and-proof platform for community projects. It tests affordability, brings in earmarked sponsor and resident funds through PayPal Sandbox, and releases money in two payout tranches only against evidence of spending (gate A) and proof of delivery (gate B), with a human decision at every release. Tagline: *Fund it fairly. Prove it's done.*

**Scenario used everywhere (synthetic).** Safe Lane Lighting: 48 households, six solar lane lights, $4,800 goal.

**Scope**

| Layer | Features | Status |
| --- | --- | --- |
| Spine | Project and AI brief, Sandbox contribution, verified webhooks, invoice extraction and neutral flags, tranche A payout, ledger, AG Grid dashboard, predefined Q&A | Must |
| New | F1 Funding Reality Check, F2 Sponsor Slots, F3 Fair-Share Tiers and Solidarity Pool, F7 Completion Proof and Retention Holdback (tranche B) | Must |
| Stretch | F6 Procurement Agent, F8 Plan Compiler, refund path | Only if the full journey is green |
| Out | Conditional pledges, quadratic matching, escrow claims, tax receipts, real money, multi-currency, recurring payments | Never built |

**Decisions assumed for this build** (change them in a comment if the team disagrees)

| ID | Decision | Assumption |
| --- | --- | --- |
| D1 | Currency and geography | USD, Sandbox, amounts stored as integer cents |
| D2 | Payouts | Build the simulated adapter first (Day 2); switch to real Sandbox Payouts only if the Day 1 access test passes; always label which is active |
| D3 | Scope veto | Adding any feature beyond the table above needs agreement from all four people |
| D4 | Licence and hosting | MIT licence, public GitHub, Render for web, API, worker and Postgres |
| D5 | Final integration owner | P3 merges to `main`; P2 owns anything touching money |

**Not covered here.** README, architecture note, demo script, video and submission paperwork are not assigned in this plan.

**Timing.** Day 1 is Tue 3 Nov. The plan runs to Day 8 (Tue 10 Nov) and keeps 11 to 12 Nov as buffer. Day 1 is already partly used, so compress Day 1 to the decisions, repo and Sandbox access test.

## 2. Team and ownership

Four people, one owner per module. Nobody writes to another module's tables directly; they call its service interface.

| Role | Owns (backend modules) | Primary deliverables |
| --- | --- | --- |
| **P1: AI** | `ai` | All model calls and workflows A1 to A7 (A8 stretch), schema validation, retries, `ai_runs` logging, prompt-injection hardening, the 12-document AI test set with a pass rate |
| **P2: Payments and money core** | `payments`, `ledger`, `release-gate`, `worker` | PayPal OAuth, orders and capture, webhook verification and idempotency, ledger, payout adapters (real and simulated), tranche state machine, reconciliation, Postman collection |
| **P3: Platform and funding** | `platform` (auth, RBAC, audit), `projects`, `funding` | Repo, CI, Render deploy, migrations, shared contracts package, project and budget APIs, F1 `feasibility.ts`, F2 slots and funders, F3 households and pool, seed and reset, app shell |
| **P4: Evidence, completion proof and QA** | `evidence`, `completion` | Document upload and review, expenses and flags, F7 completion specs, proof submissions, HMAC attestation links, gate B inputs, automated tests from Appendix A, security checklist |

**Frontend has no fixed owner.** P3 builds the shell and shared UI kit on Days 1 to 2. After that, whoever finishes their current task first takes the next unclaimed page from the Frontend queue (section 11) and marks it claimed there. One person per page, and nobody starts a second page before finishing the first.

**Rules for working together**

- API contracts come first. Before building an endpoint, the owner adds its zod schema to `packages/contracts` and posts it to the team. The frontend and other modules build against that.
- Only P2's `release-gate` may call the payout adapter. Only P2's webhook handler may create ledger credits.
- P1's `ai` module returns validated proposals. It never writes to payment, ledger, tranche or approval tables.
- P3 merges to `main`. Any change to a shared schema or enum needs a comment from the affected owners before it merges.
- Day-end rule: every person demos what they built that day on the deployed environment, however small.

## 3. System architecture

&#91;embedded content: system architecture · client, 8 API modules, worker, 3 external systems\]

One Express service split into modules, each with one owner, plus a background worker on Render. PayPal webhooks enter independently, are verified, and only then update ledger rows. The `ai` module sits beside the money path and can only return proposals. P1 to P4 in each box are the module owners from section 2.

## 4. Repository, conventions and shared contracts

**Monorepo layout** (TypeScript everywhere, npm workspaces)

```text
neighbourfund/
  apps/
    web/                 React + TS + Tailwind + AG Grid
    api/                 Express + TS modular monolith + worker entry
  packages/
    contracts/           zod schemas + inferred TS types + enums (shared)
    money/               integer-cents helpers, rounding, formatters
  db/
    migrations/          SQL migrations (one numbered file per change)
    seed/                seed + reset scripts
  postman/               Sandbox collection
  LICENSE                MIT
```

**API module folders** (`apps/api/src/modules/<name>/`): `routes.ts`, `service.ts`, `repo.ts`, `schemas.ts` (re-exports from contracts), `*.test.ts`. Routes call the service; the service calls its own repo and other modules' services. No module imports another module's `repo.ts`.

**Conventions everyone follows**

| Topic | Rule |
| --- | --- |
| Money | Integer minor units (cents) with an explicit `currency` (`USD`). Never floats. Use `packages/money` for rounding and formatting. |
| IDs | UUID v4 for all primary keys, generated in the API. |
| Time | UTC `timestamptz` in the database, ISO 8601 strings in the API. |
| Naming | Tables and columns `snake_case`; JSON fields `camelCase`; enums as lowercase strings. |
| Errors | JSON `{ error: { code, message, details? } }` with HTTP 4xx or 5xx. Codes are `UPPER_SNAKE`, e.g. `RELEASE_GATE_BLOCKED`. |
| Auth | Session or signed token carrying `userId` and `role`. Roles: `organiser`, `reviewer`, `sponsor`, `resident`, `admin`. Demo uses a role switcher. |
| Validation | Every request and every AI output is parsed with a zod schema from `packages/contracts` before use. |
| Audit | Every approval, rejection, payout, AI run and state change writes an `audit_events` row via `platform.audit.record()`. |
| Secrets | Environment variables only (Render env). `.env.example` lists names, never values. Nothing secret in the repo or frontend bundle. |
| Sandbox honesty | Sandbox banner on every page. Simulated payouts carry a visible `SIMULATED` badge in rows, screens and any recording. |
| Branches | `main` is always deployable. Short-lived `feature/<module>-<thing>` branches, pull request, one reviewer. |
| Tests | Each module ships unit tests for its invariants. CI runs lint, typecheck and tests on every pull request. |

**Environment variables** (names only; owners supply values)

`DATABASE_URL`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV=sandbox`, `PAYOUT_MODE=simulated|sandbox`, `AI_PROVIDER_KEY`, `AI_MODEL`, `ATTESTATION_HMAC_SECRET`, `APP_BASE_URL`, `SESSION_SECRET`.

## 5. Common data model

One PostgreSQL schema. The owner writes the table; others read it only through the owner's service. All money columns are `*_minor` integer cents; every table has `id`, `created_at` and `updated_at` unless noted.

| Table | Owner | Key fields | Notes |
| --- | --- | --- | --- |
| `users` | P3 | display\_name, email, role | Demo users per role; role switcher |
| `communities` | P3 | name, description |  |
| `projects` | P3 | community\_id, organiser\_id, title, description, goal\_minor, currency, status, target\_date | status: draft, planning, funding, delivering, complete |
| `budgets` | P3 | project\_id, category, description, approved\_minor, version, approved\_by | One row per budget line |
| `milestones` | P3 | project\_id, title, due\_date, status, budget\_id | Status values in section 6 |
| `funding_plans` | P3 | project\_id, households, assumptions\_json, scenarios\_json, verdict, accepted | F1; scenarios computed by code |
| `funding_plan_lines` | P3 | plan\_id, source\_type, amount\_minor, rationale | source\_type: resident, sponsor\_cash, in\_kind, pool |
| `budget_slots` | P3 | budget\_id, label, amount\_minor, status | F2 sponsorable units; status: open, funded, released |
| `funders` | P3 | type, name, contact\_ref | Sponsors; synthetic |
| `funder_commitments` | P3 | funder\_id, slot\_id, kind, amount\_minor, order\_id, status | kind: cash or in\_kind; cash links to a PayPal order |
| `households` | P3 | project\_id, invite\_hash, participating, covered\_by\_pool | Minimal identifiers only |
| `contributions` | P2 | project\_id, user\_ref, tier, fund\_type, amount\_minor, currency, status | Created on order create; status follows webhook |
| `payment_transactions` | P2 | contribution\_id, provider\_order\_id, provider\_capture\_id, provider\_status, raw\_ref | Provider IDs for reconciliation |
| `webhook_events` | P2 | provider\_event\_id (unique), event\_type, verified, processed\_at, result | Idempotency table |
| `ledger_entries` | P2 | entry\_type, fund\_type, slot\_id, amount\_minor, currency, provider\_ref, event\_id, status | Only verified events create capture entries |
| `payout_tranches` | P2 | milestone\_id, tranche (A or B), amount\_minor, release\_key (unique), status, simulated, paypal\_batch\_id, paypal\_item\_id, destination\_id | State machine in section 6 |
| `payout_destinations` | P2 | vendor\_name, paypal\_receiver, allowlisted, approved\_at | Allowlist; changes need re-approval |
| `reconciliation_runs` | P2 | run\_at, matched, missing\_in\_ledger, missing\_in\_provider, mismatches | Worker output |
| `expenses` | P4 | project\_id, budget\_id, vendor, amount\_minor, date, review\_status |  |
| `evidence_documents` | P4 | expense\_id, file\_ref, extracted\_json, confidence\_json, status | Extraction needs human confirmation |
| `verification_reviews` | P4 | expense\_id, flag\_type, explanation, reviewer\_id, resolution | resolution: explained, more\_info, rejected, approved |
| `completion_specs` | P4 | milestone\_id, spec\_json, min\_attestations, window\_days | e.g. 6 lights, 5 attestations |
| `proof_submissions` | P4 | spec\_id, file\_refs, checklist\_json, ai\_summary\_json | AI summary is advisory |
| `proof_reviews` | P4 | submission\_id, reviewer\_id, decision, reason |  |
| `attestations` | P4 | spec\_id, household\_id, token\_hash, response, created\_at | Unique per household per spec |
| `ai_runs` | P1 | workflow, prompt\_version, model, input\_hash, output\_json, validated, latency\_ms | Written by the AI module for every call |
| `audit_events` | P3 | actor\_id, entity, entity\_id, action, metadata\_json | Append-only; written via `audit.record()` |

**Relationships to keep in mind.** `projects` is the hub: milestones, budgets, funding plans, households and contributions all hang off it. `ledger_entries` links to `contributions` (through provider IDs) and to `budget_slots`. `payout_tranches` link a milestone to its ledger funds, and both gates read from `verification_reviews` (A) and `proof_reviews` plus `attestations` (B).

**Hard database constraints.** `webhook_events.provider_event_id` unique. `payout_tranches.release_key` unique. `attestations (spec_id, household_id)` unique. Check constraints: `amount_minor >= 0`; ledger credits only when `status = 'verified'`.

## 6. Enums and state machines

These live in `packages/contracts/src/enums.ts`. Changing one needs sign-off from every owner who reads it.

| Enum | Values | Owner |
| --- | --- | --- |
| `Role` | organiser, reviewer, sponsor, resident, admin | P3 |
| `ProjectStatus` | draft, planning, funding, delivering, complete | P3 |
| `FeasibilityVerdict` | resident\_fundable, needs\_partners, needs\_rescope | P3 |
| `FundSourceType` | resident, sponsor\_cash, in\_kind, pool | P3 |
| `FundType` (ledger) | resident, solidarity, sponsor | P2 |
| `ContributionStatus` | created, approved, pending, captured, denied, refunded, reversed | P2 |
| `LedgerEntryType` | capture, refund, allocation, payout\_hold, payout\_release, reversal | P2 |
| `TrancheStatus` | approved, submitted, processing, paid, failed, needs\_reconciliation | P2 |
| `ReviewResolution` | explained, more\_info, rejected, approved | P4 |
| `FlagType` | amount\_differs, line\_missing, duplicate\_invoice, vendor\_mismatch, low\_confidence | P4 |
| `ProofDecision` | approved, rejected, needs\_more | P4 |
| `AttestationResponse` | works, not\_working | P4 |
| `AiWorkflow` | A1, A2, A3, A4, A5, A6, A7, A8 | P1 |

### Milestone lifecycle

`planned` → `delivered` (invoice uploaded) → `gate_a_approved` → `proof_submitted` → `gate_b_approved` → `complete`. A rejected review returns the milestone to its previous state with a reason.

### Payout tranche lifecycle (P2)

| From | Event | To | Who or what triggers |
| --- | --- | --- | --- |
| (none) | Release gate passes | `approved` | Release gate transaction, after reviewer approval |
| `approved` | Batch created at PayPal (or simulated) | `submitted` | Payout adapter |
| `submitted` | Provider status pending / processing | `processing` | Verified webhook or lookup |
| `processing` | Provider success | `paid` | Verified webhook or lookup only |
| `submitted`, `processing` | Failed, returned, unclaimed, blocked | `failed` or `needs_reconciliation` | Verified webhook; goes to exceptions queue |

"Submitted" never means "paid". `paid` is set only from a verified provider event or lookup. A simulated adapter writes the same states with `simulated = true`.

### Contribution lifecycle (P2)

`created` → `approved` (buyer approved in browser; not money yet) → `captured` (verified capture webhook creates the ledger credit). `denied`, `pending`, `refunded` and `reversed` are recorded as given; only `captured` counts as raised.

### Gate definitions (P2 enforces, P4 supplies inputs)

| Gate | Releases | Requires, all in one database transaction |
| --- | --- | --- |
| A | Tranche A, about 85% of the milestone amount | Approved expense and evidence, reviewer decision `approved` by a user who is not the organiser, amount ≤ remaining approved budget for the linked slot or line, destination allowlisted, unique release key |
| B | Tranche B, about 15% retention | Tranche A in `paid` or `submitted` state, an active completion spec, a proof submission, at least `min_attestations` distinct households responding `works`, proof review `approved` by a reviewer, no unresolved `not_working` report, unique release key |

## 7. API contract

Base path `/api`. JSON in and out. Request and response schemas live in `packages/contracts/src/<module>.ts`; the owner publishes the schema before building the endpoint. Roles in brackets may call it. Paths are the agreed shape; owners may add fields but not rename or remove them without telling the frontend.

**Platform and projects (P3)**

| Method and path | Purpose | Roles |
| --- | --- | --- |
| `POST /auth/switch-role` | Demo role switcher | all |
| `GET /me` | Current user and role | all |
| `POST /projects` | Create project | organiser |
| `GET /projects/:id` | Project with budget, milestones, status | all |
| `GET /projects/:id/public` | Public summary: progress by households and dollars, no private details | all |
| `POST /projects/:id/budget` | Create or edit budget lines (versioned) | organiser |
| `POST /projects/:id/milestones` | Create or edit milestones | organiser |
| `POST /projects/:id/feasibility` | Run F1 calculator; returns three scenarios and verdict | organiser |
| `POST /projects/:id/funding-plan/accept` | Accept the AI-proposed mix; creates slots and targets | organiser |
| `GET /projects/:id/slots` | List sponsor slots and status | all |
| `POST /projects/:id/households/invite` | Create household invites | organiser |
| `GET /projects/:id/pool` | Solidarity pool balance and allocations | organiser, reviewer |
| `POST /projects/:id/pool/allocate` | Cover a household from the pool; blocked if over balance | organiser |
| `GET /audit?entity=&id=` | Audit trail | reviewer, admin |
| `POST /admin/reset` | Reseed demo data | admin |

**Payments and ledger (P2)**

| Method and path | Purpose | Roles |
| --- | --- | --- |
| `POST /payments/orders` | Create PayPal order with project, tier, fund type and slot reference | resident, sponsor |
| `POST /payments/orders/:id/capture` | Capture after buyer approval; state is still not final until webhook | resident, sponsor |
| `POST /webhooks/paypal` | Raw-body endpoint; verify signature, store event, enqueue | PayPal only |
| `GET /projects/:id/ledger` | Ledger entries and funding equation (captured, restricted, allocated, released, held) | organiser, reviewer, sponsor (own slot) |
| `GET /projects/:id/webhook-feed` | Event feed with processing result | organiser, reviewer, admin |
| `GET /projects/:id/exceptions` | Failed, returned, denied, disputed, duplicate items | reviewer, admin |
| `POST /projects/:id/reconcile` | Trigger reconciliation run | admin |
| `POST /milestones/:id/release` | Request release of tranche A or B; the gate decides | reviewer |
| `GET /milestones/:id/tranches` | Tranche status and provider IDs | organiser, reviewer |
| `GET /payout-mode` | Current mode: real sandbox or simulated | all |

**Evidence and review (P4)**

| Method and path | Purpose | Roles |
| --- | --- | --- |
| `POST /milestones/:id/documents` | Upload quotation or invoice; triggers A2 | organiser |
| `GET /documents/:id` | Extracted fields with confidence | organiser, reviewer |
| `POST /documents/:id/confirm` | Human confirms or corrects extracted fields | organiser |
| `GET /projects/:id/expenses` | Expenses with evidence and flag status (AG Grid) | organiser, reviewer |
| `GET /projects/:id/review-queue` | Open flags and pending decisions | reviewer |
| `POST /reviews/:id/resolve` | Resolve a flag with a resolution and reason | reviewer |
| `POST /milestones/:id/gate-a/decision` | Reviewer approves or rejects gate A inputs | reviewer |

**Completion proof (P4)**

| Method and path | Purpose | Roles |
| --- | --- | --- |
| `POST /milestones/:id/completion-spec` | Create or edit the spec | organiser |
| `POST /milestones/:id/proof` | Upload photos and checklist; triggers A6 | organiser |
| `POST /milestones/:id/attestation-links` | Generate single-use signed links per invited household | organiser |
| `GET /attest/:token` | Public one-screen attestation page data | resident (token) |
| `POST /attest/:token` | Submit `works` or `not_working`; one per household | resident (token) |
| `POST /milestones/:id/proof/decision` | Reviewer decision on proof | reviewer |

**AI endpoints (P1)**

| Method and path | Purpose | Roles |
| --- | --- | --- |
| `POST /ai/brief` | A1 brief, milestones, budget draft | organiser |
| `POST /ai/funding-mix` | A4 mix proposal from F1 scenarios | organiser |
| `POST /ai/sponsor-brief` | A5 brief for a slot | organiser |
| `GET /slots/:id/proof-pack` | A5 proof pack for the sponsor's slot only | sponsor, organiser |
| `POST /ai/ask` | A7 predefined question over backend numbers | organiser, reviewer, sponsor |

A2, A3 and A6 are called internally by P4's modules through the `ai` service interface, not exposed as endpoints.

## 8. AI workflows (P1)

All AI sits behind one module, `apps/api/src/modules/ai`. Every workflow has a typed input, a zod output schema in `packages/contracts/src/ai.ts`, validation in code, a human-confirmation state and a logged run. The model never does arithmetic, never sets a payment or approval state, and has no payout, refund or approval tool.

**Service interface other modules call**

```ts
// apps/api/src/modules/ai/index.ts
export interface AiService {
  draftBrief(input: BriefInput): Promise<AiResult<BriefDraft>>;            // A1
  extractDocument(input: DocInput): Promise<AiResult<ExtractedDoc>>;      // A2
  explainDiscrepancy(input: DiscInput): Promise<AiResult<DiscExplain>>;   // A3
  proposeFundingMix(input: MixInput): Promise<AiResult<FundingMix>>;      // A4
  writeSponsorBrief(input: SlotInput): Promise<AiResult<SponsorBrief>>;   // A5
  reviewProof(input: ProofInput): Promise<AiResult<ProofReview>>;         // A6
  answerQuestion(input: QaInput): Promise<AiResult<QaAnswer>>;            // A7
}

// Never throws on bad model output: validated=false means the caller must use the manual path.
export type AiResult<T> =
  | { ok: true; data: T; runId: string; validated: true }
  | { ok: false; reason: 'invalid_output' | 'provider_error'; runId: string };
```

**Workflow specification**

| ID | Called by | Input | Output (zod-validated) | Code-side check before use | Human step |
| --- | --- | --- | --- | --- | --- |
| A1 Brief helper | P3 project UI | Rough idea, community context, goal | summary, milestones\[\], budgetLines\[\] | Amounts non-negative integers; lines sum to goal | Organiser edits and approves |
| A2 Document extraction | P4 evidence | Quotation or invoice file | vendor, date, lineItems\[\], total, per-field confidence | Line items sum to total (flag if not); confidence below threshold marks field uncertain | Organiser confirms or corrects |
| A3 Discrepancy explainer | P4 evidence | Extracted fields, budget line, prior expenses | flagType, neutral explanation text | Difference computed in code, text must contain the code-computed number; banned words filter (fraud, theft, lying) | Reviewer resolves |
| A4 Funding mix planner | P3 F1 | Scenario results from code, budget, constraints | lines\[\] with sourceType, amountMinor, rationale, risks\[\] | Sum equals goal; no negative lines; in\_kind never counted as cash; no probabilities | Organiser accepts or edits |
| A5 Sponsor brief and proof pack | P3 F2 | Slot, budget line, verified evidence status from database | brief text; proof pack sections each tagged verified, claimed or unknown | Every verified statement must map to a database record ID | Organiser reviews before sharing |
| A6 Completion proof reviewer | P4 F7 | Completion spec, photos, checklist, photo metadata | per-item counts, matches\[\], cannotConfirm\[\], neutral summary | Counts cannot exceed spec; metadata anomalies listed as "cannot confirm", never fraud | Reviewer decides; advisory only |
| A7 Predefined Q&A | Frontend Q&A box | Question id plus parameters | answer text with record references | Numbers come from tested backend query functions; unsupported questions are refused | None (read only) |
| A8 Procurement agent (stretch) | P3 later | Spending mandate, catalogue tools | Purchase proposal | Mandate checked in code; no payment tool | Treasurer approves |

**A7 supported questions** (each maps to one tested function): how much is funded and restricted; which slots are open; which expenses lack evidence; which flags are open; what is the status of tranche A or B; how many households have attested; what is the solidarity pool balance.

**Engineering rules**

- Use structured output or JSON mode with the zod schema; on parse failure retry once, then return `ok: false` so the caller uses the manual entry path.
- Store the prompt in `ai/prompts/<workflow>.v<N>.md`. Every call writes an `ai_runs` row with prompt version, model, input hash, output and `validated`.
- Uploaded documents and photos are data, not instructions. Extraction and review prompts have no tools attached. Instructions found inside documents are ignored and surfaced as a `low_confidence` flag.
- Send the model only what the task needs. Demo data is synthetic.
- Provide a `FakeAiService` that returns fixed valid outputs, selected by `AI_MODE=fake`. Others use it from Day 2 so nobody waits on P1.

**AI test set.** About 12 synthetic items in `db/seed/ai-fixtures/`: a clean invoice, wrong total, missing line, vendor mismatch, duplicate invoice, blurry photo, photo missing a pole, document containing an instruction, plus the Appendix A sample ($3,300 invoice against a $3,120 line: flag "$180 above the approved line"). A script runs all of them and prints extraction accuracy and flag correctness. Run it before each freeze.

## 9. PayPal integration and release gate (P2)

**Integration points**

| ID | What | Used for | Notes |
| --- | --- | --- | --- |
| P1 | OAuth 2.0 client credentials, server side | Every REST call | Secrets in env only |
| P2 | Orders v2 create and capture | Resident, solidarity and sponsor contributions | Store slot and tier identifiers with the order (confirm exact reference field names in the API docs) |
| P3 | JS SDK or React PayPal buttons | Buyer approval in the browser | Capture still happens on the backend |
| P4 | Order and capture retrieval | Reconciliation and stale-transaction checks | Provider lookup is the backup to webhooks |
| P5 | Webhooks and verify-webhook-signature | Capture completed, denied, pending, refunded, reversed | Verify before any state change; store event ID uniquely |
| P6 | Payouts: create batch, get batch and item | Tranche A and B | Confirm Sandbox Payouts access on Day 1; unique batch ID per tranche |
| P7 | Disputes events | Exceptions queue only | Safeguard, not a feature |
| P8, P9 | Refunds, Invoicing, Agent Toolkit | Stretch only | Confirm behaviour before relying on them |

PayPal does not offer domestic payment services in India, and Payouts lists India as receive and withdraw only. The build therefore uses USD with Sandbox accounts and never presents a rupee checkout as a working PayPal flow. Event names and field names marked "confirm" must be checked against current PayPal documentation on Day 1.

**Webhook handler order of operations**

1. Read the raw body and headers (do not parse before verifying).
2. Call PayPal's verify-webhook-signature. If invalid, return 400, store nothing as verified, log it.
3. Insert into `webhook_events` with the unique `provider_event_id`. If it already exists, record "duplicate ignored" and return 200 without changing any totals.
4. Enqueue processing. The worker updates `contributions`, `payment_transactions`, `ledger_entries` or `payout_tranches` in one transaction, and records the result on the event.
5. Handle out-of-order events by looking up the order or capture from PayPal and applying the provider's current state.

**Payout adapter** (`PayoutAdapter` interface, two implementations)

```ts
interface PayoutAdapter {
  createBatch(req: { releaseKey: string; receiverRef: string; amountMinor: number; currency: 'USD' }):
    Promise<{ batchId: string; itemId?: string; status: 'submitted' | 'processing' }>;
  getStatus(batchId: string): Promise<{ status: 'processing' | 'paid' | 'failed' | 'unclaimed' | 'blocked' }>;
}
// PayPalPayoutAdapter: real Sandbox Payouts API.
// SimulatedPayoutAdapter: writes the same rows with simulated = true and a SIMULATED label.
// PAYOUT_MODE selects one. Only release-gate calls it.
```

**Invariants the backend must enforce (with tests)**

- No verified capture, no ledger credit.
- No approved evidence or no reviewer approval, no tranche A request. The reviewer cannot be the organiser.
- Release amount ≤ remaining approved amount for the linked slot or line. Restricted slot funds cannot pay another slot.
- Each tranche has one unique release key and one unique PayPal batch ID. A duplicate request is rejected.
- Tranche B requires a completion spec, a proof submission, at least `min_attestations` distinct households responding `works`, an approved proof review, and a paid or submitted tranche A.
- Destination must be allowlisted; changing it requires re-approval.
- `submitted` is never shown as `paid`. `paid` only from a verified event or provider lookup.
- Solidarity allocations ≤ verified solidarity captures.
- Failed, returned, unclaimed, denied, reversed and disputed items go to the exceptions queue and block further release until a reviewer decides.
- If the simulated adapter is active, every affected row, screen and recording says so.

**Worker jobs** (Render background worker): process queued webhook events, reconciliation (compare ledger with PayPal order and capture lookups by ID), stale pending transaction check.

**What this is not.** The platform tracks restrictions in its own ledger. It is not escrow and must not be called escrow. No tax-receipt or CSR-eligibility language anywhere.

## 10. Phase-wise plan

Each day lists what each person delivers and the exit milestone. If a milestone is not met by end of day, the next day starts by fixing it before new work. Frontend pages are taken from the queue in section 11 by whoever finishes first. Dates: Day 1 is Tue 3 Nov; Day 8 is Tue 10 Nov.

### Day 1  · Align and de-risk

| Person | Tasks |
| --- | --- |
| P1 | Pick the AI provider; test one structured-output call and one vision call on three sample images. Draft zod schemas for A1 to A7 in `packages/contracts`. Build `FakeAiService`. |
| P2 | Create Sandbox business and personal accounts and a REST app. Capture a $1 test order. Test Payouts access and record pass or fail. Start the Postman collection. |
| P3 | Create the public MIT repo, workspaces, CI and Render services (web, api, worker, Postgres). Create `contracts` and `money` packages. Draft the schema v1 migration. |
| P4 | Turn Appendix A test cases into issues. Set up the test harness. With P1, prepare sample documents and photos for the AI test set. |

**Exit milestone:** $1 Sandbox capture works; Payouts decision (D2) recorded; repo and CI are green; contracts package exists.

### Day 2 · Foundation

| Person | Tasks |
| --- | --- |
| P1 | A1 brief helper with schema validation, retry and `ai_runs` logging. Prompt versioning in place. Fake mode wired for everyone. |
| P2 | Token service. Create-order endpoint. `PayoutAdapter` interface and `SimulatedPayoutAdapter`. `PAYOUT_MODE` flag. Raw-body webhook endpoint skeleton. |
| P3 | Deployed skeleton on Render. Core migrations. Auth, RBAC, role switcher and `audit.record()`. Project CRUD. `feasibility.ts` with unit tests. App shell, Sandbox banner and shared UI kit. |
| P4 | Evidence and completion migrations (through P3's migration folder). Upload endpoint with file type and size validation. HMAC attestation token utility with unit tests. |

**Exit milestone:** live skeleton URL loads; feasibility edge cases pass (zero households, rounding, goal below resident capacity); create-order returns a PayPal approval link.

### Day 3  · Reality Check and verified capture

| Person | Tasks |
| --- | --- |
| P1 | A4 funding mix planner with sum validator. A7 skeleton with the supported-question function map. Start A2 extraction. |
| P2 | Capture endpoint. Webhook signature verification. Unique `webhook_events`. Ledger credit only after verification. Handle completed, denied and pending. Duplicate events ignored. |
| P3 | Funding plan APIs. Accept-plan creates slots and targets. Budget and milestone APIs. Frontend page 0: create project with AI brief, budget and milestone editor. |
| P4 | Document upload to A2 to confirm flow. Invoice-versus-budget comparison in code (difference computed, flag type chosen). |
| Frontend queue | Page 1: Reality Check. Page 2: contribution checkout screen with PayPal buttons. |

**Exit milestone:** F1 works end to end; a contribution appears in the ledger only after the verified webhook; a duplicate event changes nothing.

### Day 4 · Sponsors and fair-share

| Person | Tasks |
| --- | --- |
| P1 | A5 sponsor brief grounded in database facts. Proof-pack template. Finish A2. |
| P2 | Order tags for slot and tier. Restricted ledger logic (`fund_type`, `slot_id`). Reconciliation by order and capture IDs. Ledger endpoint with the funding equation. |
| P3 | Slots, funders and commitments. Restriction rules. Households, tiers and solidarity pool with the allocation invariant. Manual in-kind slot record. Public project summary endpoint. |
| P4 | A3 discrepancy explainer integration. Review queue and resolve endpoints. Gate A decision endpoint (reviewer cannot be the organiser). Tests. |
| Frontend queue | Page 3: public page with fair-share tiers. Page 4: sponsor slot page. |

**Exit milestone:** restricted funds cannot pay another slot; pool allocations never exceed pool captures; F2 and F3 work with Sandbox payments.

### Day 5  · Evidence and gate A

| Person | Tasks |
| --- | --- |
| P1 | Tune A3. Prompt-injection hardening on A2 and A3. AI test set script v1 with printed results. |
| P2 | `release-gate` service for tranche A. `payout_tranches` with unique `release_key`. Adapter calls. Batch and item status handling. Payout events (confirm names). `payout_destinations` allowlist. `POST /milestones/:id/release`. |
| P3 | Milestone lifecycle transitions. Remaining-budget calculation used by the gate. Role checks across modules. Seed data for the full scenario. |
| P4 | Expense approval flow feeding gate A. Evidence coverage endpoint. Tests for the gate A blocks: no evidence, no approval, over cap, duplicate key, self-approval. |
| Frontend queue | Page 5: evidence upload with extracted-field confirmation. Page 6: AG Grid review queue. Page 7: release console. |

**Exit milestone:** tranche A releases end to end (real or labelled simulated); the backend blocks each of the invalid cases above.

### Day 6 · Completion proof and gate B

| Person | Tasks |
| --- | --- |
| P1 | A6 vision reviewer with schema. Tests for "cannot confirm" wording. Wire A5 proof pack to the slot endpoint. |
| P2 | Gate B in `release-gate`. Second payout batch with its own unique key. Map payout statuses into the ledger. Exceptions queue endpoint. |
| P3 | Full-journey seed and reset script. Help integrate and unblock. Start on any unclaimed frontend page. |
| P4 | Completion specs, proof submissions, attestation link generation and validation (single use, expiring, one per household), attestation endpoints, proof decision endpoint. Tests. |
| Frontend queue | Page 8: completion proof upload and review. Page 9: mobile attestation page (one screen, large buttons). |

**Exit milestone:** four attestations block gate B; five distinct households allow it; the same household twice is rejected; a "not working" response holds tranche B; the full journey runs once locally and once deployed.

### Day 7 · Dashboards and hardening

| Person | Tasks |
| --- | --- |
| P1 | Finish A7 with all supported questions. Final A5 proof pack. Run the AI test set and record the pass rate. Confirm every fallback path. |
| P2 | Reconciliation job. Denied, reversed and disputed handling into the exceptions queue. Stale-transaction check. Finalise the webhook feed. Refund path only if everything else is green. |
| P3 | Rate limits. File validation review. Seed and reset reliability. Render environment check. Final merges. |
| P4 | Automated tests for every Appendix A case. Security checklist: secrets, RBAC, file validation, no private data exposed. Three clean full runs from reset on the deployed environment; log and hand back defects. |
| Frontend queue | Page 10: AG Grid ledger, funding stack and webhook feed. Page 11: sponsor proof pack. Page 12: Q&A box. Then empty, loading and error states and an accessibility pass. |
| Stretch | F6 procurement agent only if all of the above is green by midday. |

**Exit milestone:** three clean full runs from reset on the deployed environment; release candidate tagged.

### Day 8  · Freeze

| Person | Tasks |
| --- | --- |
| All | Feature freeze at midday; bug fixes only after that. |
| P1 | Freeze prompts, record versions, re-run the AI test set. |
| P2 | Verify the live webhook on the deployed environment. Final Sandbox run. Confirm payout mode label is correct. |
| P3 | Confirm no secrets in the repository or frontend bundle. Merge final fixes. Tag the release. |
| P4 | Final full automated run and a fresh-session run from reset. Report remaining known issues. |

**Exit milestone:** release candidate frozen; a fresh-session run from reset passes. Days 11 and 12 Nov are buffer and are not assigned in this plan.

## 11. Frontend queue

Whoever finishes their current task first takes the next unclaimed page, writes their name in the Claimed by column and works it to done before taking another. Build against the zod contract and `FakeAiService` first; swap to the live endpoint when it lands. Stack: React, TypeScript, Tailwind, AG Grid; one Sandbox banner in the shell; one component kit from P3.

| # | Page | Audience | Needs (API) | Target day | Claimed by |
| --- | --- | --- | --- | --- | --- |
| 0 | Shell, role switcher, admin reset, create project with AI brief, budget and milestone editor | Organiser, admin | `/auth/switch-role`, `/projects`, `/ai/brief`, `/projects/:id/budget`, `/projects/:id/milestones`, `/admin/reset` | 2 to 3 (P3) | P3 |
| 1 | Reality Check: assumptions, three scenario bars, verdict, AI-proposed mix, accept | Organiser | `/projects/:id/feasibility`, `/ai/funding-mix`, `/projects/:id/funding-plan/accept` | 3 |  |
| 2 | Contribution checkout with PayPal buttons and status that updates only after verification | Resident, sponsor | `/payments/orders`, `/payments/orders/:id/capture`, `/projects/:id/ledger` | 3 |  |
| 3 | Public project page with fair-share tiers, solidarity option, progress by households and dollars | Resident | `/projects/:id/public`, `/payments/orders`, `/projects/:id/pool` | 4 |  |
| 4 | Sponsor slot page: slot details, release rules, pay, proof link | Sponsor | `/projects/:id/slots`, `/payments/orders`, `/slots/:id/proof-pack` | 4 |  |
| 5 | Evidence upload with extracted fields shown for confirmation or correction | Organiser | `/milestones/:id/documents`, `/documents/:id`, `/documents/:id/confirm` | 5 |  |
| 6 | Review queue in AG Grid: flags, neutral explanations, resolve with reason | Reviewer | `/projects/:id/review-queue`, `/reviews/:id/resolve`, `/projects/:id/expenses` | 5 |  |
| 7 | Release console: gate A and gate B status, caps, tranche state, payout mode label, release action | Reviewer | `/milestones/:id/tranches`, `/milestones/:id/release`, `/payout-mode`, `/milestones/:id/gate-a/decision` | 5 |  |
| 8 | Completion proof: photo upload, checklist, AI review summary, attestation count, proof decision | Organiser, reviewer | `/milestones/:id/completion-spec`, `/milestones/:id/proof`, `/milestones/:id/attestation-links`, `/milestones/:id/proof/decision` | 6 |  |
| 9 | Mobile attestation page: one screen, one question, large buttons, works on a basic phone | Resident (token) | `GET` and `POST /attest/:token` | 6 |  |
| 10 | Ledger and funding stack in AG Grid with the funding equation, webhook feed, exceptions queue | Organiser, reviewer, admin | `/projects/:id/ledger`, `/projects/:id/webhook-feed`, `/projects/:id/exceptions` | 7 |  |
| 11 | Sponsor proof pack: evidence for that sponsor's slot only, verified, claimed and unknown separated | Sponsor | `/slots/:id/proof-pack` | 7 |  |
| 12 | Q&A box with predefined questions and record references | Organiser, reviewer, sponsor | `/ai/ask` | 7 |  |

**UI rules**

- Every status shown comes from a backend record; the UI never infers "paid" or "captured".
- Distinguish verified, claimed and unknown wherever AI text appears. Discrepancy wording is neutral: "differs from the approved budget by $X".
- Show `SIMULATED` on any simulated payout, and the Sandbox banner everywhere.
- Every page has loading, empty and error states, readable contrast and large tap targets (the attestation page especially).
- If time is short, cut in this order: pages 11 and 12, then polish on page 10; never cut pages 7 and 9.

## 12. Handoffs and integration checkpoints

These are the points where one person's work blocks another's. The provider posts when it is ready; the receiver confirms in the team chat.

| Handoff | From | To | Needed by | What "ready" means |
| --- | --- | --- | --- | --- |
| Contracts package with enums and zod schemas | P3 | Everyone | Day 1 end | Published in `packages/contracts`; compiles in api and web |
| `FakeAiService` returning valid outputs for A1 to A7 | P1 | P3, P4, frontend | Day 2 | Selectable with `AI_MODE=fake` |
| Migrations runnable and deployed | P3 | P2, P4 | Day 2 | `npm run migrate` works locally and on Render |
| Payout adapter interface and simulated adapter | P2 | P3, P4 | Day 2 | Interface in contracts; simulated adapter returns states |
| Create-order endpoint and capture flow | P2 | Frontend | Day 3 | Returns approval link; capture endpoint accepts approved order |
| Verified-capture ledger credit | P2 | P3, frontend | Day 3 | Ledger row exists only after a verified webhook |
| `feasibility.ts` and funding plan APIs | P3 | P1 (A4 input), frontend | Day 3 | Returns scenarios and verdict from code |
| A2 extraction through the `ai` service | P1 | P4 | Day 3 to 4 | `extractDocument` returns validated fields and confidence |
| Slots, restrictions and ledger `slot_id` | P3 and P2 | Sponsor page, P1 (A5) | Day 4 | Slot funded status derives from verified ledger entries |
| Gate A decision records | P4 | P2 | Day 5 | `verification_reviews` rows the gate can read |
| Release gate and tranche status API | P2 | Frontend console | Day 5 | `/milestones/:id/release` and `/tranches` live |
| Attestation and proof records | P4 | P2 | Day 6 | `attestations` and `proof_reviews` queryable for gate B |
| A6 proof review through the `ai` service | P1 | P4 | Day 6 | `reviewProof` returns counts and "cannot confirm" list |
| Full seed and reset | P3 | Everyone | Day 6 | `/admin/reset` restores the Safe Lane scenario in one call |

**Integration checkpoints** (all four on a call, five minutes, on the deployed environment)

| When | Check |
| --- | --- |
| Day 3 end | One real Sandbox contribution is captured, verified and visible in the ledger |
| Day 4 end | A sponsor slot payment shows as restricted; a resident half-share and a pool allocation show correctly |
| Day 5 end | An invoice with a $180 difference is flagged; reviewer approves; tranche A is released (real or simulated) |
| Day 6 end | Proof, four attestations (blocked), five attestations (allowed), tranche B released |
| Day 7 midday | Full journey runs from reset in under three minutes of screen time |

**Escalation.** If a handoff is more than half a day late, the receiver switches to the fake or simulated version and the provider says so in chat. No one waits idle; P3 reassigns frontend pages or helps the blocked person.

## 13. Testing, definition of done, risks and cut list

**Demo data (synthetic).** Project Safe Lane Lighting, six solar lane lights, 48 households. Goal $4,800: equipment $3,120 (65%), installation $960 (20%), contingency $720 (15%). Resident scenarios: Low 25% × $15 = $180, Base 40% × $25 = $480, High 60% × $25 = $720. Proposed mix: residents $720 cash, six sponsor slots at $520 = $3,120 cash, contractor installation $960 in-kind (never counted as PayPal-verified funds). Fair share $15 per household. Sample invoice $3,300 against a $3,120 line, flag "$180 above the approved line". Tranche A is 85% on delivery evidence, tranche B 15% on completion proof. Completion spec: six lights installed, operational at dusk, at least five household attestations.

**Minimum automated tests** (P4 owns the suite; each module owner writes its own unit tests)

| Area | Cases |
| --- | --- |
| Feasibility (P3) | Zero households, goal smaller than capacity, per-household rounding, invalid assumption ranges |
| Webhook (P2) | Invalid signature rejected, duplicate ignored, out-of-order events handled, pending then completed |
| Ledger (P2) | Totals reconcile to captures, allocations, payouts and refunds; solidarity allocations never exceed pool captures |
| Release gate (P2, tested by P4) | Missing evidence, missing approval, cap exceeded, duplicate release key, non-allowlisted destination, self-approval, tranche B without attestations |
| Attestations (P4) | Expired link, reused link, same household twice, four versus five households, "not working" response |
| AI (P1) | Invalid JSON triggers retry then manual path; a document containing instructions is ignored and flagged; A3 text contains the code-computed number |

**Definition of done for the MVP**

- The full journey runs from a fresh reset to the end on the deployed environment, repeatably, in under three minutes of screen time.
- Every payment and payout status shown comes from a verified backend record; any simulated segment is labelled on screen.
- A rejected or unapproved release is blocked by the backend, demonstrated by a test and in the running app.
- The AI test set has been run and its pass rate recorded.
- No secrets in the repository or frontend bundle.

**Risks and mitigations**

| Risk | Mitigation | Owner |
| --- | --- | --- |
| Sandbox Payouts unavailable for the account or country | Day 1 test; simulated adapter from Day 2; label everything | P2 |
| PayPal geography mismatch with an India narrative | USD scenario; never present a rupee checkout as working | P3 |
| Too much scope for eight days | Cut list below; daily integration check; P3 enforces D3 | P3 |
| AI extraction or vision inconsistent | Schema validation, one retry, manual entry path, test set | P1 |
| Prompt injection through uploads | No tools on extraction or review prompts; output validation | P1 |
| Webhook delivery problems or duplicates | Verification, unique event table, provider lookup backup, reconciliation | P2 |
| Attestation gaming | Invite-bound, single-use, expiring links; one response per household; anomalies shown to reviewer | P4 |
| Frontend backlog builds up late | Queue with target days; P3 reassigns; contracts and fake AI let pages start early | P3 |
| AG Grid or other sponsor tool licence or feature limits | Confirm on Day 1; fall back to community features or simple tables | P3 |
| Flags read as fraud accusations | Neutral wording enforced by code and tests | P1, P4 |

**Cut list if the team falls behind** (cut in this order, without touching the one complete journey): (1) F6 and F8, (2) refund path, (3) in-kind slot records, (4) free-form Q&A, (5) sponsor invoice flow, (6) page polish. Never cut: verified webhooks, payout invariants, gate B, the AI test set run and the simulated adapter.

**If Payouts cannot be demonstrated by end of Day 3**, keep the simulated adapter, label it everywhere, and reduce F7 to a proof-and-attestation record without a real payout.
