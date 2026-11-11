
import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";

import { CompletionService } from "./service.js";

import {
  createCompletionSpecSchema,
  createProofSubmissionSchema,
  createProofReviewSchema,
  submitAttestationSchema,
} from "./schemas.js";

const attestationLinksSchema = z.object({
  householdIds: z.array(z.string().trim().min(1)).min(1),
}).strict();

/**
 * Identity must come from trusted authentication middleware
 * or a verified server-side session.
 *
 * Never trust identities from request bodies,
 * query parameters, or arbitrary headers.
 */
export type TrustedIdentityResolver = (
  req: Request
) => string | null;

/**
 * Completion authorization boundary.
 *
 * P3 will provide actual identity resolution and permission
 * callbacks when its authentication module is implemented.
 */
export interface CompletionAuthorization {
  resolveOrganiserIdentity: TrustedIdentityResolver;
  resolveSubmitterIdentity: TrustedIdentityResolver;
  resolveReviewerIdentity: TrustedIdentityResolver;
  resolveViewerIdentity: TrustedIdentityResolver;

  canManageMilestone: (
    userId: string,
    milestoneId: string
  ) => Promise<boolean>;

  canSubmitProof: (
    userId: string,
    resourceId: string
  ) => Promise<boolean>;

  canReviewProof: (
    userId: string,
    milestoneId: string
  ) => Promise<boolean>;

  canViewMilestone: (
    userId: string,
    milestoneId: string
  ) => Promise<boolean>;
}

/**
 * Secure default.
 *
 * No protected Completion operation is authorized
 * until trusted P3 authentication is connected.
 */
export const denyAllCompletionAuthorization: CompletionAuthorization = {
  resolveOrganiserIdentity: () => null,
  resolveSubmitterIdentity: () => null,
  resolveReviewerIdentity: () => null,
  resolveViewerIdentity: () => null,

  canManageMilestone: async () => false,
  canSubmitProof: async () => false,
  canReviewProof: async () => false,
  canViewMilestone: async () => false,
};

function getRouteParam(
  value: string | string[] | undefined
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid route parameter.");
  }

  return value;
}

function sendError(
  res: Response,
  error: unknown
) {
  return res.status(400).json({
    success: false,
    message:
      error instanceof Error
        ? error.message
        : "Request failed",
  });
}

