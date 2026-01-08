import "./register-path-aliases";
import { initWorkerUtils } from "#lib/graphile-worker-utils";
import cors, { CorsOptions } from "cors";
import express, { Application, Request, Response } from "express";
import { config } from "./lib/config";
import { closeAllDbs } from "./lib/db/index";
import { logger } from "./lib/logger";
import redisClient from "./lib/redisClient";
import { mountApplicationRoutes } from "./routes";

initWorkerUtils().catch((err) => {
  console.error(err);
  logger.error("Failed to initialize workerUtils", { error: err });
  process.exit(1);
});

const app: Application = express();
const port: number = config.port;

// Allow all origins since this API is for server-to-server communication.
// Even if the requests originate from the browser, for now we have to authenticate them
// using API keys (a bad idea it is a server-only secret). So if CORS happens for any reason,
// okay hope the dev knows what they are doing.
const corsOptions: CorsOptions = {
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Enable CORS with the specified options
app.use(cors(corsOptions));

app.use(express.json());

app.use((req: Request, res: Response, next: Function) => {
  // TODO: make this a secret value thru ansible secrets and env, rather than
  // hard-coding. Currently this value will be added to
  // sse-pushpin/routes (hard-coded there also), so all pushpin requests carry
  // it. Since pushpin directly is talking to our api server and not going thru
  // nginx, it will be http, and we use this secret header value to authenticate.
  const pushPinSecret = req.headers["nua-pushpin-secret"];
  const isDirectInternalSseRequestFromPushpin =
    pushPinSecret &&
    (req.path === "/sse" || req.path.startsWith("/sse/")) &&
    pushPinSecret === "orjin"; // strongest of Pomle

  if (
    config.nodeEnv === "production" &&
    !isDirectInternalSseRequestFromPushpin
  ) {
    const forwardedProto = req.headers["x-forwarded-proto"];
    if (forwardedProto !== "https") {
      logger.warn(
        `Rejected non-HTTPS request in production from ${req.ip}: ${req.method} ${req.url}`,
      );
      return res.status(426).json({
        error: "HTTPS Required",
        message: "This server only accepts HTTPS connections in production",
      });
    }
  }
  next();
});

mountApplicationRoutes(app);

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
});

// Graceful shutdown
async function gracefulShutdown() {
  logger.info("[AppShutdown] Starting graceful shutdown...");

  // Close database connections
  await closeAllDbs();
  logger.info("[AppShutdown] Database connections closed.");

  // Close Redis connection
  await redisClient.quit();
  logger.info("[AppShutdown] Redis connection closed.");

  process.exit(0);
}

// Handle shutdown signals
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// If incoming request is a malformed JSON, return a 400 Bad Request.
app.use((err: Error, req: Request, res: Response, next: Function) => {
  if (
    err instanceof SyntaxError &&
    "status" in err &&
    (err as any).status === 400 &&
    "body" in err
  ) {
    logger.error("Malformed JSON received", err);
    return res.status(400).json({
      error:
        "Invalid JSON in request body. Unable to parse using JSON.parse() method. Please check your JSON syntax and try again.",
    });
  }
  next(err);
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: Function) => {
  logger.error("unexpected-situation. Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
const server = app.listen(port, async () => {
  logger.info(`Server is listening to http://localhost:${port}`);
});
