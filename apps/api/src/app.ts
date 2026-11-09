import { EvidenceService } from "./modules/evidence/service.js";
import { createEvidenceRouter } from "./modules/evidence/routes.js";
import { InMemoryEvidenceRepository } from "./modules/evidence/in-memory-repo.js";
import express, { type Express } from "express";
import type { InvoiceExtractionProvider } from "./modules/evidence/service.js";

import { CompletionService } from "./modules/completion/service.js";
import { createCompletionRouter } from "./modules/completion/routes.js";
import { InMemoryCompletionRepository } from "./modules/completion/in-memory-repo.js";

const app: Express = express();

app.use(express.json({ limit: "1mb" }));

// Health check endpoint
app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "NeighbourFund API is running",
    timestamp: new Date().toISOString(),
  });
});

// Completion module dependencies
const completionRepository = new InMemoryCompletionRepository();

const completionService = new CompletionService(
  completionRepository,
  process.env.ATTESTATION_HMAC_SECRET ?? ""
);

// Completion API routes
app.use(
  "/api",
  createCompletionRouter(completionService)
);

// Evidence module dependencies
const evidenceRepository = new InMemoryEvidenceRepository();
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

// Evidence API routes
app.use("/api", createEvidenceRouter(evidenceService));

export default app;
