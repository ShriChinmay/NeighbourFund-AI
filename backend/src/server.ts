
import type { Express } from "express";
import { env } from "./config/env.js";

async function startServer(): Promise<void> {
  const appModule = await import("./app.js");

  const app = appModule.default as unknown as Express;

  app.listen(env.PORT, () => {
    console.log(`NeighbourFund API running on port ${env.PORT}`);
  });
}

startServer().catch((error: unknown) => {
  console.error("Failed to start NeighbourFund API:", error);
  process.exit(1);
});
