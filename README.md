# NeighbourFund-AI
An AI-powered community funding platform that makes local projects fundable and accountable. NeighbourFund AI connects residents, sponsors, and service providers through fair contributions, transparent fund allocation, AI-assisted expense verification, and milestone-based PayPal payments.

### Structure to be followed:
NeighbourFund-AI/
│
├── frontend/                         # React + TypeScript + Vite
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── ui/                    # Buttons, inputs, modals
│   │   │   ├── layout/                # Navbar, sidebar, banner
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
│   │   │   ├── aiClient.ts           # Calls shared AI workflows
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
├── ai/                               # TypeScript AI package
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
│   └── fixtures/                     # Synthetic invoices, photos
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

### Ownership
Team member -	Main directories,	Responsibilities
P1 -	ai/,	LLM integration, AI workflows, prompts, validation
P2 - backend/src/modules/payments/, ledger/, release-gate/, worker/,	PayPal, transactions, payout gates, reconciliation
P3 - backend/src/modules/platform/, projects/, funding/, shared/, db/	Core APIs, database, contracts, infrastructure
P4 -backend/src/modules/evidence/, completion/, tests/,	Invoice review, completion verification, attestations, QA
