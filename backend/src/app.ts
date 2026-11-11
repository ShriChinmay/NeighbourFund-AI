import express from "express";
import cors from "cors";
import helmet from "helmet";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors()); // Tighten to configured frontend origins before deployment.
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "neighbourfund-api" });
  });

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "neighbourfund-api" });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });

  return app;
}