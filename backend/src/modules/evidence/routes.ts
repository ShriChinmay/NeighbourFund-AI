import { z } from "zod";
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, open, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { EvidenceService } from "./service.js";

import {
  createEvidenceSchema,
  createEvidenceRequestSchema,
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
// Identity resolvers
// --------------------------------------------------

export type ReviewerIdentityResolver = (
  req: Request
) => string | null;

export type OrganiserIdentityResolver = (
  req: Request
) => string | null;

export type UploaderIdentityResolver = (
  req: Request
) => string | null | Promise<string | null>;

// --------------------------------------------------
// Evidence authorization contract
// --------------------------------------------------

export interface EvidenceAuthorization {
    getProjectOrganiserId(
    projectId: string
  ): Promise<string | null>;

  canUpload(
    req: Request,
    projectId: string,
    expenseId?: string
  ): boolean | Promise<boolean>;

  canReadEvidence(
    req: Request,
    evidenceId: string
  ): boolean | Promise<boolean>;

  canReadProject(
    req: Request,
    projectId: string
  ): boolean | Promise<boolean>;

  canExtract(
    req: Request,
    evidenceId: string
  ): boolean | Promise<boolean>;

  canReview(
    req: Request,
    evidenceId: string
  ): boolean | Promise<boolean>;

  canAccessReviewQueue(
    req: Request,
    projectId?: string
  ): boolean | Promise<boolean>;

  canResolveReview(
    req: Request,
    reviewId: string
  ): boolean | Promise<boolean>;

  canAssessGateA(
    req: Request,
    projectId: string,
    expenseId: string,
    evidenceId: string
  ): boolean | Promise<boolean>;
}

// --------------------------------------------------
// Deny-by-default authorization
// --------------------------------------------------

export const denyAllEvidenceAuthorization: EvidenceAuthorization = {
  getProjectOrganiserId: async () => null,
  canUpload: () => false,
  canReadEvidence: () => false,
  canReadProject: () => false,
  canExtract: () => false,
  canReview: () => false,
  canAccessReviewQueue: () => false,
  canResolveReview: () => false,
  canAssessGateA: () => false,
};

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

function unauthorized(res: Response, message: string) {
  return res.status(403).json({
    success: false,
    message,
  });
}

function unauthenticated(res: Response, message: string) {
  return res.status(401).json({
    success: false,
    message,
  });
}

// --------------------------------------------------
// Request validation
// --------------------------------------------------

const resolveReviewRequestSchema = z
  .object({
    resolution: reviewResolutionSchema,
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

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

// Keep incoming files in memory until authentication and authorization pass.
// Files are written to disk only inside the authorized upload handler.
const upload = multer({
  storage: multer.memoryStorage(),
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
// File cleanup
// --------------------------------------------------

async function removeUploadedFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // Cleanup failure must not hide the original request error.
  }
}

// --------------------------------------------------
// Actual file signature validation
// --------------------------------------------------

async function hasValidFileSignature(
  filePath: string,
  mimeType: string
): Promise<boolean> {
  const file = await open(filePath, "r");

  try {
    const buffer = Buffer.alloc(12);
    const { bytesRead } = await file.read(buffer, 0, 12, 0);
    const bytes = buffer.subarray(0, bytesRead);

    switch (mimeType) {
      case "application/pdf":
        return bytes.subarray(0, 5).toString() === "%PDF-";

      case "image/jpeg":
        return (
          bytes.length >= 3 &&
          bytes[0] === 0xff &&
          bytes[1] === 0xd8 &&
          bytes[2] === 0xff
        );

      case "image/png":
        return (
          bytes.length >= 8 &&
          bytes.subarray(0, 8).equals(
            Buffer.from([
              0x89, 0x50, 0x4e, 0x47,
              0x0d, 0x0a, 0x1a, 0x0a,
            ])
          )
        );

      case "image/webp":
        return (
          bytes.length >= 12 &&
          bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP"
        );

      default:
        return false;
    }
  } finally {
    await file.close();
  }
}

// --------------------------------------------------
// Evidence Router
// --------------------------------------------------

export function createEvidenceRouter(
  service: EvidenceService,
  resolveReviewerIdentity: ReviewerIdentityResolver = () => null,
  resolveOrganiserIdentity: OrganiserIdentityResolver = () => null,
  resolveUploaderIdentity: UploaderIdentityResolver = () => null,
  authorization: EvidenceAuthorization = denyAllEvidenceAuthorization
) {
  const router = Router();
  // Authorize before Multer processes the uploaded file.
  const authorizeUploadBeforeParsing = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const uploaderId = await resolveUploaderIdentity(req);

      if (!uploaderId || !uploaderId.trim()) {
        return unauthenticated(
          res,
          "Authenticated uploader identity is required."
        );
      }

      const projectId = req.get("x-project-id")?.trim();
      const expenseId = req.get("x-expense-id")?.trim() || undefined;

      if (!projectId) {
        return res.status(400).json({
          success: false,
          message: "Project identifier is required.",
        });
      }

      const allowed = await authorization.canUpload(
        req,
        projectId,
        expenseId
      );

      if (!allowed) {
        return unauthorized(
          res,
          "You are not authorized to upload evidence for this project."
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  // --------------------------------------------------
  // 1. Shared upload handler
  // --------------------------------------------------

  const createUploadHandler = (requireMilestone: boolean) =>
    async (req: Request, res: Response) => {
      let uploadedFilePath: string | undefined;

      try {
        const milestoneId = requireMilestone
          ? getRouteParam(req.params.id)
          : undefined;

        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: "A document file is required in the 'file' field.",
          });
        }

        // Validate the public request.
        // Client-supplied uploadedBy and storageKey are deliberately ignored.
        const parsed = createEvidenceRequestSchema.safeParse({
          projectId: req.body.projectId,
          ...(milestoneId ? { milestoneId } : {}),
          expenseId: req.body.expenseId,
          originalFileName: req.file.originalname,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
        });

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        // Resolve uploader from trusted authentication context.
        const uploaderId = await resolveUploaderIdentity(req);

        if (!uploaderId || !uploaderId.trim()) {
          return unauthenticated(
            res,
            "Authenticated uploader identity is required."
          );
        }

        const { projectId, expenseId } = parsed.data;

        // Ensure the multipart body matches the identifiers authorized before parsing.
        const authorizedProjectId = req.get("x-project-id")?.trim();
        const authorizedExpenseId = req.get("x-expense-id")?.trim() || undefined;

        if (
          authorizedProjectId !== projectId ||
          (authorizedExpenseId !== undefined &&
            authorizedExpenseId !== expenseId)
        ) {
          return res.status(400).json({
            success: false,
            message: "Upload metadata does not match authorization metadata.",
          });
        }

        // Fail closed unless P3 supplies the permission implementation.
        const allowed = await authorization.canUpload(
          req,
          projectId,
          expenseId
        );

        if (!allowed) {
          return unauthorized(
            res,
            "You are not authorized to upload evidence for this project."
          );
        }

        // Persist only after trusted identity and project authorization pass.
        const extensionByMimeType: Record<string, string> = {
          "application/pdf": ".pdf",
          "image/jpeg": ".jpg",
          "image/png": ".png",
          "image/webp": ".webp",
        };
        const filename = `${randomUUID()}${extensionByMimeType[req.file.mimetype] ?? ""}`;

        await mkdir(EVIDENCE_STORAGE_DIR, { recursive: true });
        uploadedFilePath = resolve(EVIDENCE_STORAGE_DIR, filename);
        await writeFile(uploadedFilePath, req.file.buffer);

        // Validate actual file bytes, not only the MIME header.
        const validSignature = await hasValidFileSignature(
          uploadedFilePath,
          req.file.mimetype
        );

        if (!validSignature) {
          await removeUploadedFile(uploadedFilePath);

          return res.status(400).json({
            success: false,
            message: "File content does not match the declared file type.",
          });
        }

        const input = {
          ...parsed.data,
          uploadedBy: uploaderId,
          storageKey: filename,
        };

        const validatedInput = createEvidenceSchema.safeParse(input);

        if (!validatedInput.success) {
          await removeUploadedFile(uploadedFilePath);

          return res.status(400).json({
            success: false,
            errors: validatedInput.error.issues,
          });
        }

        const evidence = await service.createEvidence(validatedInput.data);

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
    };

  // --------------------------------------------------
  // 2. Upload document for a milestone
  // POST /milestones/:id/documents
  // --------------------------------------------------

  router.post(
    "/milestones/:id/documents",
    authorizeUploadBeforeParsing,
    handleSingleUpload,
    createUploadHandler(true)
  );

  // --------------------------------------------------
  // 3. Upload evidence
  // POST /evidence
  // --------------------------------------------------

  router.post(
    "/evidence",
    authorizeUploadBeforeParsing,
    handleSingleUpload,
    createUploadHandler(false)
  );

  // --------------------------------------------------
  // 4. Retrieve one evidence record
  // GET /evidence/:id
  // --------------------------------------------------

  router.get("/evidence/:id", async (req: Request, res: Response) => {
    try {
      const id = getRouteParam(req.params.id);

      if (!(await authorization.canReadEvidence(req, id))) {
        return unauthorized(
          res,
          "You are not authorized to access this evidence."
        );
      }

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
  // 5. Retrieve document by ID
  // GET /documents/:id
  // --------------------------------------------------

  router.get("/documents/:id", async (req: Request, res: Response) => {
    try {
      const id = getRouteParam(req.params.id);

      if (!(await authorization.canReadEvidence(req, id))) {
        return unauthorized(
          res,
          "You are not authorized to access this document."
        );
      }

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
  // 6. List evidence for a project
  // GET /projects/:projectId/evidence
  // --------------------------------------------------

  router.get(
    "/projects/:projectId/evidence",
    async (req: Request, res: Response) => {
      try {
        const projectId = getRouteParam(req.params.projectId);

        if (!(await authorization.canReadProject(req, projectId))) {
          return unauthorized(
            res,
            "You are not authorized to access this project's evidence."
          );
        }

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
  // 7. List expenses for a project
  // GET /projects/:projectId/expenses
  // --------------------------------------------------

  router.get(
    "/projects/:projectId/expenses",
    async (req: Request, res: Response) => {
      try {
        const projectId = getRouteParam(req.params.projectId);

        if (!(await authorization.canReadProject(req, projectId))) {
          return unauthorized(
            res,
            "You are not authorized to access this project's expenses."
          );
        }

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
  // 8. Run invoice metadata extraction
  // POST /evidence/:id/extract
  // --------------------------------------------------

  router.post(
    "/evidence/:id/extract",
    async (req: Request, res: Response) => {
      try {
        const id = getRouteParam(req.params.id);

        if (!(await authorization.canExtract(req, id))) {
          return unauthorized(
            res,
            "You are not authorized to extract metadata from this evidence."
          );
        }

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
  // 9. Confirm or correct extracted metadata
  // PATCH /evidence/:id/metadata
  // --------------------------------------------------

  router.patch(
    "/evidence/:id/metadata",
    async (req: Request, res: Response) => {
      try {
        const id = getRouteParam(req.params.id);
        const reviewerId = resolveReviewerIdentity(req);

        if (!reviewerId || !reviewerId.trim()) {
          return unauthenticated(
            res,
            "Authenticated reviewer identity is required."
          );
        }

        if (!(await authorization.canReview(req, id))) {
          return unauthorized(
            res,
            "You are not authorized to review this evidence."
          );
        }

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
  // 10. Confirm document metadata
  // POST /documents/:id/confirm
  // --------------------------------------------------

  router.post(
    "/documents/:id/confirm",
    async (req: Request, res: Response) => {
      try {
        const id = getRouteParam(req.params.id);
        const reviewerId = resolveReviewerIdentity(req);

        if (!reviewerId || !reviewerId.trim()) {
          return unauthenticated(
            res,
            "Authenticated reviewer identity is required."
          );
        }

        if (!(await authorization.canReview(req, id))) {
          return unauthorized(
            res,
            "You are not authorized to review this evidence."
          );
        }

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
  // 11. Reject evidence
  // POST /evidence/:id/reject
  // --------------------------------------------------

  router.post(
    "/evidence/:id/reject",
    async (req: Request, res: Response) => {
      try {
        const id = getRouteParam(req.params.id);
        const reviewerId = resolveReviewerIdentity(req);

        if (!reviewerId || !reviewerId.trim()) {
          return unauthenticated(
            res,
            "Authenticated reviewer identity is required."
          );
        }

        if (!(await authorization.canReview(req, id))) {
          return unauthorized(
            res,
            "You are not authorized to review this evidence."
          );
        }

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
  // 12. Retrieve unresolved reviewer queue
  // GET /projects/:projectId/review-queue
  // --------------------------------------------------

  router.get(
    "/projects/:projectId/review-queue",
    async (req: Request, res: Response) => {
      try {
        const reviewerId = resolveReviewerIdentity(req);

        if (!reviewerId || !reviewerId.trim()) {
          return unauthenticated(
            res,
            "Authenticated reviewer identity is required."
          );
        }

        const projectId = getRouteParam(req.params.projectId);

        if (!(await authorization.canAccessReviewQueue(req, projectId))) {
          return unauthorized(
            res,
            "You are not authorized to access this review queue."
          );
        }

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
  // 13. Resolve a verification review
  // POST /reviews/:id/resolve
  // --------------------------------------------------

  router.post(
    "/reviews/:id/resolve",
    async (req: Request, res: Response) => {
      try {
        const reviewId = getRouteParam(req.params.id);

        const parsed = resolveReviewRequestSchema.safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const reviewerId = resolveReviewerIdentity(req);

        if (!reviewerId || !reviewerId.trim()) {
          return unauthenticated(
            res,
            "Authenticated reviewer identity is required."
          );
        }

        if (!(await authorization.canResolveReview(req, reviewId))) {
          return unauthorized(
            res,
            "You are not authorized to resolve this review."
          );
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
  // 14. Retrieve project evidence coverage
  // GET /projects/:projectId/evidence-coverage
  // --------------------------------------------------

  router.get(
    "/projects/:projectId/evidence-coverage",
    async (req: Request, res: Response) => {
      try {
        const projectId = getRouteParam(req.params.projectId);

        if (!(await authorization.canReadProject(req, projectId))) {
          return unauthorized(
            res,
            "You are not authorized to access this project's evidence coverage."
          );
        }

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
  // 15. Assess Gate A evidence readiness
  // POST /milestones/:id/gate-a/decision
  // --------------------------------------------------

  router.post(
    "/milestones/:id/gate-a/decision",
    async (req: Request, res: Response) => {
      try {
        const milestoneId = getRouteParam(req.params.id);

        const reviewerId = resolveReviewerIdentity(req);

        if (!reviewerId || !reviewerId.trim()) {
          return unauthenticated(
            res,
            "Authenticated reviewer identity is required."
          );
        }

        const parsed = gateAEvidenceRequestSchema.safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const organiserId = await authorization.getProjectOrganiserId(
          parsed.data.projectId
        );

        if (!organiserId) {
          return unauthorized(
            res,
            "Unable to verify the project's organiser."
          );
        }

        const { projectId, expenseId, evidenceId } = parsed.data;


        if (
          !(await authorization.canAssessGateA(
            req,
            projectId,
            expenseId,
            evidenceId
          ))
        ) {
          return unauthorized(
            res,
            "You are not authorized to assess Gate A."
          );
        }

        const evidence = await service.getEvidenceById(evidenceId);

        if (
          evidence.projectId !== projectId ||
          evidence.milestoneId !== milestoneId
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Evidence does not belong to the specified project and milestone.",
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