export function createCompletionRouter(
  service: CompletionService,
  authorization: CompletionAuthorization =
    denyAllCompletionAuthorization
) {
  const router = Router();

  /**
   * Checks trusted identity and resource permission.
   */
  async function authorize(
    res: Response,
    req: Request,
    resolver: TrustedIdentityResolver,
    permissionCheck: (
      userId: string,
      resourceId: string
    ) => Promise<boolean>,
    resourceId: string
  ): Promise<boolean> {
    const userId = resolver(req);

    if (!userId || !userId.trim()) {
      res.status(401).json({
        success: false,
        message: "Authenticated identity is required.",
      });

      return false;
    }

    const allowed = await permissionCheck(
      userId,
      resourceId
    );

    if (!allowed) {
      res.status(403).json({
        success: false,
        message: "You are not authorized to perform this action.",
      });

      return false;
    }

    return true;
  }

  // --------------------------------------------------
  // Create completion specification
  // --------------------------------------------------

  router.post(
    "/milestones/:id/completion-spec",
    async (req: Request, res: Response) => {
      try {
        const milestoneId = getRouteParam(req.params.id);

        const authorized = await authorize(
          res,
          req,
          authorization.resolveOrganiserIdentity,
          authorization.canManageMilestone,
          milestoneId
        );

        if (!authorized) return;

        const parsed = createCompletionSpecSchema.safeParse({
          ...req.body,
          milestoneId,
        });

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const spec = await service.createCompletionSpec(
          parsed.data
        );

        return res.status(201).json({
          success: true,
          data: spec,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // Retrieve completion specification
  // --------------------------------------------------

  router.get(
    "/milestones/:id/completion-spec",
    async (req: Request, res: Response) => {
      try {
        const milestoneId = getRouteParam(req.params.id);

        const authorized = await authorize(
          res,
          req,
          authorization.resolveViewerIdentity,
          authorization.canViewMilestone,
          milestoneId
        );

        if (!authorized) return;

        const spec = await service.getCompletionSpec(
          milestoneId
        );

        if (!spec) {
          return res.status(404).json({
            success: false,
            message: "Completion specification not found.",
          });
        }

        return res.status(200).json({
          success: true,
          data: spec,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // Submit completion proof
  // --------------------------------------------------

  router.post(
    "/milestones/:id/proof",
    async (req: Request, res: Response) => {
      try {
        const resourceId = getRouteParam(req.params.id);

        const authorized = await authorize(
          res,
          req,
          authorization.resolveSubmitterIdentity,
          authorization.canSubmitProof,
          resourceId
        );

        if (!authorized) return;

        const parsed = createProofSubmissionSchema.safeParse(
          req.body
        );

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const proof = await service.submitProof(
          resourceId,
          parsed.data
        );

        return res.status(201).json({
          success: true,
          data: proof,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // Generate household attestation links
  // --------------------------------------------------

  router.post(
    "/milestones/:id/attestation-links",
    async (req: Request, res: Response) => {
      try {
        const milestoneId = getRouteParam(req.params.id);

        // Authorize against the actual milestone ID.
        const authorized = await authorize(
          res,
          req,
          authorization.resolveOrganiserIdentity,
          authorization.canManageMilestone,
          milestoneId
        );

        if (!authorized) return;

        const parsed = attestationLinksSchema.safeParse(
          req.body
        );

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        // Resolve the completion specification belonging
        // to this milestone before generating attestation links.
        const spec = await service.getCompletionSpec(
          milestoneId
        );

        if (!spec) {
          return res.status(404).json({
            success: false,
            message: "Completion specification not found for this milestone.",
          });
        }

        const links = await service.generateAttestationLinks(
          spec.id,
          parsed.data.householdIds
        );

        return res.status(201).json({
          success: true,
          data: links,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // Public attestation token lookup
  // --------------------------------------------------

  router.get(
    "/attest/:token",
    async (req: Request, res: Response) => {
      try {
        const token = getRouteParam(req.params.token);

        const attestation = await service.getAttestationByToken(
          token
        );

        return res.status(200).json({
          success: true,
          data: {
            valid: true,
            expiresAt: attestation.expiresAt,
          },
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // Public household attestation submission
  // --------------------------------------------------

  router.post(
    "/attest/:token",
    async (req: Request, res: Response) => {
      try {
        const token = getRouteParam(req.params.token);

        const parsed = submitAttestationSchema.safeParse({
          ...req.body,
          token,
        });

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const result = await service.submitAttestation(
          parsed.data.token,
          parsed.data.response
        );

        return res.status(200).json({
          success: true,
          data: {
            response: result.response,
            submittedAt: result.usedAt,
          },
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // Reviewer decision on completion proof
  // --------------------------------------------------

  router.post(
    "/milestones/:id/proof/decision",
    async (req: Request, res: Response) => {
      try {
        const milestoneId = getRouteParam(req.params.id);

        const reviewerId =
          authorization.resolveReviewerIdentity(req);

        if (!reviewerId || !reviewerId.trim()) {
          return res.status(401).json({
            success: false,
            message: "Authenticated reviewer identity is required.",
          });
        }

        const allowed = await authorization.canReviewProof(
          reviewerId,
          milestoneId
        );

        if (!allowed) {
          return res.status(403).json({
            success: false,
            message: "You are not authorized to review this proof.",
          });
        }

        const parsed = createProofReviewSchema.safeParse(
          req.body
        );

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const spec = await service.getCompletionSpec(
          milestoneId
        );

        if (!spec) {
          return res.status(404).json({
            success: false,
            message: "Completion specification not found.",
          });
        }

        const submission = await service.getProofForMilestone(
          milestoneId
        );

        if (!submission) {
          return res.status(404).json({
            success: false,
            message: "Proof submission not found.",
          });
        }

        const review = await service.createProofReview(
          submission.id,
          reviewerId,
          parsed.data
        );

        return res.status(201).json({
          success: true,
          data: review,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // --------------------------------------------------
  // Check Gate B eligibility
  // --------------------------------------------------

  router.get(
    "/milestones/:id/gate-b/eligibility",
    async (req: Request, res: Response) => {
      try {
        const milestoneId = getRouteParam(req.params.id);

        const authorized = await authorize(
          res,
          req,
          authorization.resolveViewerIdentity,
          authorization.canViewMilestone,
          milestoneId
        );

        if (!authorized) return;

        const result = await service.getGateBEligibility(
          milestoneId
        );

        return res.status(200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  return router;
}
