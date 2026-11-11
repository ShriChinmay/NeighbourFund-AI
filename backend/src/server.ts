import { createApp } from "./app.js";
import { env } from "./config/env.js";

const server = createApp().listen(env.PORT, () => {
  console.log(`NeighbourFund API listening at http://localhost:${env.PORT}`);
});

function shutdown(signal: string) {
  console.log(`Received ${signal}; closing HTTP server`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));