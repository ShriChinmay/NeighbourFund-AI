import { z } from "zod";
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";

import { EvidenceService } from "./service.js";

import {
  createEvidenceSchema,
  updateEvidenceMetadataSchema,
  reviewResolutionSchema,
  MAX_EVIDENCE_FILE_SIZE,
  ALLOWED_EVIDENCE_MIME_TYPES,
} from "./schemas.js";

// --------------------------------------------------
// Storage configuration
// --------------------------------------------------

const EVIDENCE_STORAGE_DIR = resolve(
  process.cwd(),
  "storage",
  "evidence"
);

// --------------------------------------------------
// Route helpers
// --------------------------------------------------

function getRouteParam(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid route parameter.");
  }

  return value;
}

function sendError(res: Response, error: unknown) {
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;

    return res.status(status).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Evidence file exceeds the 10 MB limit."
          : error.message,
    });
  }

  return res.status(400).json({
    success: false,
    message: error instanceof Error ? error.message : "Request failed.",
  });
}

// --------------------------------------------------
// Reviewer identity resolver
// --------------------------------------------------

export type ReviewerIdentityResolver = (
  req: Request
) => string | null;

export type OrganiserIdentityResolver = (
  req: Request
) => string | null;

// Reviewer identity must come from the authenticated request context.
// It must not be accepted from the request body.

