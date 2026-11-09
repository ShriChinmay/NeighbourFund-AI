import dotenv from "dotenv";
import type { Express } from "express";

dotenv.config({
  path: "../../.env",
});

async function startServer(): Promise<void> {
  const appModule = await import("./app.js");

  const app = appModule.default as unknown as Express;

  const PORT = Number(process.env.PORT) || 5000;

  app.listen(PORT, () => {
    console.log(`NeighbourFund API running on port ${PORT}`);
  });
}

startServer().catch((error: unknown) => {
  console.error("Failed to start NeighbourFund API:", error);
  process.exit(1);
});
