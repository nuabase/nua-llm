import { Request, Response } from "express";
import { logApiCallStart, logApiCallComplete } from "../lib/logger";

/**
 * Logs API call start and completion using request-scoped context.
 * Should be placed after requestContext middleware.
 */
export function apiLogging(service: string) {
  return (req: Request, res: Response, next: Function) => {
    const spanId = req.ctx?.spanId || "unknown";
    const routeLabel =
      req.ctx?.routeLabel ||
      (req.route?.path as string | undefined) ||
      req.path;

    // Start log with essential request metadata
    logApiCallStart(spanId, service, routeLabel, {
      url: req.url,
      method: req.method,
      headers: req.headers,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
      body: req.body,
    });

    // Completion log on finish
    res.on("finish", () => {
      const duration = req.ctx?.elapsedMs ? req.ctx.elapsedMs() : 0;
      logApiCallComplete(spanId, service, routeLabel, { status: res.statusCode }, duration);
    });

    next();
  };
}
