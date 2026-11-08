import express, { type Express } from "express";

const app: Express = express();

app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "NeighbourFund API is running",
    timestamp: new Date().toISOString(),
  });
});

export default app;
