import { Request, Response } from "express";
import { logApiCallStart, logApiCallComplete } from "../lib/logger";
import { sanitizeHeaders } from "../lib/http-utils";

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

    // Start log with sanitized request data
    logApiCallStart(spanId, service, routeLabel, {
      url: req.url,
      method: req.method,
      headers: sanitizeHeaders(req.headers as any),
      body: req.body,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    // Completion log on finish
    res.on("finish", () => {
      const duration = req.ctx?.elapsedMs ? req.ctx.elapsedMs() : 0;
      const responseMeta: any = {
        status: res.statusCode,
      };
      logApiCallComplete(spanId, service, routeLabel, responseMeta, duration);
    });

    next();
  };
}