const resolveReviewRequestSchema = z
  .object({
    resolution: reviewResolutionSchema,
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

// --------------------------------------------------
// Gate A request validation
// --------------------------------------------------

const gateAEvidenceRequestSchema = z
  .object({
    projectId: z.string().trim().min(1),
    expenseId: z.string().trim().min(1),
    evidenceId: z.string().trim().min(1),
  })
  .strict();

// --------------------------------------------------
// Multer storage configuration
// --------------------------------------------------

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    mkdir(EVIDENCE_STORAGE_DIR, { recursive: true })
      .then(() => callback(null, EVIDENCE_STORAGE_DIR))
      .catch((error: unknown) => callback(error as Error, ""));
  },

  filename: (_req, file, callback) => {
    const extensionByMimeType: Record<string, string> = {
      "application/pdf": ".pdf",
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
    };

    const extension = extensionByMimeType[file.mimetype];

    callback(null, `${randomUUID()}${extension ?? ""}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_EVIDENCE_FILE_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (
      !ALLOWED_EVIDENCE_MIME_TYPES.includes(
        file.mimetype as (typeof ALLOWED_EVIDENCE_MIME_TYPES)[number]
      )
    ) {
      callback(new Error("Unsupported evidence file type."));
      return;
    }

    callback(null, true);
  },
});

// --------------------------------------------------
// Handle multipart upload errors
// --------------------------------------------------

function handleSingleUpload(
  req: Request,
  res: Response,
  next: NextFunction
) {
  upload.single("file")(req, res, (error: unknown) => {
    if (error) {
      sendError(res, error);
      return;
    }

    next();
  });
}

// --------------------------------------------------
// Remove uploaded file if record creation fails
// --------------------------------------------------

async function removeUploadedFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // Cleanup failure must not hide the original request error.
  }
}

// --------------------------------------------------
// Evidence Router
// --------------------------------------------------

export function createEvidenceRouter(
  service: EvidenceService,
  resolveReviewerIdentity: ReviewerIdentityResolver = () => null,
  resolveOrganiserIdentity: OrganiserIdentityResolver = () => null
) {
  const router = Router();

  // --------------------------------------------------
  // 1. Upload a quotation or invoice for a milestone
  // POST /milestones/:id/documents
  // --------------------------------------------------

  router.post(
    "/milestones/:id/documents",
    handleSingleUpload,
    async (req: Request, res: Response) => {
      let uploadedFilePath: string | undefined;

      try {
        const milestoneId = getRouteParam(req.params.id);

        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: "A document file is required in the 'file' field.",
          });
        }

        uploadedFilePath = req.file.path;

        const parsed = createEvidenceSchema.safeParse({
          projectId: req.body.projectId,
          milestoneId,
          expenseId: req.body.expenseId,
          uploadedBy: req.body.uploadedBy,
          originalFileName: req.file.originalname,
          storageKey: req.file.filename,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
        });

        if (!parsed.success) {
          await removeUploadedFile(uploadedFilePath);

          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const evidence = await service.createEvidence(parsed.data);

        return res.status(201).json({
          success: true,
          message: "Evidence document uploaded successfully.",
          data: evidence,
        });
      } catch (error) {
        if (uploadedFilePath) {
          await removeUploadedFile(uploadedFilePath);
        }

        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // 2. Create an evidence record
  // POST /evidence
  // --------------------------------------------------

  router.post("/evidence", async (req: Request, res: Response) => {
    try {
      const parsed = createEvidenceSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          errors: parsed.error.issues,
        });
      }

      const evidence = await service.createEvidence(parsed.data);

      return res.status(201).json({
        success: true,
        data: evidence,
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  // --------------------------------------------------
  // 3. Retrieve one evidence record
  // GET /evidence/:id
  // --------------------------------------------------

  router.get("/evidence/:id", async (req: Request, res: Response) => {
    try {
      const id = getRouteParam(req.params.id);
      const evidence = await service.getEvidenceById(id);

      return res.status(200).json({
        success: true,
        data: evidence,
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  // --------------------------------------------------
  // 4. Retrieve document by ID
  // GET /documents/:id
  // --------------------------------------------------

  router.get("/documents/:id", async (req: Request, res: Response) => {
    try {
      const id = getRouteParam(req.params.id);
      const evidence = await service.getEvidenceById(id);

      return res.status(200).json({
        success: true,
        data: evidence,
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  // --------------------------------------------------
  // 5. List evidence for a project
  // GET /projects/:projectId/evidence
  // --------------------------------------------------

  router.get(
    "/projects/:projectId/evidence",
    async (req: Request, res: Response) => {
      try {
        const projectId = getRouteParam(req.params.projectId);
        const evidence = await service.getEvidenceByProject(projectId);

        return res.status(200).json({
          success: true,
          data: evidence,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // 6. List expenses for a project
  // GET /projects/:projectId/expenses
  // --------------------------------------------------

  router.get(
    "/projects/:projectId/expenses",
    async (req: Request, res: Response) => {
      try {
        const projectId = getRouteParam(req.params.projectId);
        const expenses = await service.getExpensesByProject(projectId);

        return res.status(200).json({
          success: true,
          data: expenses,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // 7. Run invoice metadata extraction
  // POST /evidence/:id/extract
  // --------------------------------------------------

  router.post(
    "/evidence/:id/extract",
    async (req: Request, res: Response) => {
      try {
        const id = getRouteParam(req.params.id);
        const evidence = await service.extractInvoiceMetadata(id);

        return res.status(200).json({
          success: true,
          data: evidence,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // 8. Confirm or correct extracted metadata
  // PATCH /evidence/:id/metadata
  // --------------------------------------------------

  router.patch(
    "/evidence/:id/metadata",
    async (req: Request, res: Response) => {
      try {
        const id = getRouteParam(req.params.id);
        const parsed = updateEvidenceMetadataSchema.safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const evidence = await service.confirmInvoiceMetadata(
          id,
          parsed.data.metadata
        );

        return res.status(200).json({
          success: true,
          data: evidence,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // 9. P4 contract alias: confirm document metadata
  // POST /documents/:id/confirm
  // --------------------------------------------------

  router.post(
    "/documents/:id/confirm",
    async (req: Request, res: Response) => {
      try {
        const id = getRouteParam(req.params.id);
        const parsed = updateEvidenceMetadataSchema.safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const evidence = await service.confirmInvoiceMetadata(
          id,
          parsed.data.metadata
        );

        return res.status(200).json({
          success: true,
          data: evidence,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // 10. Reject an evidence record
  // POST /evidence/:id/reject
  // --------------------------------------------------

  router.post(
    "/evidence/:id/reject",
    async (req: Request, res: Response) => {
      try {
        const id = getRouteParam(req.params.id);
        const evidence = await service.rejectEvidence(id);

        return res.status(200).json({
          success: true,
          data: evidence,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // 11. Retrieve unresolved reviewer queue
  // GET /projects/:projectId/review-queue
  // --------------------------------------------------

  router.get(
    "/projects/:projectId/review-queue",
    async (req: Request, res: Response) => {
      try {
        const reviewerId = resolveReviewerIdentity(req);

        if (!reviewerId || !reviewerId.trim()) {
          return res.status(401).json({
            success: false,
            message: "Authenticated reviewer identity is required.",
          });
        }

        const projectId = getRouteParam(req.params.projectId);
        const queue = await service.getReviewQueue(projectId);

        return res.status(200).json({
          success: true,
          data: queue,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // 12. Resolve a verification review
  // POST /reviews/:id/resolve
  // --------------------------------------------------

  router.post(
    "/reviews/:id/resolve",
    async (req: Request, res: Response) => {
      try {
        const reviewerId = resolveReviewerIdentity(req);

        if (!reviewerId || !reviewerId.trim()) {
          return res.status(401).json({
            success: false,
            message: "Authenticated reviewer identity is required.",
          });
        }

        const reviewId = getRouteParam(req.params.id);
        const parsed = resolveReviewRequestSchema.safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const review = await service.resolveVerificationReview(
          reviewId,
          reviewerId,
          parsed.data.resolution,
          parsed.data.reason
        );

        return res.status(200).json({
          success: true,
          data: review,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // 13. Retrieve project evidence coverage report
  // GET /projects/:projectId/evidence-coverage
  // --------------------------------------------------

  router.get(
    "/projects/:projectId/evidence-coverage",
    async (req: Request, res: Response) => {
      try {
        const projectId = getRouteParam(req.params.projectId);

        const coverage = await service.getEvidenceCoverage(projectId);

        return res.status(200).json({
          success: true,
          data: coverage,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // 14. Assess Gate A evidence readiness
  // POST /milestones/:id/gate-a/decision
  // --------------------------------------------------

  router.post(
    "/milestones/:id/gate-a/decision",
    async (req: Request, res: Response) => {
      try {
        const milestoneId = getRouteParam(req.params.id);

        const reviewerId = resolveReviewerIdentity(req);

        if (!reviewerId || !reviewerId.trim()) {
          return res.status(401).json({
            success: false,
            message: "Authenticated reviewer identity is required.",
          });
        }

        const organiserId = resolveOrganiserIdentity(req);

        if (!organiserId || !organiserId.trim()) {
          return res.status(401).json({
            success: false,
            message: "Authenticated organiser identity is required.",
          });
        }

        const parsed = gateAEvidenceRequestSchema.safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const { projectId, expenseId, evidenceId } = parsed.data;

        // Ensure the selected evidence belongs to this milestone.
        const evidence = await service.getEvidenceById(evidenceId);

        if (evidence.milestoneId !== milestoneId) {
          return res.status(400).json({
            success: false,
            message: "Evidence does not belong to the specified milestone.",
          });
        }

        const assessment = await service.assessGateAEvidence({
          projectId,
          expenseId,
          evidenceId,
          reviewerId,
          organiserId,
        });

        return res.status(200).json({
          success: true,
          data: {
            milestoneId,
            ...assessment,
          },
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  return router;
}
