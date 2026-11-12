# NeighbourFund-AI
NeighbourFund-AI is a community funding platform that connects residents, sponsors, and service providers through transparent contributions, fund allocation, and milestone-based payments. The A1 Brief workflow uses Google's Gemini model, while A2–A7 currently rely on deterministic validation and application logic rather than full AI inference.

### AI Workflow Capabilities

- **A1 – Brief Workflow:** Uses Google's Gemini model for AI inference.
- **A2–A7:** Currently use deterministic validation, rule-based processing, and application logic. They do not currently perform full LLM-based AI inference.
- The presence of AI-related interfaces or shared infrastructure does not mean every workflow currently uses an LLM.

# NeighbourFund-AI — Project Structure and Ownership

## Recommended repository structure

```text
NeighbourFund-AI/
│
├── frontend/                         # React + TypeScript + Vite
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── ui/                    # Buttons, inputs, modals
│   │   │   ├── layout/                # Navbar, sidebar, sandbox banner
│   │   │   ├── charts/                # Funding visualisations
│   │   │   └── tables/                # AG Grid components
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Projects.tsx
│   │   │   ├── ProjectDetails.tsx
│   │   │   ├── FundingRealityCheck.tsx
│   │   │   ├── Contributions.tsx
│   │   │   ├── SponsorSlots.tsx
│   │   │   ├── EvidenceReview.tsx
│   │   │   ├── ReleaseConsole.tsx
│   │   │   ├── CompletionProof.tsx
│   │   │   ├── Attestation.tsx
│   │   │   └── Ledger.tsx
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── services/                 # Backend API client
│   │   ├── utils/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/                          # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.ts
│   │   │   └── database.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── rbac.ts
│   │   │   ├── errorHandler.ts
│   │   │   └── validate.ts
│   │   ├── modules/
│   │   │   ├── platform/             # Users, roles, audit
│   │   │   ├── projects/             # Projects, budgets, milestones
│   │   │   ├── funding/              # Feasibility, tiers, sponsors
│   │   │   ├── payments/             # PayPal orders and webhooks
│   │   │   ├── ledger/               # Verified financial records
│   │   │   ├── evidence/             # Documents, expenses, reviews
│   │   │   ├── completion/           # Proof and attestations
│   │   │   └── release-gate/         # Tranche A/B release logic
│   │   ├── integrations/
│   │   │   ├── aiClient.ts
│   │   │   └── paypalClient.ts
│   │   ├── worker/
│   │   │   ├── webhookProcessor.ts
│   │   │   └── reconciliation.ts
│   │   ├── utils/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   └── worker.ts
│   ├── package.json
│   └── tsconfig.json
│
├── ai/                               # Internal TypeScript AI package
│   ├── src/
│   │   ├── workflows/
│   │   │   ├── projectBrief.ts
│   │   │   ├── invoiceExtraction.ts
│   │   │   ├── discrepancyAnalysis.ts
│   │   │   ├── fundingPlanner.ts
│   │   │   ├── sponsorBrief.ts
│   │   │   ├── proofVerification.ts
│   │   │   └── questionAnswering.ts
│   │   ├── prompts/
│   │   ├── providers/
│   │   │   ├── llmProvider.ts
│   │   │   └── fakeProvider.ts
│   │   ├── validators/
│   │   ├── utils/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                           # Shared internal packages
│   ├── contracts/
│   │   ├── src/
│   │   │   ├── enums.ts
│   │   │   ├── projects.ts
│   │   │   ├── funding.ts
│   │   │   ├── payments.ts
│   │   │   ├── evidence.ts
│   │   │   ├── completion.ts
│   │   │   ├── ai.ts
│   │   │   └── index.ts
│   │   └── package.json
│   └── money/
│       ├── src/
│       │   ├── amounts.ts
│       │   ├── rounding.ts
│       │   └── index.ts
│       └── package.json
│
├── db/
│   ├── migrations/
│   └── seed/
│
├── tests/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/                     # Synthetic invoices and photos
│
├── postman/
├── docs/
│   ├── architecture.md
│   ├── api.md
│   └── deployment.md
│
├── .github/
│   └── workflows/
│       └── ci.yml
│
├── .env.example
├── .gitignore
├── .prettierrc
├── eslint.config.js
├── package.json
├── package-lock.json
├── tsconfig.base.json
├── render.yaml
├── README.md
├── LICENSE
└── Instructions and plan.md
```

## Team ownership

| Team member | Primary directories | Responsibilities |
|---|---|---|
| **P1 — AI** | `ai/` | LLM integration, AI workflows, prompts, structured-output validation, fake AI provider and AI tests. |
| **P2 — Payments and money core** | `backend/src/modules/payments/`, `backend/src/modules/ledger/`, `backend/src/modules/release-gate/`, `backend/src/worker/` | PayPal Sandbox, verified webhooks, ledger, payout gates, reconciliation and worker jobs. |
| **P3 — Platform and funding** | `backend/src/modules/platform/`, `backend/src/modules/projects/`, `backend/src/modules/funding/`, `shared/`, `db/`, `.github/` | Auth and roles, projects, feasibility, sponsor slots, fair-share funding, shared contracts, database migrations, CI and deployment. |
| **P4 — Evidence, completion and QA** | `backend/src/modules/evidence/`, `backend/src/modules/completion/`, `tests/` | Invoice review, expense flags, completion proof, household attestations, integration and end-to-end QA. |
| **Shared — Frontend** | `frontend/` | P3 creates the app shell and shared UI kit; remaining pages are claimed by available teammates, one owner per page, according to the frontend queue. |

## Collaboration and architecture rules

- The repository uses **npm workspaces** for `frontend`, `backend`, `ai`, `shared/contracts` and `shared/money`.
- The `ai/` directory is an **internal TypeScript package**, not a separate HTTP server. The backend imports its functions; the frontend never calls LLM providers directly.
- Shared API and AI output schemas live in `shared/contracts/` and use **Zod**.
- Monetary amounts use **integer cents**, with helpers in `shared/money/`.
- Each backend module owns its database access. Other modules use its service interface rather than importing its repository directly.
- **Only P2's release-gate** can invoke payout adapters; **only verified payment events** can create ledger credits. AI outputs are advisory and cannot authorize payments.
- P3 maintains the deployable `main` branch and coordinates shared-schema changes.
- The frontend is collectively owned, but each page has one active assignee.
- Render deploys the frontend, Express API, background worker and PostgreSQL. The AI package runs within the backend process.

### Standard backend module layout

```text
backend/src/modules/<module>/
├── routes.ts        # HTTP endpoints
├── service.ts       # Business logic
├── repo.ts          # Database queries
├── schemas.ts       # Re-exports from shared contracts
└── <module>.test.ts # Unit tests
```

> **Implementation note:** This document describes the proposed repository structure and team ownership, not an assertion that every directory or file already exists. `package-lock.json` is generated by `npm install`.
### AI Run Logging

- The A1 Brief workflow currently uses `AiRunLogger` with an in-memory implementation (`InMemoryAiRunLogger`).
- A1 records workflow metadata, prompt version, model, input hash, output, validation status, latency, and creation timestamp.
- Logging is currently limited to A1. A2–A7 do not yet integrate with the logger.
- The in-memory implementation is temporary: records are not persisted across process restarts. Persistent database logging is pending backend integration with P3.
- A1 uses fail-closed logging semantics: if logging fails, the workflow returns a `logging_error` result. This behaviour is covered by tests.
