import express, { type Express } from "express";

import {
  CompletionService,
} from "./modules/completion/service.js";

import {
  createCompletionRouter,
  denyAllCompletionAuthorization,
} from "./modules/completion/routes.js";

import {
  InMemoryCompletionRepository,
} from "./modules/completion/in-memory-repo.js";

import {
  EvidenceService,
  type InvoiceExtractionProvider,
} from "./modules/evidence/service.js";

import {
  createEvidenceRouter,
} from "./modules/evidence/routes.js";

import {
  InMemoryEvidenceRepository,
} from "./modules/evidence/in-memory-repo.js";

const app: Express = express();

app.use(express.json({ limit: "1mb" }));

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "NeighbourFund API is running",
    timestamp: new Date().toISOString(),
  });
});

// --------------------------------------------------
// Completion module
// --------------------------------------------------

const completionRepository = new InMemoryCompletionRepository();

const completionService = new CompletionService(
  completionRepository,
  process.env.ATTESTATION_HMAC_SECRET ?? ""
);

/**
 * P3 authentication has not been implemented yet.
 *
 * Protected Completion operations therefore remain
 * denied by default.
 *
 * Replace this authorization configuration only when
 * P3 supplies verified identity and permission callbacks.
 */
app.use(
  "/api",
  createCompletionRouter(
    completionService,
    denyAllCompletionAuthorization
  )
);

// --------------------------------------------------
// Evidence module
// --------------------------------------------------

const evidenceRepository = new InMemoryEvidenceRepository();

/**
 * Temporary mock invoice extraction provider.
 *
 * This must be replaced by the actual OCR/AI provider
 * before production deployment.
 */
const mockInvoiceExtractionProvider: InvoiceExtractionProvider = {
  async extractInvoice() {
    return {
      provider: "mock-invoice-extractor",
      metadata: {
        invoiceNumber: "INV-2026-001",
        vendorName: "Solar Solutions Ltd",
        invoiceDate: "2026-11-05",
        totalAmountCents: 1250000,
        currency: "INR",
        description: "Solar panel installation",
      },
    };
  },
};

const evidenceService = new EvidenceService(
  evidenceRepository,
  mockInvoiceExtractionProvider
);

/**
 * Evidence reviewer and organiser resolvers currently
 * default to null inside createEvidenceRouter.
 *
 * P3 identity integration remains pending.
 */
app.use(
  "/api",
  createEvidenceRouter(evidenceService)
);

export default app;
