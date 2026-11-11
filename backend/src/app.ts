import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { optionalAuth } from "./modules/platform/auth/session.js";
import { authRouter } from "./modules/platform/auth/routes.js";
import { projectsRouter } from "./modules/platform/projects/routes.js";
import { fundingRouter } from "./modules/platform/funding/routes.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  const allowedOrigins = (process.env.APP_BASE_URL ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "neighbourfund-api" });
  });
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "neighbourfund-api" });
  });

  app.use("/api", optionalAuth, authRouter);
  app.use("/api", optionalAuth, projectsRouter);
  app.use("/api", optionalAuth, fundingRouter);
  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    console.error("API error:", error);
    if (res.headersSent) return;
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } });
  };
  app.use(errorHandler);
  return app;
}
