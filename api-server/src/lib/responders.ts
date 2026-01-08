import { Request, Response } from "express";
import { logger as rootLogger } from "./logger";

function normalizeError(error: unknown) {
  if (!error) return undefined;
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  if (typeof error === "object") {
    return error;
  }
  return { message: String(error) };
}

export function sendUnauthorized(req: Request, res: Response, message: string) {
  req.ctx?.logger.warn("Unauthorized", {
    type: "auth_failure",
    reason: message,
    duration_ms: req.ctx?.elapsedMs(),
  });
  return res.status(401).json({ error: "Unauthorized", message });
}

export function sendFrontendTokenExpired(
  req: Request,
  res: Response,
  message = "JWT token has expired. Please mint a new token and retry your request.",
) {
  req.ctx?.logger.warn("Token expired", {
    type: "auth_failure",
    reason: message,
    duration_ms: req.ctx?.elapsedMs(),
  });
  return res.status(401).json({ error: "TokenExpired", message });
}

export function sendNotFound(req: Request, res: Response, message: string) {
  req.ctx?.logger.warn("Not found", {
    type: "not_found",
    reason: message,
    duration_ms: req.ctx?.elapsedMs(),
  });
  return res.status(404).json({ error: "Not found", message });
}

export function sendBadRequest(req: Request, res: Response, message: string) {
  req.ctx?.logger.warn("Bad request", {
    type: "bad_request",
    message,
    duration_ms: req.ctx?.elapsedMs(),
  });
  return res.status(400).json({ error: "Bad Request", message });
}

export function sendServerError(
  req: Request,
  res: Response,
  message: string,
  error?: unknown,
) {
  const errorPayload = normalizeError(error);
  const meta = {
    type: "server_error" as const,
    message,
    duration_ms: req.ctx?.elapsedMs(),
    error: errorPayload,
  };

  if (req.ctx?.logger) {
    req.ctx.logger.error("Internal error", meta);
  } else {
    rootLogger.error("Internal error", meta);
  }
  return res.status(500).json({ error: "Internal Server Error", message });
}
