import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env.js";

// P3 platform modules
import { optionalAuth } from "./modules/platform/auth/session.js";
import { authRouter } from "./modules/platform/auth/routes.js";
import { projectsRouter } from "./modules/platform/projects/routes.js";
import { fundingRouter } from "./modules/platform/funding/routes.js";

import {
  completionAuthorization,
  createEvidenceAuthorization,
  resolveReviewerIdentity,
  resolveOrganiserIdentity,
  resolveUploaderIdentity,
} from "./modules/platform/integration/authorization.js";

import {
  validateAttestationHouseholds,
} from "./modules/platform/ownership/ownership.js";

// P4 Completion module
import {
  CompletionService,
} from "./modules/completion/service.js";

import {
  createCompletionRouter,
} from "./modules/completion/routes.js";

import {
  PostgresCompletionRepository,
} from "./modules/completion/postgres-repo.js";

import {
  PostgresEvidenceRepository,
} from "./modules/evidence/postgres-repo.js";

// P4 Evidence module
import {
  EvidenceService,
  type InvoiceExtractionProvider,
} from "./modules/evidence/service.js";

import {
  createEvidenceRouter,
} from "./modules/evidence/routes.js";

export function createApp() {
  const app = express();

  // Security and middleware
  app.disable("x-powered-by");
  app.use(helmet());

  const allowedOrigins = (
    process.env.APP_BASE_URL ??
    "http://localhost:5173,http://127.0.0.1:5173"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );

  app.use(express.json({ limit: "1mb" }));

  // Health checks
  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "neighbourfund-api",
    });
  });

  app.get("/api/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "neighbourfund-api",
    });
  });

  // Resolve trusted session identity for API routes.
  app.use("/api", optionalAuth);

  // P3 platform routes
  app.use("/api", authRouter);
  app.use("/api", projectsRouter);
  app.use("/api", fundingRouter);

  // P4 Completion module
  const completionRepository = new PostgresCompletionRepository();

  const completionService = new CompletionService(
    completionRepository,
    process.env.ATTESTATION_HMAC_SECRET ?? "",
    undefined,
    {
      validateAttestationHouseholds,
    }
  );

  app.use(
    "/api",
    createCompletionRouter(
      completionService,
      completionAuthorization
    )
  );

  // P4 Evidence module
  const evidenceRepository = new PostgresEvidenceRepository();

  
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

  const invoiceExtractionProvider: InvoiceExtractionProvider =
    env.P4_DEMO_MODE && env.NODE_ENV !== "production"
      ? mockInvoiceExtractionProvider
      : {
          async extractInvoice() {
            throw new Error(
              "Invoice extraction provider is not configured. Enable P4_DEMO_MODE only for explicit demo use."
            );
          },
        };
        
  const evidenceService = new EvidenceService(
    evidenceRepository,
    invoiceExtractionProvider
  );

  // Connect P3 authorization to P4 Evidence repository.
  const evidenceAuthorization = createEvidenceAuthorization({
    async evidenceProjectId(evidenceId) {
      const evidence =
        await evidenceRepository.getEvidenceById(evidenceId);

      return evidence?.projectId ?? null;
    },

    async expenseProjectId(expenseId) {
      const expense =
        await evidenceRepository.getExpenseById(expenseId);

      return expense?.projectId ?? null;
    },

    async reviewProjectId(reviewId) {
      const review =
        await evidenceRepository.getVerificationReviewById(reviewId);

      if (!review) {
        return null;
      }

      const expense =
        await evidenceRepository.getExpenseById(review.expenseId);

      return expense?.projectId ?? null;
    },
  });

  app.use(
    "/api",
    createEvidenceRouter(
      evidenceService,
      resolveReviewerIdentity,
      resolveOrganiserIdentity,
      resolveUploaderIdentity,
      evidenceAuthorization
    )
  );

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    });
  });

  // Central error handler
  const errorHandler: ErrorRequestHandler = (
    error,
    _req,
    res,
    _next
  ) => {
    console.error("API error:", error);

    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      },
    });
  };

  app.use(errorHandler);

  return app;
}

// Preserve both P3 test imports and P4 server compatibility.
const app = createApp();

export default app;
